import { test, expect } from 'bun:test';
import { spawnSync } from 'node:child_process';
import { join } from 'node:path';

// Scripted CLI smoke: drives check-rules CLI against the Phase-04 fixture
// and asserts JSON contains utRulesFile + utRulesFiles (cascade-shape).
// Other 3 CLIs (plan, generate, auto) require feature-id + featureDir scaffold;
// their cascade wiring shares the same resolveRulesCascade() call shape
// and is type-checked + unit-tested via tests/utils/rules-cascade-snapshot.test.ts.

const SCRIPTS_ROOT = join(import.meta.dir, '..', '..');
const FIXTURE = join(SCRIPTS_ROOT, 'tests', 'fixtures', 'rules-cascade', 'workspace');
const CHECK_RULES_ENTRY = join(SCRIPTS_ROOT, 'src', 'commands', 'ut', 'check-rules.ts');

const CANONICAL_LEVELS = ['global', 'sw-parent', 'sw-own', 'module'] as const;

function runCheckRules(): { ok: boolean; json: Record<string, unknown>; stderr: string } {
  const result = spawnSync('bun', [CHECK_RULES_ENTRY], {
    cwd: FIXTURE,
    encoding: 'utf-8',
    env: { ...process.env },
  });

  const stderr = String(result.stderr ?? '');
  const stdout = String(result.stdout ?? '');

  try {
    const json = JSON.parse(stdout) as Record<string, unknown>;
    return { ok: result.status === 0, json, stderr };
  } catch {
    return { ok: false, json: {}, stderr: `parse fail — stdout: ${stdout}\nstderr: ${stderr}` };
  }
}

test('smoke: check-rules CLI emits utRulesFiles cascade array', () => {
  const { ok, json, stderr } = runCheckRules();

  expect(ok, `CLI exit non-zero. stderr: ${stderr}`).toBe(true);

  expect(typeof json.rulesFile).toBe('string');
  expect((json.rulesFile as string).length).toBeGreaterThan(0);

  const entries = json.utRulesFiles as Array<{ path: string; level: string }>;
  expect(Array.isArray(entries)).toBe(true);
  expect(entries.length).toBeGreaterThanOrEqual(1);

  for (const entry of entries) {
    expect(typeof entry.path).toBe('string');
    expect(entry.path.length).toBeGreaterThan(0);
    expect(CANONICAL_LEVELS).toContain(entry.level as (typeof CANONICAL_LEVELS)[number]);
  }

  // primary should be the most-specific (last) entry's path
  const lastEntry = entries[entries.length - 1]!;
  expect(json.rulesFile).toBe(lastEntry.path);
});
