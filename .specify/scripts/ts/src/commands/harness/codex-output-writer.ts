import * as fs from 'node:fs';
import * as path from 'node:path';
import {
  buildCodexConfigEntry,
  buildHooksJsonFragment,
  buildWrapperScript,
  convertAgentToCodexToml,
  convertCommandToCodexSkill,
  detectCodexCapabilities,
  mergeConfigToml,
  mergeFeaturesFlagToml,
  wrapperFilename,
} from '../../lib/harness-transform';
import { sha256Buffer, sha256File } from './checksum';
import {
  codexAgentTarget,
  codexConfigTarget,
  codexHookFileTarget,
  codexHooksJsonTarget,
  codexHookWrapperTarget,
  codexSkillTarget,
  isCodexInternalSkillEntrypoint,
} from './codex-target-mapper';
import type {
  CodexTargetFile,
  CodexWritePlan,
  FlatClaudeHookCommand,
  FlatClaudeInventory,
} from './flat-claude-types';

function targetPath(consumerRoot: string, targetRelativePath: string): string {
  return path.join(consumerRoot, targetRelativePath);
}

function existingText(consumerRoot: string, targetRelativePath: string): string {
  const filePath = targetPath(consumerRoot, targetRelativePath);
  return fs.existsSync(filePath) ? fs.readFileSync(filePath, 'utf-8') : '';
}

function plannedFile(
  sourcePath: string,
  sourceRelativePath: string,
  targetRelativePath: string,
  content: Buffer | string,
): CodexTargetFile {
  const payload = Buffer.isBuffer(content) ? content : Buffer.from(content, 'utf-8');
  return {
    sourcePath,
    sourceRelativePath,
    targetRelativePath,
    sourceChecksum: fs.existsSync(sourcePath) ? sha256File(sourcePath) : sha256Buffer(payload),
    installedChecksum: sha256Buffer(payload),
    content: payload,
  };
}

function shellInvocation(command: string): string[] {
  return process.platform === 'win32'
    ? ['cmd.exe', '/d', '/s', '/c', command]
    : ['sh', '-c', command];
}

