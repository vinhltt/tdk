import * as fs from 'node:fs';
import * as path from 'node:path';
import { parse } from 'yaml';
import type {
  FlatClaudeAgentRecord,
  FlatClaudeCommandRecord,
  FlatClaudeHookCommand,
  FlatClaudeHooksRecord,
  FlatClaudeInventory,
  FlatClaudeRecord,
  FlatClaudeSkillFile,
  FlatClaudeSkillRecord,
  UnrecognizedEntry,
} from './flat-claude-types';

function posixRelative(root: string, filePath: string): string {
  return path.relative(root, filePath).replace(/\\/g, '/');
}

function walkFiles(root: string): string[] {
  if (!fs.existsSync(root)) return [];
  const files: string[] = [];
  for (const entry of fs.readdirSync(root, { withFileTypes: true })) {
    const full = path.join(root, entry.name);
    if (entry.isDirectory()) files.push(...walkFiles(full));
    else if (entry.isFile()) files.push(full);
  }
  return files.sort();
}

function parseFrontmatter(content: string): { frontmatter: Record<string, unknown>; body: string } {
  if (!content.startsWith('---\n') && !content.startsWith('---\r\n')) {
    return { frontmatter: {}, body: content };
  }
  const newline = content.startsWith('---\r\n') ? '\r\n' : '\n';
  const end = content.indexOf(`${newline}---${newline}`, 4);
  if (end === -1) return { frontmatter: {}, body: content };
  const raw = content.slice(4, end);
  const parsed = parseFrontmatterYaml(raw);
  return {
    frontmatter: parsed && typeof parsed === 'object' && !Array.isArray(parsed) ? parsed as Record<string, unknown> : {},
    body: content.slice(end + newline.length + 3 + newline.length),
  };
}

function parseFrontmatterYaml(raw: string): unknown {
  try {
    return parse(raw);
  } catch {
    return parseLooseScalarFrontmatter(raw);
  }
}

function parseLooseScalarFrontmatter(raw: string): Record<string, unknown> {
  const result: Record<string, unknown> = {};
  for (const line of raw.split(/\r?\n/)) {
    if (!line.trim() || /^\s/.test(line) || line.trimStart().startsWith('#')) continue;
    const match = line.match(/^([A-Za-z0-9_-]+):\s*(.*)$/);
    if (!match) continue;
    result[match[1]!] = unwrapLooseScalar(match[2]!);
  }
  return result;
}

function unwrapLooseScalar(value: string): string {
  const trimmed = value.trim();
  if (trimmed.length >= 2 && trimmed.startsWith('"') && trimmed.endsWith('"')) {
    try {
      return JSON.parse(trimmed) as string;
    } catch {
      return trimmed.slice(1, -1);
    }
  }
  if (trimmed.length >= 2 && trimmed.startsWith("'") && trimmed.endsWith("'")) {
    return trimmed.slice(1, -1).replace(/''/g, "'");
  }
  return trimmed;
}

function stringField(value: unknown): string | undefined {
  return typeof value === 'string' && value.trim() ? value.trim() : undefined;
}

