// Regression guard: source skill/agent bodies must not carry authoring-time
// product refs or plan back-references into installed artifacts, and bash
// positionals in SKILL.md must reach the model as written.
//
// Source .specify/plugins/ paths are allowed here: TDK source mode needs the
// marketplace tree. Flat Claude installs must rewrite those paths at install time.

import { describe, it, expect } from 'bun:test';
import { readdirSync, readFileSync, existsSync } from 'node:fs';
import { basename, resolve, join } from 'node:path';

const PLUGINS_ROOT = resolve(import.meta.dir, '../../../plugins');

// --- Pattern groups banned from source skill/agent bodies ---

const PATTERN_CK_COMMANDS = /\/ck:|\/ckm:/;
const PATTERN_PLAN_REFS = /plans\/[0-9]{6}-|\.\.\/plans\//;

interface BannedPattern {
  name: string;
  re: RegExp;
}

const BANNED_PATTERNS: BannedPattern[] = [
  { name: '/ck: or /ckm: command', re: PATTERN_CK_COMMANDS },
  { name: 'plans/ date-stamp back-reference', re: PATTERN_PLAN_REFS },
];

// Claude Code replaces `$N` anywhere in a SKILL.md body with the N-th (0-based) skill argument
// before the model reads it, so a bash positional written that way arrives rewritten. It leaves
// `${N}` and `$(N)` alone. References are read verbatim and may contain `$N`, such as prices.
const PATTERN_SKILL_ARGUMENT_TOKEN = /\$\d+(?!\w)/;

// The documented escape only works where the harness removes it: a verbatim reader hands bash the
// literal text `$N`.
const PATTERN_ESCAPED_ARGUMENT_TOKEN = /\\\$\d/;

const SKILL_BODY_PATTERNS: BannedPattern[] = [
  { name: 'replaced by a skill argument: write ${N}, or $(N) inside awk', re: PATTERN_SKILL_ARGUMENT_TOKEN },
  { name: 'escaped $N breaks verbatim readers: write ${N}', re: PATTERN_ESCAPED_ARGUMENT_TOKEN },
];

// Command blocks are copied between SKILL.md and references, so both use the braced form.
const PATTERN_UNBRACED_PROJECT_DIR = /PROJECT_DIR="\$\d/;

const SKILL_MARKDOWN_PATTERNS: BannedPattern[] = [
  { name: 'write PROJECT_DIR="${1}"', re: PATTERN_UNBRACED_PROJECT_DIR },
];

// --- File enumeration helpers ---

function listDir(dir: string): string[] {
  if (!existsSync(dir)) return [];
  return readdirSync(dir, { withFileTypes: true })
    .filter((entry) => entry.isDirectory())
    .map((entry) => entry.name);
}

function collectSkillFiles(pluginsRoot: string): string[] {
  const files: string[] = [];
  for (const plugin of listDir(pluginsRoot)) {
    const skillsDir = join(pluginsRoot, plugin, 'skills');
    for (const skill of listDir(skillsDir)) {
      const skillMd = join(skillsDir, skill, 'SKILL.md');
      if (existsSync(skillMd)) files.push(skillMd);
    }
  }
  return files;
}

function collectSkillMarkdownFiles(pluginsRoot: string): string[] {
  const files: string[] = [];
  for (const plugin of listDir(pluginsRoot)) {
    const skillsDir = join(pluginsRoot, plugin, 'skills');
    if (!existsSync(skillsDir)) continue;
    for (const entry of readdirSync(skillsDir, { recursive: true, encoding: 'utf-8' })) {
      if (entry.endsWith('.md') && !entry.includes('node_modules')) files.push(join(skillsDir, entry));
    }
  }
  return files;
}

function collectAgentFiles(pluginsRoot: string): string[] {
  const files: string[] = [];
  for (const plugin of listDir(pluginsRoot)) {
    const agentsDir = join(pluginsRoot, plugin, 'agents');
    if (!existsSync(agentsDir)) continue;
    for (const entry of readdirSync(agentsDir)) {
      if (entry.endsWith('.md')) files.push(join(agentsDir, entry));
    }
  }
  return files;
}

// --- Violation detection ---

interface Violation {
  file: string;
  line: number;
  text: string;
  pattern: string;
}

function scanFile(filePath: string, patterns: BannedPattern[] = BANNED_PATTERNS): Violation[] {
  const violations: Violation[] = [];
  const lines = readFileSync(filePath, 'utf-8').split('\n');
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i]!;
    for (const { name, re } of patterns) {
      if (re.test(line)) {
        violations.push({ file: filePath, line: i + 1, text: line.trim(), pattern: name });
      }
    }
  }
  return violations;
}

