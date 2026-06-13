// Regression guard: source skill/agent bodies must not carry authoring-time
// product refs or plan back-references into installed artifacts.
//
// Source .specify/plugins/ paths are allowed here: TDK source mode needs the
// marketplace tree. Flat Claude installs must rewrite those paths at install time.

import { describe, it, expect } from 'bun:test';
import { readdirSync, readFileSync, existsSync } from 'node:fs';
import { resolve, join } from 'node:path';

const PLUGINS_ROOT = resolve(import.meta.dir, '../../../plugins');

// --- Pattern groups banned from source skill/agent bodies ---

const PATTERN_CK_COMMANDS = /\/ck:|\/ckm:/;
const PATTERN_PLAN_REFS = /plans\/[0-9]{6}-|\.\.\/plans\//;

const BANNED_PATTERNS: Array<{ name: string; re: RegExp }> = [
  { name: '/ck: or /ckm: command', re: PATTERN_CK_COMMANDS },
  { name: 'plans/ date-stamp back-reference', re: PATTERN_PLAN_REFS },
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

function scanFile(filePath: string): Violation[] {
  const violations: Violation[] = [];
  const lines = readFileSync(filePath, 'utf-8').split('\n');
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i]!;
    for (const { name, re } of BANNED_PATTERNS) {
      if (re.test(line)) {
        violations.push({ file: filePath, line: i + 1, text: line.trim(), pattern: name });
      }
    }
  }
  return violations;
}

function assertNoViolations(files: string[], label: string): void {
  const violations = files.flatMap((file) => scanFile(file));
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
