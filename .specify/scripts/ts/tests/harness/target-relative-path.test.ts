import { describe, expect, test } from 'bun:test';
import {
  assertSafeCodexTargetRelativePath,
  assertSafeHarnessTargetRelativePath,
  normalizeTargetRelativePath,
  posixTargetPath,
} from '../../src/commands/harness/target-relative-path';

describe('target relative path helpers', () => {
  test('normalizes backslash paths to POSIX target paths', () => {
    expect(normalizeTargetRelativePath('.codex\\hooks\\foo.cjs')).toBe('.codex/hooks/foo.cjs');
    expect(posixTargetPath('.codex', 'hooks\\wrappers', 'foo.cjs')).toBe('.codex/hooks/wrappers/foo.cjs');
  });

  test('allows Codex output roots and rejects source Claude roots', () => {
    expect(assertSafeCodexTargetRelativePath('.codex/agents/reviewer.toml', 'target')).toBe('.codex/agents/reviewer.toml');
    expect(assertSafeCodexTargetRelativePath('.agents/skills/demo/SKILL.md', 'target')).toBe('.agents/skills/demo/SKILL.md');
    expect(() => assertSafeCodexTargetRelativePath('.claude/agents/reviewer.md', 'target')).toThrow('Unsafe target');
  });

  test('harness safety allows generated roots but blocks traversal', () => {
    expect(assertSafeHarnessTargetRelativePath('.claude/skills/demo/SKILL.md', 'target')).toBe('.claude/skills/demo/SKILL.md');
    expect(assertSafeHarnessTargetRelativePath('.codex/config.toml', 'target')).toBe('.codex/config.toml');
    expect(() => assertSafeHarnessTargetRelativePath('.codex/../CLAUDE.md', 'target')).toThrow('Unsafe target');
  });
});