function commandSegments(relativePath: string): string[] {
  return relativePath
    .replace(/^\.claude\/commands\//, '')
    .replace(/\.md$/, '')
    .split('/')
    .filter(Boolean);
}

function parseHookSettings(settingsPath: string): { hooksByEvent: Record<string, FlatClaudeHookCommand[]>; warnings: string[] } {
  if (!fs.existsSync(settingsPath)) return { hooksByEvent: {}, warnings: [] };
  const raw = JSON.parse(fs.readFileSync(settingsPath, 'utf-8')) as { hooks?: unknown };
  const result: Record<string, FlatClaudeHookCommand[]> = {};
  const warnings: string[] = [];
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) {
    return { hooksByEvent: result, warnings: ['Skipped .claude/settings.json hooks: settings must be an object'] };
  }
  if (!Object.prototype.hasOwnProperty.call(raw, 'hooks')) return { hooksByEvent: result, warnings };
  if (!raw.hooks || typeof raw.hooks !== 'object' || Array.isArray(raw.hooks)) {
    return { hooksByEvent: result, warnings: ['Skipped .claude/settings.json hooks: hooks must be an object'] };
  }
  for (const [event, groups] of Object.entries(raw.hooks)) {
    if (!Array.isArray(groups)) {
      warnings.push(`Skipped hook event ${event}: expected an array of hook groups`);
      continue;
    }
    for (const group of groups) {
      if (!group || typeof group !== 'object') {
        warnings.push(`Skipped hook group in ${event}: expected an object`);
        continue;
      }
      const matcher = stringField((group as { matcher?: unknown }).matcher);
      const hooks = (group as { hooks?: unknown }).hooks;
      if (!Array.isArray(hooks)) {
        warnings.push(`Skipped hook group in ${event}: hooks must be an array`);
        continue;
      }
      for (const hook of hooks) {
        if (!hook || typeof hook !== 'object') {
          warnings.push(`Skipped hook in ${event}: expected an object`);
          continue;
        }
        const hookType = stringField((hook as { type?: unknown }).type);
        if (hookType && hookType !== 'command') {
          warnings.push(`Skipped hook in ${event}: unsupported hook type ${hookType}`);
          continue;
        }
        const command = stringField((hook as { command?: unknown }).command);
        if (!command) {
          warnings.push(`Skipped hook in ${event}: missing command`);
          continue;
        }
        const timeout = (hook as { timeout?: unknown }).timeout;
        (result[event] ??= []).push({
          command,
          ...(typeof timeout === 'number' ? { timeout } : {}),
          ...(matcher ? { matcher } : {}),
          sourceRelativePath: hookSourceFromCommand(command),
        });
      }
    }
  }
  return { hooksByEvent: result, warnings };
}

function hookSourceFromCommand(command: string): string | undefined {
  const match = command.match(/(?:^|\s)(?:"|')?(\.claude\/hooks\/[^"'\s]+)(?:"|')?/);
  return match?.[1];
}

function buildSkill(root: string, mainPath: string, files: string[]): FlatClaudeSkillRecord {
  const relative = posixRelative(root, mainPath);
  const skillName = relative.split('/')[2] ?? path.basename(path.dirname(mainPath));
  const content = fs.readFileSync(mainPath, 'utf-8');
  const parsed = parseFrontmatter(content);
  const skillRoot = `.claude/skills/${skillName}`;
  return {
    kind: 'skill',
    sourcePath: mainPath,
    sourceRelativePath: relative,
    skillName,
    rootRelativePath: skillRoot,
    name: stringField(parsed.frontmatter.name) ?? skillName,
    description: stringField(parsed.frontmatter.description),
    frontmatter: parsed.frontmatter,
    body: parsed.body,
    files: files
      .filter((file) => posixRelative(root, file).startsWith(`${skillRoot}/`))
      .map((file): FlatClaudeSkillFile => ({
        sourcePath: file,
        sourceRelativePath: posixRelative(root, file),
        skillRelativePath: posixRelative(path.join(root, skillRoot), file),
      })),
  };
}

function buildAgent(root: string, sourcePath: string): FlatClaudeAgentRecord {
  const content = fs.readFileSync(sourcePath, 'utf-8');
  const parsed = parseFrontmatter(content);
  const basename = path.basename(sourcePath, '.md');
  return {
    kind: 'agent',
    sourcePath,
    sourceRelativePath: posixRelative(root, sourcePath),
    name: stringField(parsed.frontmatter.name) ?? basename,
    description: stringField(parsed.frontmatter.description),
    frontmatter: parsed.frontmatter,
    body: parsed.body,
  };
}