function assertNoViolations(files: string[], label: string, patterns: BannedPattern[] = BANNED_PATTERNS): void {
  const violations = files.flatMap((file) => scanFile(file, patterns));
  if (violations.length === 0) return;

  const report = violations
    .map((violation) => `  ${violation.file}:${violation.line} [${violation.pattern}]\n    ${violation.text}`)
    .join('\n');
  throw new Error(`Found ${violations.length} portability violation(s) in ${label}:\n${report}`);
}

// --- Tests ---

describe('skill-body-portability — source bodies avoid product refs and plan backrefs', () => {
  it('detection regexes correctly match synthetic offending strings', () => {
    expect(PATTERN_CK_COMMANDS.test('Use /ck:plan to start')).toBe(true);
    expect(PATTERN_CK_COMMANDS.test('Use /ckm:design here')).toBe(true);
    expect(PATTERN_CK_COMMANDS.test('Use /tdk:plan here')).toBe(false);

    expect(PATTERN_PLAN_REFS.test('see plans/260613-1234-my-feature/')).toBe(true);
    expect(PATTERN_PLAN_REFS.test('link to ../plans/overview.md')).toBe(true);
    expect(PATTERN_PLAN_REFS.test('see plans/ (no date)')).toBe(false);
  });

  it('SKILL.md bodies under .specify/plugins/ contain no banned patterns', () => {
    const skillFiles = collectSkillFiles(PLUGINS_ROOT);
    expect(skillFiles.length).toBeGreaterThan(0);
    assertNoViolations(skillFiles, 'SKILL.md files');
  });

  it('agent .md bodies under .specify/plugins/ contain no banned patterns', () => {
    const agentFiles = collectAgentFiles(PLUGINS_ROOT);
    expect(agentFiles.length).toBeGreaterThan(0);
    assertNoViolations(agentFiles, 'agent .md files');
  });

  it('source plugin-tree paths are allowed in source bodies', () => {
    expect('.specify/plugins/tdk-core/skills/tdk-plan/SKILL.md').toContain('.specify/plugins/');
    expect(scanFile(join(PLUGINS_ROOT, 'tdk-utils/skills/tdk-skill-guide/SKILL.md'))).toEqual([]);
  });

  it('CHANGELOG.md files and .specify/scripts/ sources are excluded from scan', () => {
    const allFiles = [...collectSkillFiles(PLUGINS_ROOT), ...collectAgentFiles(PLUGINS_ROOT)];
    for (const file of allFiles) {
      expect(file).not.toContain('CHANGELOG');
      expect(file).not.toContain('.specify/scripts/');
    }
  });
});

describe('skill-body-portability — bash positionals survive skill-argument substitution', () => {
  it('patterns separate replaced tokens from the forms that survive', () => {
    for (const replaced of ['PROJECT_DIR="$1"', "awk '!seen[$0]++'", 'echo $10', '1) REMOTE="$1" ;;']) {
      expect(PATTERN_SKILL_ARGUMENT_TOKEN.test(replaced)).toBe(true);
    }
    for (const kept of ['"${1}"', '"${2:-.}"', "awk '!seen[$(0)]++'", '$ARGUMENTS', '"$PROJECT_DIR"', '$1abc']) {
      expect(PATTERN_SKILL_ARGUMENT_TOKEN.test(kept)).toBe(false);
    }

    expect(PATTERN_ESCAPED_ARGUMENT_TOKEN.test('PROJECT_DIR="\\$1"')).toBe(true);
    expect(PATTERN_ESCAPED_ARGUMENT_TOKEN.test('\\$1abc')).toBe(true);
    expect(PATTERN_ESCAPED_ARGUMENT_TOKEN.test('PROJECT_DIR="${1}"')).toBe(false);

    expect(PATTERN_UNBRACED_PROJECT_DIR.test('PROJECT_DIR="$1"')).toBe(true);
    expect(PATTERN_UNBRACED_PROJECT_DIR.test('PROJECT_DIR="${1}"')).toBe(false);
  });

  it('SKILL.md bodies contain no token that a skill argument replaces', () => {
    const skillFiles = collectSkillMarkdownFiles(PLUGINS_ROOT).filter((file) => basename(file) === 'SKILL.md');
    expect(skillFiles.length).toBeGreaterThanOrEqual(collectSkillFiles(PLUGINS_ROOT).length);
    expect(skillFiles.length).toBeGreaterThan(0);
    assertNoViolations(skillFiles, 'SKILL.md files', SKILL_BODY_PATTERNS);
  });

  it('skill markdown writes the project root positional in braces', () => {
    const markdownFiles = collectSkillMarkdownFiles(PLUGINS_ROOT);
    expect(markdownFiles.length).toBeGreaterThan(collectSkillFiles(PLUGINS_ROOT).length);
    assertNoViolations(markdownFiles, 'skill markdown files', SKILL_MARKDOWN_PATTERNS);
  });
});
