/**
 * Tests for the `transformTextContent(text, {sourcePrefix, targetPrefix})` signature.
 *
 * The previous signature used a component-name Map and protected source plugin paths verbatim.
 * The current signature converts recognized .specify/plugins/... segments via claudeTargetMapper,
 * then blanket-rewrites converted paths + unprotected slices. These tests pin that behavior.
 */

import { describe, expect, test } from 'bun:test';
import { transformTextContent } from '../../src/commands/harness/prefix-transform';

const TDK_TO_PAV = { sourcePrefix: 'tdk-', targetPrefix: 'pav-' };
const TDK_TO_TDK = { sourcePrefix: 'tdk-', targetPrefix: 'tdk-' };
const TDK_TO_ERC = { sourcePrefix: 'tdk-', targetPrefix: 'erc-' };

describe('transformTextContent (new settings-based signature)', () => {
  // ── Prefix-equal no-op ──────────────────────────────────────────────────────

  test('prefix-equal settings: returns text byte-for-byte unchanged', () => {
    const text = 'Use tdk-scout and .specify/plugins/tdk-core/manifest.json in tdk-utils.';
    const result = transformTextContent(text, TDK_TO_TDK);
    // Must be the exact same reference (byte-identical no-op)
    expect(result).toBe(text);
  });

  test('prefix-equal settings: returns empty string unchanged', () => {
    expect(transformTextContent('', TDK_TO_TDK)).toBe('');
  });

  // ── Blanket on unprotected regions ──────────────────────────────────────────

  test('blanket rewrites wildcard-style unprotected tdk- token', () => {
    expect(transformTextContent('/tdk-*', TDK_TO_PAV)).toBe('/pav-*');
  });

  test('blanket rewrites backtick-quoted tdk- token', () => {
    expect(transformTextContent('`tdk-status`', TDK_TO_PAV)).toBe('`pav-status`');
  });

  test('blanket rewrites numeric-suffix tdk- token', () => {
    expect(transformTextContent('tdk-001', TDK_TO_PAV)).toBe('pav-001');
  });

  test('blanket rewrites prose leading tdk- token', () => {
    expect(transformTextContent('Run tdk-specific to continue', TDK_TO_PAV)).toBe('Run pav-specific to continue');
  });

  test('blanket does NOT rewrite letter/digit/hyphen-infix tdk- tokens', () => {
    // Lookbehind (?<![a-z0-9-]): only clean left boundaries (start, '/', backtick, space, '.') match.
    // A preceding letter, digit, or hyphen suppresses the rewrite (no such infix tokens in the corpus today).
    expect(transformTextContent('buildertdk-x', TDK_TO_PAV)).toBe('buildertdk-x');
    expect(transformTextContent('1tdk-x', TDK_TO_PAV)).toBe('1tdk-x');
    expect(transformTextContent('builder-tdk-x', TDK_TO_PAV)).toBe('builder-tdk-x');
  });

  // ── Per-family source-path conversion ────────────────────────────────────────

  test('skills family: drops plugin segment (tdk-utils/skills/tdk-scout/SKILL.md → .claude/skills/pav-scout/SKILL.md)', () => {
    const text = '.specify/plugins/tdk-utils/skills/tdk-scout/SKILL.md';
    expect(transformTextContent(text, TDK_TO_PAV)).toBe('.claude/skills/pav-scout/SKILL.md');
  });

  test('agents family: drops plugin segment', () => {
    const text = '.specify/plugins/tdk-core/agents/tdk-builder/AGENT.md';
    expect(transformTextContent(text, TDK_TO_PAV)).toBe('.claude/agents/pav-builder/AGENT.md');
  });

  test('commands family: drops plugin segment', () => {
    const text = '.specify/plugins/tdk-core/commands/tdk-run/index.ts';
    expect(transformTextContent(text, TDK_TO_PAV)).toBe('.claude/commands/pav-run/index.ts');
  });

  test('lib family: drops plugin segment', () => {
    const text = '.specify/plugins/tdk-core/lib/tdk-shared/utils.ts';
    expect(transformTextContent(text, TDK_TO_PAV)).toBe('.claude/lib/pav-shared/utils.ts');
  });

  test('scripts family: keeps plugin segment', () => {
    const text = '.specify/plugins/tdk-x/scripts/foo.py';
    expect(transformTextContent(text, TDK_TO_PAV)).toBe('.claude/scripts/pav-x/foo.py');
  });

  test('hooks family with non-hooks.json rest: keeps plugin segment', () => {
    const text = '.specify/plugins/tdk-core/hooks/hook-gateway.cjs';
    expect(transformTextContent(text, TDK_TO_PAV)).toBe('.claude/hooks/pav-core/hook-gateway.cjs');
  });

  test('converted path also gets blanket rewrite on the component name inside', () => {
    // .specify/plugins/tdk-utils/skills/tdk-scout → .claude/skills/tdk-scout → blanket → .claude/skills/pav-scout
    const text = '.specify/plugins/tdk-utils/skills/tdk-scout/SKILL.md';
    expect(transformTextContent(text, TDK_TO_PAV)).toBe('.claude/skills/pav-scout/SKILL.md');
  });

  test('leading ./ prefix: ./.specify/plugins/... also converts correctly', () => {
    const text = './.specify/plugins/tdk-utils/skills/tdk-scout/SKILL.md';
    // Output should be .claude/... (no leading ./)
    expect(transformTextContent(text, TDK_TO_PAV)).toBe('.claude/skills/pav-scout/SKILL.md');
  });

  // ── Mapper-undefined: stays verbatim, NO blanket ──────────────────────────

  test('manifest.json: stays verbatim (source ref unchanged)', () => {
    const text = '.specify/plugins/tdk-core/manifest.json';
    expect(transformTextContent(text, TDK_TO_PAV)).toBe('.specify/plugins/tdk-core/manifest.json');
  });

  test('bare plugin dir (no family/rest): stays verbatim', () => {
    const text = '.specify/plugins/tdk-core';
    expect(transformTextContent(text, TDK_TO_PAV)).toBe('.specify/plugins/tdk-core');
  });

  test('hooks/hooks.json: stays verbatim (special-cased undefined in mapper)', () => {
    const text = '.specify/plugins/tdk-core/hooks/hooks.json';
    expect(transformTextContent(text, TDK_TO_PAV)).toBe('.specify/plugins/tdk-core/hooks/hooks.json');
  });

  test('hooks/hooks.json with trailing prose punctuation: stays verbatim, punctuation preserved', () => {
    // Trailing period must be peeled before parsing so mapper still sees hooks.json (undefined)
    const text = '.specify/plugins/tdk-core/hooks/hooks.json.';
    expect(transformTextContent(text, TDK_TO_PAV)).toBe('.specify/plugins/tdk-core/hooks/hooks.json.');
  });

  test('unknown family: stays verbatim', () => {
    const text = '.specify/plugins/tdk-core/unknown/whatever.md';
    expect(transformTextContent(text, TDK_TO_PAV)).toBe('.specify/plugins/tdk-core/unknown/whatever.md');
  });

  // ── Invalid / traversal-like refs: verbatim, no blanket ──────────────────

  test('traversal in rest (scripts/../../x): stays verbatim', () => {
    const text = '.specify/plugins/tdk-core/scripts/../../x';
    expect(transformTextContent(text, TDK_TO_PAV)).toBe('.specify/plugins/tdk-core/scripts/../../x');
  });

  test('traversal in rest (hooks/../x): stays verbatim', () => {
    const text = '.specify/plugins/tdk-core/hooks/../x';
    expect(transformTextContent(text, TDK_TO_PAV)).toBe('.specify/plugins/tdk-core/hooks/../x');
  });

  test('backslash in source ref: stays verbatim', () => {
    const text = '.specify/plugins/tdk-core/scripts/foo\\bar.py';
    expect(transformTextContent(text, TDK_TO_PAV)).toBe('.specify/plugins/tdk-core/scripts/foo\\bar.py');
  });

  test('absolute-looking rest: stays verbatim (any segment that is . or ..)', () => {
    const text = '.specify/plugins/tdk-core/scripts/../evil.py';
    expect(transformTextContent(text, TDK_TO_PAV)).toBe('.specify/plugins/tdk-core/scripts/../evil.py');
  });

  // ── Mixed text with protected and unprotected regions ────────────────────

  test('mixed: blanket on prose, convert on source path, verbatim on manifest', () => {
    const text = [
      'Use tdk-scout to inspect.',
      'Source: .specify/plugins/tdk-utils/skills/tdk-scout/SKILL.md',
      'Ref: .specify/plugins/tdk-core/manifest.json',
    ].join('\n');
    const result = transformTextContent(text, TDK_TO_PAV);
    expect(result).toContain('Use pav-scout to inspect.');
    expect(result).toContain('.claude/skills/pav-scout/SKILL.md');
    expect(result).toContain('.specify/plugins/tdk-core/manifest.json');
    expect(result).not.toContain('.specify/plugins/pav-core');
    expect(result).not.toContain('.specify/plugins/pav-utils');
  });

  test('erc prefix migration: skills source path', () => {
    const text = '.specify/plugins/tdk-utils/skills/tdk-scout/SKILL.md';
    expect(transformTextContent(text, TDK_TO_ERC)).toBe('.claude/skills/erc-scout/SKILL.md');
  });

  test('source-path conversion then blanket (e.g. prose tdk- after a converted path)', () => {
    // prose tdk- in an unprotected region must still be blanketed
    const text = 'Run tdk-demo from .specify/plugins/tdk-utils/skills/tdk-demo/SKILL.md on /tdk-*';
    const result = transformTextContent(text, TDK_TO_PAV);
    expect(result).toContain('Run pav-demo from');
    expect(result).toContain('.claude/skills/pav-demo/SKILL.md');
    expect(result).toContain('on /pav-*');
  });
});