function rewriteHookCommand(command: string): string {
  return command.replace(/\.claude\/hooks\//g, '.codex/hooks/');
}

function mergeHooksJson(existing: string, fragment: Record<string, unknown[]>): string {
  let parsed: Record<string, unknown> = {};
  if (existing.trim()) {
    parsed = JSON.parse(existing) as Record<string, unknown>;
  }
  for (const [event, hooks] of Object.entries(parsed)) {
    if (!Array.isArray(hooks)) continue;
    const unmanaged = hooks.filter((item) => !(item && typeof item === 'object' && (item as { _origin?: unknown })._origin === 'convert-flat'));
    if (unmanaged.length > 0) {
      parsed[event] = unmanaged;
    } else {
      delete parsed[event];
    }
  }
  for (const [event, hooks] of Object.entries(fragment)) {
    const current = Array.isArray(parsed[event]) ? parsed[event] as unknown[] : [];
    parsed[event] = [...current, ...hooks];
  }
  return `${JSON.stringify(parsed, null, 2)}\n`;
}

function hasConvertFlatHook(existing: string): boolean {
  if (!existing.trim()) return false;
  try {
    const parsed = JSON.parse(existing) as Record<string, unknown>;
    return Object.values(parsed).some((hooks) => Array.isArray(hooks)
      && hooks.some((item) => item && typeof item === 'object' && (item as { _origin?: unknown })._origin === 'convert-flat'));
  } catch {
    return false;
  }
}

function hookWrapperKey(hook: FlatClaudeHookCommand): string {
  return `${hook.command}\0${hook.timeout ?? 30000}`;
}

function addUnique(files: CodexTargetFile[], file: CodexTargetFile, warnings: string[]): void {
  const existing = files.find((item) => item.targetRelativePath === file.targetRelativePath);
  if (existing) {
    if (existing.sourceRelativePath === file.sourceRelativePath) {
      existing.content = file.content;
      existing.installedChecksum = file.installedChecksum;
      return;
    }
    if (existing.installedChecksum !== file.installedChecksum) {
      warnings.push(`Skipped duplicate Codex target ${file.targetRelativePath} from ${file.sourceRelativePath}; first source was ${existing.sourceRelativePath}`);
    }
    return;
  }
  files.push(file);
}

export async function buildCodexWritePlan(inventory: FlatClaudeInventory): Promise<CodexWritePlan> {
  const files: CodexTargetFile[] = [];
  const warnings: string[] = [];
  const configEntries: string[] = [];
  const hooksByEvent: Record<string, FlatClaudeHookCommand[]> = {};
  const wrapperByCommand: Record<string, string> = {};
  const capabilities = await detectCodexCapabilities();
  let configContent = existingText(inventory.consumerRoot, codexConfigTarget());
  const existingHooksJson = existingText(inventory.consumerRoot, codexHooksJsonTarget());

  for (const record of inventory.records) {
    if (record.kind === 'agent') {
      const converted = convertAgentToCodexToml(record);
      warnings.push(...converted.warnings);
      addUnique(files, plannedFile(record.sourcePath, record.sourceRelativePath, codexAgentTarget(converted.filename), `${converted.toml}\n`), warnings);
      configEntries.push(buildCodexConfigEntry(record.name, record.description));
    }
    if (record.kind === 'command') {
      const converted = convertCommandToCodexSkill(record);
      warnings.push(...converted.warnings);
      if (converted.error) {
        warnings.push(`Skipped command ${record.sourceRelativePath}: ${converted.error}`);
      } else {
        addUnique(files, plannedFile(record.sourcePath, record.sourceRelativePath, codexSkillTarget(converted.name, 'SKILL.md'), converted.body), warnings);
      }
    }
    if (record.kind === 'skill') {
      for (const skillFile of record.files) {
        if (isCodexInternalSkillEntrypoint(record.skillName, skillFile.skillRelativePath)) continue;
        addUnique(files, plannedFile(
          skillFile.sourcePath,
          skillFile.sourceRelativePath,
          codexSkillTarget(record.skillName, skillFile.skillRelativePath),
          fs.readFileSync(skillFile.sourcePath),
        ), warnings);
      }
    }
    if (record.kind === 'hooks') {
      for (const hookFile of record.files) {
        addUnique(files, plannedFile(
          hookFile.sourcePath,
          hookFile.sourceRelativePath,
          codexHookFileTarget(hookFile.skillRelativePath),
          fs.readFileSync(hookFile.sourcePath),
        ), warnings);
      }
      for (const [event, hooks] of Object.entries(record.hooksByEvent)) {
        hooksByEvent[event] = hooks.map((hook) => ({ ...hook, command: rewriteHookCommand(hook.command) }));
      }
    }
  }

  if (configEntries.length > 0) {
    configContent = mergeConfigToml(configContent, configEntries.sort().join('\n\n'));
    addUnique(files, plannedFile(path.join(inventory.consumerRoot, '.claude/settings.json'), '.claude/settings.json', codexConfigTarget(), configContent), warnings);
  }
  const hasSourceHooks = Object.keys(hooksByEvent).length > 0;
  if (hasSourceHooks) {
    for (const hooks of Object.values(hooksByEvent)) {
      for (const hook of hooks) {
        const invocation = shellInvocation(hook.command);
        const wrapperTarget = codexHookWrapperTarget(wrapperFilename([...invocation, `timeout=${hook.timeout ?? 30000}`]));
        const wrapperRelativeToCodex = wrapperTarget.replace(/^\.codex\//, '');
        wrapperByCommand[hookWrapperKey(hook)] = wrapperRelativeToCodex;
        addUnique(files, plannedFile(
          path.join(inventory.consumerRoot, hook.sourceRelativePath ?? '.claude/settings.json'),
          hook.sourceRelativePath ?? '.claude/settings.json',
          wrapperTarget,
          buildWrapperScript(invocation, capabilities, hook.timeout ?? 30000),
        ), warnings);
      }
    }
    const hooksByWrapperKey = Object.fromEntries(Object.entries(hooksByEvent).map(([event, hooks]) => [
      event,
      hooks.map((hook) => ({ ...hook, command: hookWrapperKey(hook) })),
    ]));
    const fragment = buildHooksJsonFragment(hooksByWrapperKey, wrapperByCommand, 'convert-flat');
    addUnique(files, plannedFile(
      path.join(inventory.consumerRoot, '.claude/settings.json'),
      '.claude/settings.json',
      codexHooksJsonTarget(),
      mergeHooksJson(existingHooksJson, fragment),
    ), warnings);
    configContent = mergeFeaturesFlagToml(configContent);
    addUnique(files, plannedFile(
      path.join(inventory.consumerRoot, '.claude/settings.json'),
      '.claude/settings.json',
      codexConfigTarget(),
      configContent,
    ), warnings);
  } else if (hasConvertFlatHook(existingHooksJson)) {
    addUnique(files, plannedFile(
      path.join(inventory.consumerRoot, '.claude/settings.json'),
      '.claude/settings.json',
      codexHooksJsonTarget(),
      mergeHooksJson(existingHooksJson, {}),
    ), warnings);
  }

  return { files: files.sort((a, b) => a.targetRelativePath.localeCompare(b.targetRelativePath)), warnings, hooksFragment: undefined };
}
