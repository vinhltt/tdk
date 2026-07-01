import * as fs from 'node:fs';
import * as path from 'node:path';
import {
  buildHooksJsonFragment,
  buildWrapperScript,
  convertAgentToCodexToml,
  convertCommandToCodexSkill,
  detectCodexCapabilities,
  wrapperFilename,
} from './lib/harness-transform';
import { sha256Buffer } from './checksum';
import { parseSafeHookGatewayCommand } from './codex-hook-command-parser';
import { isCodexInternalSkillEntrypoint } from './codex-target-mapper';
import type { CodexConvertPlugin, CodexPluginArtifact } from './codex-convert-ir';

function sortObject(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(sortObject);
  if (!value || typeof value !== 'object') return value;
  return Object.fromEntries(Object.entries(value as Record<string, unknown>)
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([key, item]) => [key, sortObject(item)]));
}

function jsonBytes(value: unknown): Buffer {
  return Buffer.from(`${JSON.stringify(sortObject(value), null, 2)}\n`, 'utf-8');
}

function textBytes(value: string): Buffer {
  return Buffer.from(value.endsWith('\n') ? value : `${value}\n`, 'utf-8');
}

function artifact(
  sourcePath: string,
  sourceRelativePath: string,
  artifactRelativePath: string,
  content: Buffer | string,
): CodexPluginArtifact {
  const payload = Buffer.isBuffer(content) ? content : textBytes(content);
  assertSafeCodexPluginArtifactPath(artifactRelativePath);
  return { sourcePath, sourceRelativePath, artifactRelativePath, content: payload };
}

export function assertSafeCodexPluginArtifactPath(relativePath: string): string {
  if (
    path.posix.isAbsolute(relativePath) ||
    relativePath.includes('\\') ||
    relativePath.split('/').includes('..') ||
    relativePath.split('/').includes('.')
  ) {
    throw new Error(`Unsafe codex artifact path: ${relativePath}`);
  }
  // Official layout: only .codex-plugin/plugin.json inside the .codex-plugin dir;
  // skills/hooks/lib live at the package root (no .codex-plugin/ prefix).
  const allowed =
    relativePath === '.codex-plugin/plugin.json' ||
    /^skills\/.+/.test(relativePath) ||
    relativePath === 'hooks/codex-hooks.json' ||
    /^hooks\/.+\.cjs$/.test(relativePath) ||
    /^lib\/.+\.cjs$/.test(relativePath);
  if (!allowed) throw new Error(`Unexpected codex artifact shape: ${relativePath}`);
  return relativePath;
}

function interfaceFrom(plugin: CodexConvertPlugin): Record<string, unknown> {
  if (plugin.interfaceSource) return plugin.interfaceSource;
  if (plugin.legacyInterface) return plugin.legacyInterface;
  return {
    displayName: plugin.name.split('-').map((part) => part ? part[0]!.toUpperCase() + part.slice(1) : part).join(' '),
    shortDescription: plugin.description,
    longDescription: plugin.description,
    developerName: 'Tihon',
    category: 'Development',
    capabilities: ['Skills'],
    defaultPrompt: [`Use ${plugin.name} for this task.`],
    brandColor: '#2563EB',
  };
}

export function ensureInterfaceSidecar(plugin: CodexConvertPlugin): boolean {
  if (plugin.interfaceSource) return false;
  const sidecarPath = path.join(plugin.root, '.claude-plugin', 'interface.json');
  fs.mkdirSync(path.dirname(sidecarPath), { recursive: true });
  fs.writeFileSync(sidecarPath, jsonBytes(interfaceFrom(plugin)));
  return true;
}

function pluginJson(plugin: CodexConvertPlugin, hasHooks: boolean): Record<string, unknown> {
  return {
    name: plugin.name,
    version: plugin.version,
    description: plugin.description,
    ...(plugin.claudePlugin.author ? { author: plugin.claudePlugin.author } : {}),
    ...(plugin.claudePlugin.keywords ? { keywords: plugin.claudePlugin.keywords } : {}),
    skills: './skills/',
    ...(hasHooks ? { hooks: './hooks/codex-hooks.json' } : {}),
    interface: interfaceFrom(plugin),
  };
}

function hookNameFromFile(sourceRelativePath: string): string | undefined {
  const match = sourceRelativePath.match(/^hooks\/([^/]+)\.cjs$/);
  return match?.[1] === 'hook-gateway' ? undefined : match?.[1];
}

