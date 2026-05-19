import { test, expect } from 'bun:test';
import { join, sep, normalize } from 'node:path';
import { resolveRulesCascade } from '../../src/utils/index';

// Golden fixture reproduces brainstorm L4+L1 concrete example.
// See: plans/reports/brainstorm-260412-1712-rules-merge-cascade-design.md lines 73-137.
const FIXTURE_ROOT = join(import.meta.dir, '..', 'fixtures', 'rules-cascade', 'workspace');

function pathEndsWith(actual: string, expectedSegments: string[]): boolean {
  const suffix = expectedSegments.join(sep);
  return normalize(actual).endsWith(suffix);
}

test('cascade snapshot: L4 + L1 fixture matches brainstorm golden', () => {
  const result = resolveRulesCascade({
    workspaceRoot: FIXTURE_ROOT,
    docsPath: 'docs',
    ruleSubPath: 'rules/test/ut-rule.md',
    swName: 'api',
    moduleName: 'auth',
  });

  expect(result.entries).toHaveLength(2);
  expect(result.entries[0]!.level).toBe('global');
  expect(result.entries[1]!.level).toBe('module');
  expect(result.primary).toBe(result.entries[1]!.path);

  expect(pathEndsWith(result.entries[0]!.path, ['docs', 'rules', 'test', 'ut-rule.md'])).toBe(true);
  expect(pathEndsWith(result.entries[1]!.path, ['docs', 'sub-workspaces', 'api', 'modules', 'auth', 'rules', 'test', 'ut-rule.md'])).toBe(true);
});

test('cascade snapshot: entries preserved in base->specific read order', () => {
  const result = resolveRulesCascade({
    workspaceRoot: FIXTURE_ROOT,
    docsPath: 'docs',
    ruleSubPath: 'rules/test/ut-rule.md',
    swName: 'api',
    moduleName: 'auth',
  });

  expect(result.entries.map(e => e.level)).toEqual(['global', 'module']);
});
