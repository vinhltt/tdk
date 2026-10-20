import { afterEach, describe, expect, it, spyOn } from 'bun:test';
import * as fs from 'node:fs';
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

function lifecycleFixture(root = 'planned', rows: Array<'todo' | 'in_progress' | 'done'> = ['in_progress', 'in_progress']) {
  const dir = mkdtempSync(join(tmpdir(), 'tdk-lifecycle-')); roots.push(dir);
  const planPath = join(dir, 'plan.md'); const specPath = join(dir, 'spec.md');
  rows.forEach((status, index) => writeFileSync(join(dir, `phase-0${index + 1}-p.md`), `---\nphase: ${index + 1}\nstatus: ${status}\n---\n# P\n`));
  writeFileSync(planPath, `---\ntitle: "Sample"\nstatus: ${root}\n---\n\n## Phases\n\n| # | File | Status | Blocks | BlockedBy |\n|---|------|--------|--------|-----------|\n`
    + rows.map((status, index) => `| 0${index + 1} | [P](phase-0${index + 1}-p.md) | ${status} | — | — |\n`).join(''));
  writeFileSync(specPath, `---\nfeature: sample\nstatus: ${root}  # lifecycle\n---\n# Spec\n`);
  return { dir, planPath, specPath };
}

describe('parallel transitions keep plan root and spec lifecycle in sync', () => {
  it('moves plan root and spec to in_progress on the first single transition', () => {
    const value = lifecycleFixture('planned', ['todo', 'todo']);
    const result = transitionParallelPhaseStatuses({ projectRoot: value.dir, planPath: value.planPath, featureDir: value.dir,
      transitions: [{ phase: 1, from: 'todo', to: 'in_progress' }] });
    expect(result).toEqual({ status: 'in_progress', changed: true, warnings: [] });
    expect(readFileSync(value.planPath, 'utf8')).toContain('status: in_progress\n');
    expect(readFileSync(value.specPath, 'utf8')).toContain('status: in_progress  # lifecycle\n');
  });

  it('moves plan root and spec to done when the last wave completes', () => {
    const value = lifecycleFixture('in_progress');
    transitionParallelPhaseStatuses({ projectRoot: value.dir, planPath: value.planPath, featureDir: value.dir, waveId: 'w1',
      transitions: [{ phase: 1, from: 'in_progress', to: 'done' }, { phase: 2, from: 'in_progress', to: 'done' }] });
    expect(readFileSync(value.planPath, 'utf8')).toContain('status: done\n');
    expect(readFileSync(value.specPath, 'utf8')).toContain('status: done  # lifecycle\n');
  });

  it('leaves spec untouched when the root status does not change', () => {
    const value = lifecycleFixture('in_progress', ['in_progress', 'todo']);
    writeFileSync(value.specPath, '---\nstatus: in_progress\n---\nspec bytes\n');
    const result = transitionParallelPhaseStatuses({ projectRoot: value.dir, planPath: value.planPath, featureDir: value.dir,
      transitions: [{ phase: 1, from: 'in_progress', to: 'done' }] });
    expect(result.changed).toBe(false);
    expect(readFileSync(value.specPath, 'utf8')).toBe('---\nstatus: in_progress\n---\nspec bytes\n');
  });

  it('refuses a wave transition when spec bytes drift before the write', () => {
    const value = lifecycleFixture('in_progress');
    const planBefore = readFileSync(value.planPath, 'utf8');
    const realRead = fs.readFileSync;
    let specReads = 0;
    // Drift the spec between the payload read and the pre-write byte check.
    const spy = spyOn(fs, 'readFileSync').mockImplementation(((path: string, encoding: BufferEncoding) => {
      if (path === value.specPath && ++specReads === 2) writeFileSync(value.specPath, '---\nstatus: draft\n---\nedited\n');
      return realRead(path, encoding);
    }) as typeof fs.readFileSync);
    try {
      expect(() => transitionParallelPhaseStatuses({ projectRoot: value.dir, planPath: value.planPath, featureDir: value.dir, waveId: 'w1',
        transitions: [{ phase: 1, from: 'in_progress', to: 'done' }, { phase: 2, from: 'in_progress', to: 'done' }] }))
        .toThrow('status bytes drifted before write');
    } finally { spy.mockRestore(); }
    expect(readFileSync(value.planPath, 'utf8')).toBe(planBefore);
    expect(readFileSync(join(value.dir, 'phase-01-p.md'), 'utf8')).toContain('status: in_progress');
  });

  it('refuses any transition on an archived plan without writing', () => {
    const value = lifecycleFixture('archived', ['todo']);
    const planBefore = readFileSync(value.planPath, 'utf8'); const specBefore = readFileSync(value.specPath, 'utf8');
    expect(() => transitionParallelPhaseStatuses({ projectRoot: value.dir, planPath: value.planPath, featureDir: value.dir,
      transitions: [{ phase: 1, from: 'todo', to: 'in_progress' }] })).toThrow('plan is archived');
    expect(readFileSync(value.planPath, 'utf8')).toBe(planBefore);
    expect(readFileSync(value.specPath, 'utf8')).toBe(specBefore);
    expect(readFileSync(join(value.dir, 'phase-01-p.md'), 'utf8')).toContain('status: todo');
  });

  it('refuses a from-plan reconcile on an archived plan without writing', () => {
    const value = lifecycleFixture('archived', ['done']);
    const phasePath = join(value.dir, 'phase-01-p.md');
    writeFileSync(phasePath, readFileSync(phasePath, 'utf8').replace('status: done', 'status: todo'));
    expect(() => reconcileParallelPhaseStatusesFromPlan({ projectRoot: value.dir, planPath: value.planPath, featureDir: value.dir }))
      .toThrow('plan is archived');
    expect(readFileSync(phasePath, 'utf8')).toContain('status: todo');
  });

  it('warns and still writes the plan when spec.md is missing', () => {
    const value = lifecycleFixture('planned', ['todo']);
    rmSync(value.specPath);
    const result = transitionParallelPhaseStatuses({ projectRoot: value.dir, planPath: value.planPath, featureDir: value.dir,
      transitions: [{ phase: 1, from: 'todo', to: 'in_progress' }] });
    expect(result.warnings).toEqual([`spec.md not found in ${value.dir}; spec status not mirrored`]);
    expect(readFileSync(value.planPath, 'utf8')).toContain('status: in_progress\n');
  });
});
