import { afterEach, describe, expect, it } from 'bun:test';
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import {
  inspectParallelPhaseStatuses,
  reconcileParallelPhaseStatusesFromPlan,
  recoverParallelPhaseStatuses,
  transitionParallelPhaseStatuses,
} from '../src/commands/util/parallel-phase-status-reconciler';
import {
  acquireParallelControllerLease,
  recoverParallelControllerLease,
} from '../src/commands/util/parallel-controller-lease';
import { removeParallelControllerTombstone } from '../src/commands/util/parallel-controller-tombstone';

const roots: string[] = [];
function fixture(): { root: string; projectRoot: string; featureDir: string; planPath: string; phasePath: string; lockPath: string; controllerId: string } {
  const root = mkdtempSync(join(tmpdir(), 'tdk-status-wal-')); roots.push(root);
  spawnSync('git', ['init', '-q'], { cwd: root });
  const phasePath = join(root, 'phase-01-a.md');
  const planPath = join(root, 'plan.md');
  writeFileSync(phasePath, '---\nphase: 1\nstatus: todo\n---\n# A\n');
  writeFileSync(planPath, '## Phases\n\n| # | File | Status | Blocks | BlockedBy |\n|---|------|--------|--------|-----------|\n| 01 | [A](phase-01-a.md) | todo | — | — |\n');
  const lease = acquireParallelControllerLease({ projectRoot: root, featureDir: root, taskId: 'feat-1', controllerId: 'c1' });
  if (!lease.ok) throw new Error('lease acquire failed');
  return { root, projectRoot: root, featureDir: root, planPath, phasePath, lockPath: lease.lockPath, controllerId: lease.owner.controllerId };
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

describe('parallel phase status WAL', () => {
  it('performs an exact single transition and clears its journal', () => {
    const value = fixture();
    transitionParallelPhaseStatuses({ ...value, featureDir: value.root, transitions: [{ phase: 1, from: 'todo', to: 'in_progress' }] });
    expect(inspectParallelPhaseStatuses(value.root, value.planPath, value.root).mismatches).toEqual([]);
    expect(readFileSync(value.phasePath, 'utf8')).toContain('status: in_progress');
  });

  it('recovers a crash window according to plan status SoT and stops stable', () => {
    const value = fixture();
    expect(() => transitionParallelPhaseStatuses({
      ...value, featureDir: value.root,
      transitions: [{ phase: 1, from: 'todo', to: 'in_progress' }], crashAt: 'after-frontmatter',
    })).toThrow('injected crash');
    expect(recoverParallelPhaseStatuses({ ...value, featureDir: value.root }).recovered).toBe(true);
    expect(readFileSync(value.phasePath, 'utf8')).toContain('status: todo');
  });

  it('uses one wave intent and never stabilizes partial sibling completion', () => {
    const value = waveFixture();
    expect(() => transitionParallelPhaseStatuses({
      ...value, featureDir: value.root, waveId: 'w1',
      transitions: [{ phase: 1, from: 'in_progress', to: 'done' }, { phase: 2, from: 'in_progress', to: 'done' }],
      crashAt: 'after-frontmatter-1',
    })).toThrow('injected crash');
    recoverParallelPhaseStatuses({ ...value, featureDir: value.root });
    expect(inspectParallelPhaseStatuses(value.root, value.planPath, value.root).rows.map((row) => row.planStatus)).toEqual(['in_progress', 'in_progress']);
  });

  it('recovers every single-transition crash boundary exactly', () => {
    for (const point of ['before-journal', 'after-frontmatter', 'after-plan', 'after-verification']) {
      const value = fixture();
      expect(() => transitionParallelPhaseStatuses({ ...value, featureDir: value.root,
        transitions: [{ phase: 1, from: 'todo', to: 'in_progress' }], crashAt: point })).toThrow('injected crash');
      const recovered = recoverParallelPhaseStatuses({ ...value, featureDir: value.root });
      expect(recovered.recovered).toBe(point !== 'before-journal');
      const expected = point === 'after-plan' || point === 'after-verification' ? 'in_progress' : 'todo';
      expect(inspectParallelPhaseStatuses(value.root, value.planPath, value.root).rows[0]!.planStatus).toBe(expected);
      expect(inspectParallelPhaseStatuses(value.root, value.planPath, value.root).mismatches).toEqual([]);
    }
  });

  it('recovers every wave prefix/cursor/plan crash boundary without partial completion', () => {
    const points = ['after-frontmatter-1', 'after-cursor-1', 'after-frontmatter-2',
      'after-cursor-2', 'after-plan', 'after-verification'];
    for (const point of points) {
      const value = waveFixture();
      expect(() => transitionParallelPhaseStatuses({ ...value, featureDir: value.root, waveId: 'w1',
        transitions: [{ phase: 1, from: 'in_progress', to: 'done' }, { phase: 2, from: 'in_progress', to: 'done' }],
        crashAt: point })).toThrow('injected crash');
      recoverParallelPhaseStatuses({ ...value, featureDir: value.root });
      const expected = point === 'after-plan' || point === 'after-verification'
        ? ['done', 'done'] : ['in_progress', 'in_progress'];
      expect(inspectParallelPhaseStatuses(value.root, value.planPath, value.root).rows.map((row) => row.planStatus)).toEqual(expected);
    }
  });

  it('retries a crash during single and wave recovery idempotently', () => {
    const single = fixture();
    expect(() => transitionParallelPhaseStatuses({ ...single, featureDir: single.root,
      transitions: [{ phase: 1, from: 'todo', to: 'in_progress' }], crashAt: 'after-frontmatter',
    })).toThrow('injected crash');
    expect(() => recoverParallelPhaseStatuses({ ...single, featureDir: single.root,
      crashAt: 'after-recovery-phase-1' })).toThrow('injected crash');
    expect(recoverParallelPhaseStatuses({ ...single, featureDir: single.root }).recovered).toBe(true);
    expect(inspectParallelPhaseStatuses(single.root, single.planPath, single.root).mismatches).toEqual([]);

    const wave = waveFixture();
    expect(() => transitionParallelPhaseStatuses({ ...wave, featureDir: wave.root, waveId: 'w1',
      transitions: [{ phase: 1, from: 'in_progress', to: 'done' },
        { phase: 2, from: 'in_progress', to: 'done' }], crashAt: 'after-frontmatter-2',
    })).toThrow('injected crash');
    expect(() => recoverParallelPhaseStatuses({ ...wave, featureDir: wave.root,
      crashAt: 'after-recovery-phase-2' })).toThrow('injected crash');
    expect(recoverParallelPhaseStatuses({ ...wave, featureDir: wave.root }).recovered).toBe(true);
    expect(inspectParallelPhaseStatuses(wave.root, wave.planPath, wave.root).mismatches).toEqual([]);
  });

  it('reconciles an explicitly confirmed unjournaled split from plan SoT', () => {
    const value = fixture();
    writeFileSync(value.phasePath, readFileSync(value.phasePath, 'utf8').replace('status: todo', 'status: done'));
    expect(inspectParallelPhaseStatuses(value.root, value.planPath, value.root).mismatches).toEqual([1]);
    expect(reconcileParallelPhaseStatusesFromPlan({ ...value, featureDir: value.root }).reconciled).toEqual([1]);
    expect(readFileSync(value.phasePath, 'utf8')).toContain('status: todo');
  });

  it('rejects multi-phase singles and non-completion wave transitions', () => {
    const value = waveFixture();
    expect(() => transitionParallelPhaseStatuses({ ...value, featureDir: value.root, transitions: [
      { phase: 1, from: 'in_progress', to: 'done' },
      { phase: 2, from: 'in_progress', to: 'done' },
    ] })).toThrow('exactly one');
    expect(() => transitionParallelPhaseStatuses({ ...value, featureDir: value.root, waveId: 'w1', transitions: [
      { phase: 1, from: 'in_progress', to: 'skipped' },
    ] })).toThrow('in_progress to done');
  });

  it('recovers from the old tombstone WAL before clearing recovery evidence', () => {
    const value = fixture();
    expect(() => transitionParallelPhaseStatuses({
      ...value, featureDir: value.root,
      transitions: [{ phase: 1, from: 'todo', to: 'in_progress' }], crashAt: 'after-frontmatter',
    })).toThrow('injected crash');
    const recovered = recoverParallelControllerLease({
      projectRoot: value.root, featureDir: value.root, taskId: 'feat-1',
      expectedControllerId: value.controllerId, controllerId: 'c2',
    });
    expect(recoverParallelPhaseStatuses({
      ...value, controllerId: 'c2', lockPath: recovered.lockPath,
      journalRoot: recovered.tombstonePath, journalControllerId: value.controllerId,
    })).toEqual({ recovered: true });
    expect(readFileSync(value.phasePath, 'utf8')).toContain('status: todo');
    removeParallelControllerTombstone({
      lockPath: recovered.lockPath, tombstonePath: recovered.tombstonePath,
      expectedOldControllerId: value.controllerId, recoveryControllerId: 'c2',
      context: { projectRoot: value.root, featureDir: value.root },
    });
  });
});