export async function buildCodexPluginArtifacts(plugin: CodexConvertPlugin): Promise<{ artifacts: CodexPluginArtifact[]; warnings: string[] }> {
  const artifacts: CodexPluginArtifact[] = [];
  const warnings = [...plugin.warnings];
  const capabilities = await detectCodexCapabilities();

  // Skills: official layout — no .codex-plugin/ prefix
  for (const skill of plugin.skills) {
    for (const file of skill.files) {
      const skillRelativePath = file.sourceRelativePath.split('/').slice(2).join('/');
      if (isCodexInternalSkillEntrypoint(skill.name, skillRelativePath)) continue;
      artifacts.push(artifact(file.sourcePath, file.sourceRelativePath, file.sourceRelativePath, file.content));
    }
  }

  // Agents are install-only; do NOT emit agents/*.toml or config.toml at convert time.
  // Still collect conversion warnings so maintainers see fixable issues on convert.
  for (const agent of plugin.agents) {
    const converted = convertAgentToCodexToml(agent);
    warnings.push(...converted.warnings.map((warning) => `${plugin.name}/${agent.sourceRelativePath}: ${warning}`));
  }

  for (const command of plugin.commands) {
    const converted = convertCommandToCodexSkill({ ...command, segments: command.sourceRelativePath.replace(/^commands\//, '').replace(/\.md$/, '').split('/') });
    warnings.push(...converted.warnings.map((warning) => `${plugin.name}/${command.sourceRelativePath}: ${warning}`));
    if (converted.error) {
      warnings.push(`${plugin.name}/${command.sourceRelativePath}: ${converted.error}`);
      continue;
    }
    // Commands->skills: official layout
    artifacts.push(artifact(command.sourcePath, command.sourceRelativePath, `skills/${converted.name}/SKILL.md`, converted.body));
  }

  // Hooks/lib files: official layout — no .codex-plugin/ prefix
  for (const file of [...plugin.hooks.files, ...plugin.lib]) {
    artifacts.push(artifact(file.sourcePath, file.sourceRelativePath, file.sourceRelativePath, file.content));
  }

  const availableHookNames = new Set(plugin.hooks.files.map((file) => hookNameFromFile(file.sourceRelativePath)).filter((name): name is string => Boolean(name)));
  const hooksByEvent: Record<string, { command: string; timeout?: number; matcher?: string }[]> = {};
  const wrapperByCommand: Record<string, string> = {};
  for (const hook of plugin.hooks.commands) {
    const safe = parseSafeHookGatewayCommand(hook.command, availableHookNames);
    const timeout = hook.timeout ?? 30000;
    const key = `${safe.hookName}\0${timeout}`;
    const invocation = [process.execPath, 'hooks/hook-gateway.cjs', safe.hookName];
    const rawFilename = wrapperFilename([...invocation, `timeout=${timeout}`]);
    const filename = rawFilename.endsWith('.cjs') ? rawFilename : `${rawFilename}.cjs`;
    const wrapperPath = `hooks/wrappers/${filename}`;
    wrapperByCommand[key] = wrapperPath;
    hooksByEvent[hook.event] ??= [];
    hooksByEvent[hook.event]!.push({
      command: key,
      ...(hook.matcher ? { matcher: hook.matcher } : {}),
      ...(hook.timeout === undefined ? {} : { timeout: hook.timeout }),
    });
    const existing = artifacts.some((item) => item.artifactRelativePath === wrapperPath);
    if (!existing) {
      artifacts.push(artifact(
        path.join(plugin.root, 'hooks', 'hooks.json'),
        'hooks/hooks.json',
        wrapperPath,
        buildWrapperScript(invocation, capabilities, timeout),
      ));
    }
  }

  const hasHooks = Object.keys(hooksByEvent).length > 0;
  if (hasHooks) {
    // Codex hook declaration at official location: hooks/codex-hooks.json (NOT hooks.json)
    const fragment = buildHooksJsonFragment(hooksByEvent, wrapperByCommand, plugin.name);
    artifacts.push(artifact(path.join(plugin.root, 'hooks', 'hooks.json'), 'hooks/hooks.json', 'hooks/codex-hooks.json', jsonBytes(fragment)));
  }

  // plugin.json: emitted last so hooks field presence is known
  artifacts.push(artifact(
    path.join(plugin.root, '.claude-plugin', 'plugin.json'),
    '.claude-plugin/plugin.json',
    '.codex-plugin/plugin.json',
    jsonBytes(pluginJson(plugin, hasHooks)),
  ));

  const seen = new Set<string>();
  const duplicates = artifacts.filter((item) => {
    if (seen.has(item.artifactRelativePath)) return true;
    seen.add(item.artifactRelativePath);
    return false;
  });
  if (duplicates.length > 0) throw new Error(`Duplicate generated artifacts: ${duplicates.map((item) => item.artifactRelativePath).join(', ')}`);
  return { artifacts: artifacts.sort((a, b) => a.artifactRelativePath.localeCompare(b.artifactRelativePath)), warnings };
}

export function artifactChecksum(artifact: CodexPluginArtifact): string {
  return sha256Buffer(artifact.content);
}
