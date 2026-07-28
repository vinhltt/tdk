import { afterEach, describe, expect, it } from 'bun:test';
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import {
  inspectParallelPhaseStatuses,
  reconcileParallelPhaseStatusesFromPlan,
  transitionParallelPhaseStatuses,
} from '../src/commands/util/parallel-phase-status-reconciler';

const roots: string[] = [];
function fixture(): { root: string; planPath: string; phasePath: string } {
  const root = mkdtempSync(join(tmpdir(), 'tdk-status-')); roots.push(root);
  const phasePath = join(root, 'phase-01-a.md');
  const planPath = join(root, 'plan.md');
  writeFileSync(phasePath, '---\nphase: 1\nstatus: todo\n---\n# A\n');
  writeFileSync(planPath, '## Phases\n\n| # | File | Status | Blocks | BlockedBy |\n|---|------|--------|--------|-----------|\n| 01 | [A](phase-01-a.md) | todo | — | — |\n');
  return { root, planPath, phasePath };
}

function waveFixture() {
  const value = fixture();
  writeFileSync(join(value.root, 'phase-02-b.md'), '---\nphase: 2\nstatus: in_progress\n---\n# B\n');
  writeFileSync(value.phasePath, readFileSync(value.phasePath, 'utf8').replace('todo', 'in_progress'));
  writeFileSync(value.planPath, readFileSync(value.planPath, 'utf8').replace('| todo |', '| in_progress |')
    + '| 02 | [B](phase-02-b.md) | in_progress | — | — |\n');
  return value;
}
afterEach(() => roots.splice(0).forEach((root) => rmSync(root, { recursive: true, force: true })));

describe('parallel phase status transitions (lease-free)', () => {
  it('performs an exact single transition across plan.md and frontmatter', () => {
    const value = fixture();
    transitionParallelPhaseStatuses({ projectRoot: value.root, planPath: value.planPath, featureDir: value.root,
      transitions: [{ phase: 1, from: 'todo', to: 'in_progress' }] });
    expect(inspectParallelPhaseStatuses(value.root, value.planPath, value.root).mismatches).toEqual([]);
    expect(readFileSync(value.phasePath, 'utf8')).toContain('status: in_progress');
    expect(readFileSync(value.planPath, 'utf8')).toContain('| in_progress |');
  });

  it('completes a full wave from in_progress to done consistently', () => {
    const value = waveFixture();
    transitionParallelPhaseStatuses({ projectRoot: value.root, planPath: value.planPath, featureDir: value.root,
      waveId: 'w1', transitions: [{ phase: 1, from: 'in_progress', to: 'done' }, { phase: 2, from: 'in_progress', to: 'done' }] });
    expect(inspectParallelPhaseStatuses(value.root, value.planPath, value.root).rows.map((row) => row.planStatus)).toEqual(['done', 'done']);
  });

  it('reconciles an explicitly confirmed unjournaled split from plan SoT', () => {
    const value = fixture();
    writeFileSync(value.phasePath, readFileSync(value.phasePath, 'utf8').replace('status: todo', 'status: done'));
    expect(inspectParallelPhaseStatuses(value.root, value.planPath, value.root).mismatches).toEqual([1]);
    expect(reconcileParallelPhaseStatusesFromPlan({ projectRoot: value.root, planPath: value.planPath, featureDir: value.root }).reconciled).toEqual([1]);
    expect(readFileSync(value.phasePath, 'utf8')).toContain('status: todo');
  });

  it('rejects multi-phase singles and non-completion wave transitions', () => {
    const value = waveFixture();
    expect(() => transitionParallelPhaseStatuses({ projectRoot: value.root, planPath: value.planPath, featureDir: value.root, transitions: [
      { phase: 1, from: 'in_progress', to: 'done' },
      { phase: 2, from: 'in_progress', to: 'done' },
    ] })).toThrow('exactly one');
    expect(() => transitionParallelPhaseStatuses({ projectRoot: value.root, planPath: value.planPath, featureDir: value.root, waveId: 'w1', transitions: [
      { phase: 1, from: 'in_progress', to: 'skipped' },
    ] })).toThrow('in_progress to done');
  });

  it('reports a mid-sequence divergence via inspect-status mismatch detection', () => {
    const value = fixture();
    // Simulate a partial write left behind by a real process crash: frontmatter moved, plan.md did not.
    writeFileSync(value.phasePath, readFileSync(value.phasePath, 'utf8').replace('status: todo', 'status: in_progress'));
    expect(inspectParallelPhaseStatuses(value.root, value.planPath, value.root).mismatches).toEqual([1]);
  });
});
