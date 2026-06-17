import { describe, expect, it } from 'bun:test';
import { existsSync, readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';

const IMPLEMENT_SKILL = resolve(
  import.meta.dir,
  '../../../plugins/tdk-core/skills/tdk-implement/SKILL.md',
);
const IMPLEMENT_REFERENCES_DIR = resolve(dirname(IMPLEMENT_SKILL), 'references');

function read(path: string): string {
  return readFileSync(path, 'utf-8');
}

function extractReferenceLoads(skill: string): string[] {
  return Array.from(skill.matchAll(/Load:\s*`(references\/[^`]+\.md)`/g), (match) => {
    const referencePath = match[1];
    expect(referencePath).toBeDefined();
    return referencePath as string;
  });
}

describe('tdk-implement phase selection contract', () => {
  const implementSkill = read(IMPLEMENT_SKILL);
  const implementReferences = extractReferenceLoads(implementSkill).map((referencePath) =>
    read(resolve(IMPLEMENT_REFERENCES_DIR, referencePath.replace('references/', ''))),
  );
  const implementContract = [implementSkill, ...implementReferences].join('\n');

  it('keeps the entrypoint concise and loads real references', () => {
    expect(implementSkill.split('\n').length).toBeLessThanOrEqual(300);
    expect(implementSkill).toContain('## Required Reference Load Contract');

    for (const referencePath of extractReferenceLoads(implementSkill)) {
      const absolutePath = resolve(IMPLEMENT_REFERENCES_DIR, referencePath.replace('references/', ''));

      expect(existsSync(absolutePath), `${referencePath} should exist`).toBe(true);
      expect(read(absolutePath).split('\n')[0]).not.toStartWith('<!-- DO NOT LOAD');
    }
  });

  it('parses args before task-id validation', () => {
    const parseStep = implementSkill.indexOf('### Step 0 — Parse Args');
    const validateStep = implementSkill.indexOf('### Step 0.1 — Validate Task ID');

    expect(parseStep).toBeGreaterThanOrEqual(0);
    expect(validateStep).toBeGreaterThan(parseStep);
    expect(implementContract).toContain('TASK_ID = first positional token');
    expect(implementContract).toContain('PHASE_FILTER = optional numeric value');
    expect(implementContract).toContain('PHASE_FILTER_PRESENT = true when --phase is provided');
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
      expect(implementContract).toContain(term);
    }
  });

  it('validates only the cleaned task id', () => {
    expect(implementContract).toContain('Invoke `tdk-validate-task-id` with cleaned `TASK_ID`');
    expect(implementContract).toContain('not raw `$ARGUMENTS`');
    expect(implementContract).not.toContain('Invoke `tdk-validate-task-id` with `$ARGUMENTS`');
  });

  it('resolves selected phases from parsed rows after global recovery', () => {
    const recovery = implementSkill.indexOf('### Step 4: F3 Recovery Gate');
    const targetRows = implementSkill.indexOf('### Step 5: Resolve Target Rows');

    expect(recovery).toBeGreaterThanOrEqual(0);
    expect(targetRows).toBeGreaterThan(recovery);
    expect(implementContract).toContain('TARGET_ROWS');
    expect(implementContract).toContain('PHASE_FILTER_PRESENT');
    expect(implementContract).toContain('rows.filter(row => row.number === PHASE_FILTER)');
  });

  it('does not use phase number truthiness for selected mode', () => {
    expect(implementContract).toContain('PHASE_FILTER_PRESENT ? rows.filter(row => row.number === PHASE_FILTER) : rows');
    expect(implementContract).not.toContain('PHASE_FILTER ? rows.filter(row => row.number === PHASE_FILTER) : rows');
  });

  it('checks dependencies by phase number, not array index', () => {
    expect(implementContract).toContain('phaseByNumber = new Map(rows.map(row => [row.number, row]))');
    expect(implementContract).toContain('phaseByNumber.get(id)');
    expect(implementContract).not.toContain('rows[id].status');
  });

  it('keeps targeted mode serial and preserves global stale in_progress recovery', () => {
    expect(implementContract).toContain('scan all rows');
    expect(implementContract).toContain('serial per invocation');
    expect(implementContract).toContain('parallel phase workers need separate status/recovery design');
  });
});
