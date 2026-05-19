import { describe, it, expect, beforeEach, afterEach } from 'bun:test';
import { readFileSync, writeFileSync, mkdtempSync, rmSync, cpSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { parsePhasesTable, updatePhaseStatus } from '../../src/commands/util/phases-table-parser';
import { updatePhaseFrontmatterStatus } from '../../src/commands/util/phase-frontmatter';
import type { PhaseStatus } from '../../src/commands/util/phases-table-parser';

const FIXTURES = join(import.meta.dir, '..', 'fixtures', 'sync-test');

let tmpDir: string;

beforeEach(() => {
  tmpDir = mkdtempSync(join(tmpdir(), 'tdk-sync-test-'));
  cpSync(FIXTURES, tmpDir, { recursive: true });
});

afterEach(() => {
  rmSync(tmpDir, { recursive: true, force: true });
});

function planPath(): string {
  return join(tmpDir, 'plan.md');
}

function phasePath(name: string): string {
  return join(tmpDir, name);
}

function readPlanStatus(phaseNumber: number): string {
  const md = readFileSync(planPath(), 'utf-8');
  const { phases } = parsePhasesTable(md);
  const row = phases.find(p => p.number === phaseNumber);
  return row?.status ?? 'NOT_FOUND';
}

function readFrontmatterStatus(filePath: string): string {
  const content = readFileSync(filePath, 'utf-8');
  const match = content.match(/^status:\s*(\S+)\s*$/m);
  return match?.[1] ?? 'NOT_FOUND';
}

/** Dual-write: phase file first, then plan.md (mirrors SKILL.md contract) */
function dualWrite(phaseFile: string, phaseNumber: number, status: PhaseStatus): void {
  updatePhaseFrontmatterStatus(phaseFile, status);
  const md = readFileSync(planPath(), 'utf-8');
  const updated = updatePhaseStatus(md, phaseNumber, status);
  writeFileSync(planPath(), updated, 'utf-8');
}

describe('sync-phase-status integration', () => {
  it('Phase 01 happy path: todo → in_progress → done', () => {
    const p1 = phasePath('phase-01-foo.md');

    dualWrite(p1, 1, 'in_progress');
    expect(readPlanStatus(1)).toBe('in_progress');
    expect(readFrontmatterStatus(p1)).toBe('in_progress');

    dualWrite(p1, 1, 'done');
    expect(readPlanStatus(1)).toBe('done');
    expect(readFrontmatterStatus(p1)).toBe('done');
  });

  it('Phase 02 UT skip path: todo → skipped', () => {
    const p2 = phasePath('phase-02-bar.md');

    dualWrite(p2, 2, 'skipped');
    expect(readPlanStatus(2)).toBe('skipped');
    expect(readFrontmatterStatus(p2)).toBe('skipped');
  });

  it('Phase 03 sequential: todo → in_progress → done (after deps)', () => {
    const p1 = phasePath('phase-01-foo.md');
    const p3 = phasePath('phase-03-baz.md');

    dualWrite(p1, 1, 'done');
    const p2 = phasePath('phase-02-bar.md');
    dualWrite(p2, 2, 'skipped');

    dualWrite(p3, 3, 'in_progress');
    expect(readPlanStatus(3)).toBe('in_progress');
    expect(readFrontmatterStatus(p3)).toBe('in_progress');

    dualWrite(p3, 3, 'done');
    expect(readPlanStatus(3)).toBe('done');
    expect(readFrontmatterStatus(p3)).toBe('done');
  });

  it('write order: phase file before plan.md (verified by dual-write pattern)', () => {
    const p1 = phasePath('phase-01-foo.md');
    updatePhaseFrontmatterStatus(p1, 'in_progress');
    expect(readFrontmatterStatus(p1)).toBe('in_progress');
    // plan.md still shows todo — proves phase file written independently first
    expect(readPlanStatus(1)).toBe('todo');

    const md = readFileSync(planPath(), 'utf-8');
    const updated = updatePhaseStatus(md, 1, 'in_progress');
    writeFileSync(planPath(), updated, 'utf-8');
    expect(readPlanStatus(1)).toBe('in_progress');
  });

  it('idempotent re-call: no file change on same status', () => {
    const p1 = phasePath('phase-01-foo.md');
    dualWrite(p1, 1, 'done');

    const phaseContentBefore = readFileSync(p1, 'utf-8');
    const planContentBefore = readFileSync(planPath(), 'utf-8');

    dualWrite(p1, 1, 'done');

    expect(readFileSync(p1, 'utf-8')).toBe(phaseContentBefore);
    expect(readFileSync(planPath(), 'utf-8')).toBe(planContentBefore);
  });
});
