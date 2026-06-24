import * as fs from 'node:fs';
import * as path from 'node:path';
import { parse } from 'yaml';
import { sha256Buffer } from './checksum';
import { codexPackageRoot } from './codex-package-root';
import { discoverPluginInventory } from './plugin-discovery';
import { isCodexInternalSkillEntrypoint } from './codex-target-mapper';
import type { Manifest } from '../changelog/checks/types';
import type {
  CodexConvertFile,
  CodexConvertFrontmatterFile,
  CodexConvertHookCommand,
  CodexConvertPlugin,
  CodexConvertSkill,
} from './codex-convert-ir';

function readJson<T>(filePath: string): T {
  return JSON.parse(fs.readFileSync(filePath, 'utf-8')) as T;
}

function posixRelative(root: string, filePath: string): string {
  return path.relative(root, filePath).replace(/\\/g, '/');
}

function readFile(root: string, relativePath: string): CodexConvertFile {
  const sourcePath = path.join(root, relativePath);
  const content = fs.readFileSync(sourcePath);
  return { sourcePath, sourceRelativePath: relativePath, content, checksum: sha256Buffer(content) };
}

function parseFrontmatter(content: string): { frontmatter: Record<string, unknown>; body: string } {
  if (!content.startsWith('---\n') && !content.startsWith('---\r\n')) return { frontmatter: {}, body: content };
  const newline = content.startsWith('---\r\n') ? '\r\n' : '\n';
  const end = content.indexOf(`${newline}---${newline}`, 4);
  if (end === -1) return { frontmatter: {}, body: content };
  const parsed = parse(content.slice(4, end));
  return {
    frontmatter: parsed && typeof parsed === 'object' && !Array.isArray(parsed) ? parsed as Record<string, unknown> : {},
    body: content.slice(end + newline.length + 3 + newline.length),
  };
}

function stringField(value: unknown): string | undefined {
  return typeof value === 'string' && value.trim() ? value.trim() : undefined;
}

function frontmatterFile(root: string, relativePath: string): CodexConvertFrontmatterFile {
  const file = readFile(root, relativePath);
  const text = file.content.toString('utf-8');
  const parsed = parseFrontmatter(text);
  const fallback = path.basename(relativePath, path.extname(relativePath));
  return {
    ...file,
    name: stringField(parsed.frontmatter.name) ?? fallback,
    description: stringField(parsed.frontmatter.description),
    frontmatter: parsed.frontmatter,
    body: parsed.body,
  };
}

function parseHookCommands(root: string, hooksJsonPath: string): CodexConvertHookCommand[] {
  if (!fs.existsSync(path.join(root, hooksJsonPath))) return [];
  const raw = readJson<{ hooks?: Record<string, unknown> }>(path.join(root, hooksJsonPath));
  const commands: CodexConvertHookCommand[] = [];
  for (const [event, groups] of Object.entries(raw.hooks ?? {})) {
    if (!Array.isArray(groups)) continue;
    for (const group of groups) {
      if (!group || typeof group !== 'object') continue;
      const matcher = stringField((group as { matcher?: unknown }).matcher);
      const hooks = (group as { hooks?: unknown }).hooks;
      if (!Array.isArray(hooks)) continue;
      for (const hook of hooks) {
        if (!hook || typeof hook !== 'object') continue;
        const command = stringField((hook as { command?: unknown }).command);
        if (!command) continue;
        const timeout = (hook as { timeout?: unknown }).timeout;
        commands.push({
          event,
          ...(matcher ? { matcher } : {}),
          command,
          ...(typeof timeout === 'number' ? { timeout } : {}),
        });
      }
    }
  }
  return commands;
}

function buildSkills(root: string, files: string[]): CodexConvertSkill[] {
  const skillRoots = new Map<string, string[]>();
  for (const file of files.filter((item) => item.startsWith('skills/'))) {
    const skillName = file.split('/')[1];
    if (!skillName) continue;
    const entries = skillRoots.get(skillName) ?? [];
    entries.push(file);
    skillRoots.set(skillName, entries);
  }
  return [...skillRoots.entries()].sort(([a], [b]) => a.localeCompare(b)).map(([name, skillFiles]) => ({
    name,
    files: skillFiles.sort().map((file) => readFile(root, file)),
  }));
}