function buildCommand(root: string, sourcePath: string): FlatClaudeCommandRecord {
  const content = fs.readFileSync(sourcePath, 'utf-8');
  const parsed = parseFrontmatter(content);
  const relative = posixRelative(root, sourcePath);
  const segments = commandSegments(relative);
  return {
    kind: 'command',
    sourcePath,
    sourceRelativePath: relative,
    name: stringField(parsed.frontmatter.name) ?? segments.join('/'),
    description: stringField(parsed.frontmatter.description),
    frontmatter: parsed.frontmatter,
    body: parsed.body,
    segments,
  };
}

export function discoverFlatClaudeInventory(consumerRoot: string): FlatClaudeInventory {
  const claudeRoot = path.join(consumerRoot, '.claude');
  if (!fs.existsSync(claudeRoot)) throw new Error(`No .claude directory found at ${claudeRoot}`);
  const allFiles = walkFiles(claudeRoot);
  const claimed = new Set<string>();
  const records: FlatClaudeRecord[] = [];
  const warnings: string[] = [];

  for (const file of allFiles.filter((item) => /\/\.claude\/skills\/[^/]+\/SKILL\.md$/.test(item.replace(/\\/g, '/')))) {
    try {
      const record = buildSkill(consumerRoot, file, allFiles);
      records.push(record);
      for (const skillFile of record.files) claimed.add(skillFile.sourceRelativePath);
    } catch (err) {
      warnings.push(`Skipped skill ${posixRelative(consumerRoot, file)}: ${(err as Error).message}`);
    }
  }
  for (const file of allFiles.filter((item) => /\/\.claude\/agents\/[^/]+\.md$/.test(item.replace(/\\/g, '/')))) {
    records.push(buildAgent(consumerRoot, file));
    claimed.add(posixRelative(consumerRoot, file));
  }
  for (const file of allFiles.filter((item) => item.replace(/\\/g, '/').includes('/.claude/commands/') && item.endsWith('.md'))) {
    records.push(buildCommand(consumerRoot, file));
    claimed.add(posixRelative(consumerRoot, file));
  }

  const settingsPath = path.join(claudeRoot, 'settings.json');
  if (fs.existsSync(settingsPath)) {
    try {
      const parsedHooks = parseHookSettings(settingsPath);
      warnings.push(...parsedHooks.warnings);
      records.push({
        kind: 'settings',
        sourcePath: settingsPath,
        sourceRelativePath: '.claude/settings.json',
        value: JSON.parse(fs.readFileSync(settingsPath, 'utf-8')),
      });
      claimed.add('.claude/settings.json');
      const hookFiles = allFiles
        .filter((file) => posixRelative(consumerRoot, file).startsWith('.claude/hooks/'))
        .map((file): FlatClaudeSkillFile => ({
          sourcePath: file,
          sourceRelativePath: posixRelative(consumerRoot, file),
          skillRelativePath: posixRelative(path.join(consumerRoot, '.claude/hooks'), file),
        }));
      if (hookFiles.length > 0 || Object.keys(parsedHooks.hooksByEvent).length > 0) {
        records.push({
          kind: 'hooks',
          sourcePath: settingsPath,
          sourceRelativePath: '.claude/settings.json',
          hooksByEvent: parsedHooks.hooksByEvent,
          files: hookFiles,
        } satisfies FlatClaudeHooksRecord);
        for (const hookFile of hookFiles) claimed.add(hookFile.sourceRelativePath);
      }
    } catch (err) {
      warnings.push(`Invalid .claude/settings.json: ${(err as Error).message}`);
    }
  }

  const claudeMd = path.join(consumerRoot, 'CLAUDE.md');
  if (fs.existsSync(claudeMd)) {
    records.push({ kind: 'claude-md', sourcePath: claudeMd, sourceRelativePath: 'CLAUDE.md' });
    claimed.add('CLAUDE.md');
  }

  const unrecognized: UnrecognizedEntry[] = allFiles
    .map((file) => posixRelative(consumerRoot, file))
    .filter((relative) => !claimed.has(relative))
    .map((relative) => ({ path: relative, reason: 'No convert-flat matcher recognized this .claude entry' }));

  return { consumerRoot, records, unrecognized, warnings };
}
