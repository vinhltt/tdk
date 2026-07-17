import { afterEach, describe, expect, it } from 'bun:test';
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { extractFrontmatter } from '../src/commands/util/parse-plan-frontmatter';
import { parsePhasesTable } from '../src/commands/util/phases-table-parser';
import { validateSpecificationQualityGate } from '../src/commands/util/specification-quality-gate';

interface CompatibilityRow {
  id: string;
  expected: string;
  ownerPhase: number;
}

const fixture = resolve(import.meta.dir, 'fixtures/artifact-consolidation-compatibility-matrix.json');
const tempDirs: string[] = [];

afterEach(() => {
  for (const dir of tempDirs.splice(0)) rmSync(dir, { recursive: true, force: true });
});

describe('artifact consolidation compatibility baseline', () => {
  it('assigns every compatibility risk to an implementation phase', () => {
    const rows = JSON.parse(readFileSync(fixture, 'utf8')) as CompatibilityRow[];
    expect(rows.map((row) => row.id)).toEqual([
      'new-spec-new-plan',
      'legacy-spec-checklist-new-plan',
      'schema-v3-status-readers',
      'rewrite-and-append',
      'default-fast-hard-tdd-backfill',
      'red-team-and-validate',
      'interrupted-migration',
      'spike-phase-lifecycle',
    ]);
    expect(rows.every((row) => row.expected.length > 0 && row.ownerPhase >= 1 && row.ownerPhase <= 6)).toBe(true);
  });

  it('keeps schema v3 plan frontmatter readable', () => {
    const dir = mkdtempSync(join(tmpdir(), 'tdk-plan-v3-'));
    tempDirs.push(dir);
    const planPath = join(dir, 'plan.md');
    writeFileSync(planPath, '---\ntask_id: AA-123\nstatus: in_progress\nblocks: [BB-200]\nblockedBy: []\nmode: hard\nschema_version: 3\n---\n');

    const result = extractFrontmatter(planPath, 'fallback');
    expect(result?.canonical).toEqual({
      task_id: 'AA-123',
      status: 'in_progress',
      blocks: ['BB-200'],
      blockedBy: [],
      mode: 'hard',
      schema_version: 3,
    });
  });

  it('keeps legacy phase status aliases readable', () => {
    const result = parsePhasesTable(`## Phases

| # | File | Status | Blocks | BlockedBy |
|---|---|---|---|---|
| 01 | [phase-01-old](phases/phase-01-old.md) | pending | 02 | - |
| 02 | [phase-02-old](phases/phase-02-old.md) | completed | - | 01 |
`);

    expect(result.errors).toEqual([]);
    expect(result.phases.map((phase) => phase.status)).toEqual(['todo', 'done']);
  });

  it('keeps legacy checklist fallback read-only', () => {
    const result = validateSpecificationQualityGate('# Legacy spec', { legacyChecklistExists: true });
    expect(result).toMatchObject({ allowed: true, mode: 'legacy' });
  });
});