function optionalJson(filePath: string): Record<string, unknown> | undefined {
  if (!fs.existsSync(filePath)) return undefined;
  const parsed = readJson<Record<string, unknown>>(filePath);
  return parsed && typeof parsed === 'object' && !Array.isArray(parsed) ? parsed : undefined;
}

export function discoverCodexConvertPlugins(consumerRoot: string, selectedPlugins: string[]): CodexConvertPlugin[] {
  const inventory = discoverPluginInventory(consumerRoot, selectedPlugins);
  const manifest = readJson<Manifest>(inventory.manifestPath);
  return inventory.plugins.map((plugin): CodexConvertPlugin => {
    const manifestFiles = Object.keys(manifest.plugins[plugin.name]?.files ?? {}).sort();
    const claudePlugin = readJson<Record<string, unknown>>(path.join(plugin.root, '.claude-plugin', 'plugin.json'));
    // Codex plugin.json now lives in the sibling codex package root (official layout)
    const pkgRoot = codexPackageRoot(consumerRoot, plugin.name);
    const codexPlugin = optionalJson(path.join(pkgRoot, '.codex-plugin', 'plugin.json'));
    const interfaceSource = optionalJson(path.join(plugin.root, '.claude-plugin', 'interface.json'));
    const legacyInterface = codexPlugin?.interface && typeof codexPlugin.interface === 'object' && !Array.isArray(codexPlugin.interface)
      ? codexPlugin.interface as Record<string, unknown>
      : undefined;
    const hookFiles = manifestFiles
      .filter((file) => file.startsWith('hooks/') && file !== 'hooks/hooks.json')
      .map((file) => readFile(plugin.root, file));
    return {
      name: plugin.name,
      version: plugin.version,
      description: stringField(claudePlugin.description) ?? plugin.name,
      root: plugin.root,
      claudePlugin,
      interfaceSource,
      legacyInterface,
      agents: manifestFiles.filter((file) => /^agents\/[^/]+\.md$/.test(file)).map((file) => frontmatterFile(plugin.root, file)),
      commands: manifestFiles.filter((file) => /^commands\/.*\.md$/.test(file)).map((file) => frontmatterFile(plugin.root, file)),
      skills: buildSkills(plugin.root, manifestFiles),
      hooks: {
        commands: parseHookCommands(plugin.root, 'hooks/hooks.json'),
        files: hookFiles,
      },
      lib: manifestFiles.filter((file) => file.startsWith('lib/')).map((file) => readFile(plugin.root, file)),
      warnings: [
        ...inventory.warnings,
        ...(interfaceSource ? [] : [`${plugin.name}: missing .claude-plugin/interface.json; converter will seed one`]),
        // tdk-test-api never has a committed codex package — suppress missing-plugin.json warning for it
        ...(codexPlugin || plugin.name === 'tdk-test-api' ? [] : [`${plugin.name}: missing legacy .codex-plugin/plugin.json`]),
      ],
    };
  });
}

export function listCodexConvertArtifactPaths(plugin: CodexConvertPlugin): string[] {
  // Official layout: .codex-plugin/plugin.json is the only file inside .codex-plugin/;
  // skills/hooks/lib live at the package root (no .codex-plugin/ prefix).
  // agents/*.toml and config.toml are install-only — NOT listed here.
  const paths = new Set<string>(['.codex-plugin/plugin.json']);
  for (const skill of plugin.skills) {
    for (const file of skill.files) {
      const skillRelativePath = file.sourceRelativePath.split('/').slice(2).join('/');
      if (!isCodexInternalSkillEntrypoint(skill.name, skillRelativePath)) paths.add(file.sourceRelativePath);
    }
  }
  for (const file of [...plugin.hooks.files, ...plugin.lib]) paths.add(file.sourceRelativePath);
  if (plugin.hooks.commands.length > 0) {
    paths.add('hooks/codex-hooks.json');
    paths.add('hooks/<generated-wrapper>.cjs');
  }
  return [...paths].sort();
}

export function sourceRelativeFromArtifact(pluginRoot: string, artifactPath: string): string {
  return posixRelative(pluginRoot, artifactPath);
}
