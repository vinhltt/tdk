import { describe, expect, it } from 'bun:test';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const IMPLEMENT_SKILL = resolve(
  import.meta.dir,
  '../../../plugins/tdk-core/skills/tdk-implement/SKILL.md',
);

function read(path: string): string {
  return readFileSync(path, 'utf-8');
}

describe('tdk-implement phase selection contract', () => {
  const implementSkill = read(IMPLEMENT_SKILL);

  it('parses args before task-id validation', () => {
    const parseStep = implementSkill.indexOf('### Step 0 — Parse Args');
    const validateStep = implementSkill.indexOf('### Step 0.1 — Validate Task ID');

    expect(parseStep).toBeGreaterThanOrEqual(0);
    expect(validateStep).toBeGreaterThan(parseStep);
    expect(implementSkill).toContain('TASK_ID = first positional token');
    expect(implementSkill).toContain('PHASE_FILTER = optional numeric value');
    expect(implementSkill).toContain('PHASE_FILTER_PRESENT = true when --phase is provided');
  });

  it('documents accepted phase forms and early rejects invalid arguments', () => {
    for (const term of [
      '--phase NN',
      '--phase=NN',
      'unknown flags',
      'duplicate --phase',
      'missing value',
      'non-numeric value',
      'non-positive value',
      'extra positional tokens',
    ]) {
      expect(implementSkill).toContain(term);
    }
  });

  it('validates only the cleaned task id', () => {
    expect(implementSkill).toContain('Invoke `tdk-validate-task-id` with cleaned `TASK_ID`');
    expect(implementSkill).toContain('not raw `$ARGUMENTS`');
    expect(implementSkill).not.toContain('Invoke `tdk-validate-task-id` with `$ARGUMENTS`');
  });

  it('resolves selected phases from parsed rows after global recovery', () => {
    const recovery = implementSkill.indexOf('### Step 4: F3 Recovery Gate');
    const targetRows = implementSkill.indexOf('### Step 5: Resolve Target Rows');

    expect(recovery).toBeGreaterThanOrEqual(0);
    expect(targetRows).toBeGreaterThan(recovery);
    expect(implementSkill).toContain('TARGET_ROWS');
    expect(implementSkill).toContain('PHASE_FILTER_PRESENT');
    expect(implementSkill).toContain('rows.filter(row => row.number === PHASE_FILTER)');
  });

  it('does not use phase number truthiness for selected mode', () => {
    expect(implementSkill).toContain('PHASE_FILTER_PRESENT ? rows.filter(row => row.number === PHASE_FILTER) : rows');
    expect(implementSkill).not.toContain('PHASE_FILTER ? rows.filter(row => row.number === PHASE_FILTER) : rows');
  });

  it('checks dependencies by phase number, not array index', () => {
    expect(implementSkill).toContain('phaseByNumber = new Map(rows.map(row => [row.number, row]))');
    expect(implementSkill).toContain('phaseByNumber.get(id)');
    expect(implementSkill).not.toContain('rows[id].status');
  });

  it('keeps targeted mode serial and preserves global stale in_progress recovery', () => {
    expect(implementSkill).toContain('scan all rows');
    expect(implementSkill).toContain('serial per invocation');
    expect(implementSkill).toContain('parallel phase workers need separate status/recovery design');
  });
});
