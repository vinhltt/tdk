/**
 * Tests for the `transformTextContent(text, {sourcePrefix, targetPrefix})` signature.
 *
 * The previous signature used a component-name Map and protected source plugin paths verbatim.
 * The current signature converts recognized .specify/plugins/... segments via claudeTargetMapper,
 * then blanket-rewrites converted paths + unprotected slices. These tests pin that behavior.
 */

import { describe, expect, test } from 'bun:test';
import { transformTextContent } from '../src/prefix-transform';

const TDK_TO_SAMPLE = { sourcePrefix: 'tdk-', targetPrefix: 'sample-' };
const TDK_TO_TDK = { sourcePrefix: 'tdk-', targetPrefix: 'tdk-' };
const TDK_TO_ERC = { sourcePrefix: 'tdk-', targetPrefix: 'erc-' };
const TDK_TO_ACME = { sourcePrefix: 'tdk-', targetPrefix: 'acme-' };

describe('transformTextContent (new settings-based signature)', () => {
  // ── Prefix-equal path conversion ────────────────────────────────────────────

  test('prefix-equal settings: leaves prose and source-only refs byte-for-byte unchanged', () => {
    const text = 'Use tdk-scout and .specify/plugins/tdk-core/manifest.json in tdk-utils.';
    const result = transformTextContent(text, TDK_TO_TDK);
    expect(result).toBe(text);
  });

  test('prefix-equal settings: returns empty string unchanged', () => {
    expect(transformTextContent('', TDK_TO_TDK)).toBe('');
  });

  test('prefix-equal settings: still converts flat Claude skill reference paths', () => {
    const text = '.specify/plugins/tdk-epic/skills/tdk-task-breakdown/references/task-breakdown-output-contract.md';
    expect(transformTextContent(text, TDK_TO_TDK)).toBe(
      '.claude/skills/tdk-task-breakdown/references/task-breakdown-output-contract.md',
    );
  });

  // ── Blanket on unprotected regions ──────────────────────────────────────────

  test('blanket rewrites wildcard-style unprotected tdk- token', () => {
    expect(transformTextContent('/tdk-*', TDK_TO_SAMPLE)).toBe('/sample-*');
  });

  test('blanket rewrites backtick-quoted tdk- token', () => {
    expect(transformTextContent('`tdk-status`', TDK_TO_SAMPLE)).toBe('`sample-status`');
  });

  test('blanket rewrites numeric-suffix tdk- token', () => {
    expect(transformTextContent('tdk-001', TDK_TO_SAMPLE)).toBe('sample-001');
  });

  test('blanket rewrites prose leading tdk- token', () => {
    expect(transformTextContent('Run tdk-specific to continue', TDK_TO_SAMPLE)).toBe('Run sample-specific to continue');
  });

  test('brand rewrite converts standalone upper and lower brand words', () => {
    expect(transformTextContent('TDK Skill Guide', TDK_TO_SAMPLE)).toBe('SAMPLE Skill Guide');
    expect(transformTextContent('tdk guide', TDK_TO_SAMPLE)).toBe('sample guide');
  });

  test('brand rewrite leaves prefix tokens and runtime placeholders intact', () => {
    const text = 'Run tdk-scout with ${TDK}, ${TDK_SKILL_ROOT}, and TDK_PROJECT_ROOT.';
    const result = transformTextContent(text, TDK_TO_SAMPLE);
    expect(result).toBe('Run sample-scout with ${TDK}, ${TDK_SKILL_ROOT}, and TDK_PROJECT_ROOT.');
  });

  test('brand rewrite is derived from configured target prefix', () => {
    expect(transformTextContent('TDK Skill Guide and tdk guide', TDK_TO_ACME)).toBe('ACME Skill Guide and acme guide');
  });

  test('blanket does NOT rewrite letter/digit/hyphen-infix tdk- tokens', () => {
    // Lookbehind (?<![a-z0-9-]): only clean left boundaries (start, '/', backtick, space, '.') match.
    // A preceding letter, digit, or hyphen suppresses the rewrite (no such infix tokens in the corpus today).
    expect(transformTextContent('buildertdk-x', TDK_TO_SAMPLE)).toBe('buildertdk-x');
    expect(transformTextContent('1tdk-x', TDK_TO_SAMPLE)).toBe('1tdk-x');
    expect(transformTextContent('builder-tdk-x', TDK_TO_SAMPLE)).toBe('builder-tdk-x');
  });

  // ── Per-family source-path conversion ────────────────────────────────────────

  test('skills family: drops plugin segment (tdk-utils/skills/tdk-scout/SKILL.md → .claude/skills/sample-scout/SKILL.md)', () => {
    const text = '.specify/plugins/tdk-utils/skills/tdk-scout/SKILL.md';
    expect(transformTextContent(text, TDK_TO_SAMPLE)).toBe('.claude/skills/sample-scout/SKILL.md');
  });

  test('agents family: drops plugin segment', () => {
    const text = '.specify/plugins/tdk-core/agents/tdk-builder/AGENT.md';
    expect(transformTextContent(text, TDK_TO_SAMPLE)).toBe('.claude/agents/sample-builder/AGENT.md');
  });

  test('commands family: drops plugin segment', () => {
    const text = '.specify/plugins/tdk-core/commands/tdk-run/index.ts';
    expect(transformTextContent(text, TDK_TO_SAMPLE)).toBe('.claude/commands/sample-run/index.ts');
  });

  test('lib family: drops plugin segment', () => {
    const text = '.specify/plugins/tdk-core/lib/tdk-shared/utils.ts';
    expect(transformTextContent(text, TDK_TO_SAMPLE)).toBe('.claude/lib/sample-shared/utils.ts');
  });

  test('scripts family: keeps plugin segment', () => {
    const text = '.specify/plugins/tdk-x/scripts/foo.py';
    expect(transformTextContent(text, TDK_TO_SAMPLE)).toBe('.claude/scripts/sample-x/foo.py');
  });

  test('hooks family with non-hooks.json rest: keeps plugin segment', () => {
    const text = '.specify/plugins/tdk-core/hooks/hook-gateway.cjs';
    expect(transformTextContent(text, TDK_TO_SAMPLE)).toBe('.claude/hooks/sample-core/hook-gateway.cjs');
  });

  test('converted path also gets blanket rewrite on the component name inside', () => {
    // .specify/plugins/tdk-utils/skills/tdk-scout → .claude/skills/tdk-scout → blanket → .claude/skills/sample-scout
    const text = '.specify/plugins/tdk-utils/skills/tdk-scout/SKILL.md';
    expect(transformTextContent(text, TDK_TO_SAMPLE)).toBe('.claude/skills/sample-scout/SKILL.md');
  });

  test('leading ./ prefix: ./.specify/plugins/... also converts correctly', () => {
    const text = './.specify/plugins/tdk-utils/skills/tdk-scout/SKILL.md';
    // Output should be .claude/... (no leading ./)
    expect(transformTextContent(text, TDK_TO_SAMPLE)).toBe('.claude/skills/sample-scout/SKILL.md');
  });

  test('skills family with trailing slash converts and preserves slash', () => {
    const text = '.specify/plugins/tdk-utils/skills/tdk-scout/';
    expect(transformTextContent(text, TDK_TO_SAMPLE)).toBe('.claude/skills/sample-scout/');
  });

  test('placeholder skill and agent refs convert to flat claude paths', () => {
    expect(transformTextContent('.specify/plugins/tdk-scaffold/skills/<name>/', TDK_TO_SAMPLE)).toBe('.claude/skills/<name>/');
    expect(transformTextContent('.specify/plugins/tdk-scaffold/agents/<name>.md', TDK_TO_SAMPLE)).toBe(
      '.claude/agents/<name>.md',
    );
  });

  test('family root source refs convert to flat Claude target roots', () => {
    expect(transformTextContent('.specify/plugins/tdk-scaffold/skills/', TDK_TO_SAMPLE)).toBe('.claude/skills/');
    expect(transformTextContent('.specify/plugins/tdk-core/agents/', TDK_TO_SAMPLE)).toBe('.claude/agents/');
    expect(transformTextContent('.specify/plugins/tdk-core/commands/', TDK_TO_SAMPLE)).toBe('.claude/commands/');
    expect(transformTextContent('.specify/plugins/tdk-core/lib/', TDK_TO_SAMPLE)).toBe('.claude/lib/');
    expect(transformTextContent('.specify/plugins/tdk-core/scripts/', TDK_TO_SAMPLE)).toBe('.claude/scripts/sample-core/');
    expect(transformTextContent('.specify/plugins/tdk-core/hooks/', TDK_TO_SAMPLE)).toBe('.claude/hooks/sample-core/');
  });

  test('prose with skill-family source roots converts to installed skill root', () => {
    const text = '- Skill pattern: an existing `SKILL.md` in `.specify/plugins/tdk-scaffold/skills/` or `.specify/plugins/tdk-core/skills/`.';
    expect(transformTextContent(text, TDK_TO_SAMPLE)).toBe(
      '- Skill pattern: an existing `SKILL.md` in `.claude/skills/` or `.claude/skills/`.',
    );
  });

  // ── Mapper-undefined: stays verbatim, NO blanket ──────────────────────────

  test('manifest.json: stays verbatim (source ref unchanged)', () => {
    const text = '.specify/plugins/tdk-core/manifest.json';
    expect(transformTextContent(text, TDK_TO_SAMPLE)).toBe('.specify/plugins/tdk-core/manifest.json');
  });

  test('bare plugin dir (no family/rest): stays verbatim', () => {
    const text = '.specify/plugins/tdk-core';
    expect(transformTextContent(text, TDK_TO_SAMPLE)).toBe('.specify/plugins/tdk-core');
  });

  test('hooks/hooks.json: stays verbatim (special-cased undefined in mapper)', () => {
    const text = '.specify/plugins/tdk-core/hooks/hooks.json';
    expect(transformTextContent(text, TDK_TO_SAMPLE)).toBe('.specify/plugins/tdk-core/hooks/hooks.json');
  });

  test('hooks/hooks.json with trailing prose punctuation: stays verbatim, punctuation preserved', () => {
    // Trailing period must be peeled before parsing so mapper still sees hooks.json (undefined)
    const text = '.specify/plugins/tdk-core/hooks/hooks.json.';
    expect(transformTextContent(text, TDK_TO_SAMPLE)).toBe('.specify/plugins/tdk-core/hooks/hooks.json.');
  });

  test('unknown family: stays verbatim', () => {
    const text = '.specify/plugins/tdk-core/unknown/whatever.md';
    expect(transformTextContent(text, TDK_TO_SAMPLE)).toBe('.specify/plugins/tdk-core/unknown/whatever.md');
  });

  // ── Invalid / traversal-like refs: verbatim, no blanket ──────────────────

  test('traversal in rest (scripts/../../x): stays verbatim', () => {
    const text = '.specify/plugins/tdk-core/scripts/../../x';
    expect(transformTextContent(text, TDK_TO_SAMPLE)).toBe('.specify/plugins/tdk-core/scripts/../../x');
  });

  test('traversal in rest (hooks/../x): stays verbatim', () => {
    const text = '.specify/plugins/tdk-core/hooks/../x';
    expect(transformTextContent(text, TDK_TO_SAMPLE)).toBe('.specify/plugins/tdk-core/hooks/../x');
  });

  test('backslash in source ref: stays verbatim', () => {
    const text = '.specify/plugins/tdk-core/scripts/foo\\bar.py';
    expect(transformTextContent(text, TDK_TO_SAMPLE)).toBe('.specify/plugins/tdk-core/scripts/foo\\bar.py');
  });

  test('absolute-looking rest: stays verbatim (any segment that is . or ..)', () => {
    const text = '.specify/plugins/tdk-core/scripts/../evil.py';
    expect(transformTextContent(text, TDK_TO_SAMPLE)).toBe('.specify/plugins/tdk-core/scripts/../evil.py');
  });

  // ── Mixed text with protected and unprotected regions ────────────────────

  test('mixed: blanket on prose, convert on source path, verbatim on manifest', () => {
    const text = [
      'Use tdk-scout to inspect.',
      'Source: .specify/plugins/tdk-utils/skills/tdk-scout/SKILL.md',
      'Ref: .specify/plugins/tdk-core/manifest.json',
    ].join('\n');
    const result = transformTextContent(text, TDK_TO_SAMPLE);
    expect(result).toContain('Use sample-scout to inspect.');
    expect(result).toContain('.claude/skills/sample-scout/SKILL.md');
    expect(result).toContain('.specify/plugins/tdk-core/manifest.json');
    expect(result).not.toContain('.specify/plugins/sample-core');
    expect(result).not.toContain('.specify/plugins/sample-utils');
  });

  test('erc prefix migration: skills source path', () => {
    const text = '.specify/plugins/tdk-utils/skills/tdk-scout/SKILL.md';
    expect(transformTextContent(text, TDK_TO_ERC)).toBe('.claude/skills/erc-scout/SKILL.md');
  });

  test('source-path conversion then blanket (e.g. prose tdk- after a converted path)', () => {
    // prose tdk- in an unprotected region must still be blanketed
    const text = 'Run tdk-demo from .specify/plugins/tdk-utils/skills/tdk-demo/SKILL.md on /tdk-*';
    const result = transformTextContent(text, TDK_TO_SAMPLE);
    expect(result).toContain('Run sample-demo from');
    expect(result).toContain('.claude/skills/sample-demo/SKILL.md');
    expect(result).toContain('on /sample-*');
  });
});
