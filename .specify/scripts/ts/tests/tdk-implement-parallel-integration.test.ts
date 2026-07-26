import { afterEach, describe, expect, it } from 'bun:test';
import { cpSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { spawnSync } from 'node:child_process';
import { acquireParallelControllerLease } from '../src/commands/util/parallel-controller-lease';
import { buildPhaseScheduleInputs } from '../src/commands/util/resolve-parallel-phase-wave-input-builder';
import { resolveParallelPhaseWave } from '../src/commands/util/parallel-phase-wave-resolver';
import {
  inspectParallelPhaseStatuses,
  recoverParallelPhaseStatuses,
  transitionParallelPhaseStatuses,
} from '../src/commands/util/parallel-phase-status-reconciler';
import { parsePhasesTable } from '../src/commands/util/phases-table-parser';
import { parseParallelWorkerResult } from '../src/commands/util/parallel-worker-result';
import {
  auditParallelWaveFinal,
  auditParallelWavePostWorker,
  captureParallelWaveBaseline,
} from '../src/commands/util/parallel-wave-git-audit';

const fixtureRoot = join(import.meta.dir, 'fixtures/parallel-controller');
const roots: string[] = [];
function repository() {
  const root = mkdtempSync(join(tmpdir(), 'tdk-parallel-integration-')); roots.push(root);
  mkdirSync(join(root, 'phases')); mkdirSync(join(root, 'src'));
  cpSync(join(fixtureRoot, 'plan-two-phase.md'), join(root, 'plan.md'));
  writeFileSync(join(root, 'src/a.ts'), 'a1\n'); writeFileSync(join(root, 'src/b.ts'), 'b1\n');
  writeFileSync(join(root, 'phases/phase-01-a.md'), '---\nphase: 1\nstatus: todo\nparallel_safe: auto\n---\n\n# Phase A\n\n## Related Code Files\n\n- Modify: `src/a.ts`\n');
  writeFileSync(join(root, 'phases/phase-02-b.md'), '---\nphase: 2\nstatus: todo\nparallel_safe: auto\n---\n\n# Phase B\n\n## Related Code Files\n\n- Modify: `src/b.ts`\n');
  spawnSync('git', ['init', '-q'], { cwd: root }); spawnSync('git', ['add', '.'], { cwd: root });
  spawnSync('git', ['-c', 'user.name=TDK', '-c', 'user.email=tdk@example.invalid', 'commit', '-qm', 'base'], { cwd: root });
  const lease = acquireParallelControllerLease({ projectRoot: root, featureDir: root, taskId: 'feat-1', controllerId: 'c1' });
  if (!lease.ok) throw new Error('lease failed');
  return { root, projectRoot: root, planPath: join(root, 'plan.md'), featureDir: root, lockPath: lease.lockPath, controllerId: 'c1' };
}
afterEach(() => roots.splice(0).forEach((root) => rmSync(root, { recursive: true, force: true })));

function worker(phase: number, status: 'DONE' | 'BLOCKED') {
  const path = `src/${phase === 1 ? 'a' : 'b'}.ts`;
  const raw = JSON.stringify({ schemaVersion: 1, controllerId: 'c1', waveId: 'w1', workerId: `w${phase}`,
    phase, status, changes: [{ operation: 'modify', path }], delegates: [], criteria: [], tests: [],
    concerns: [], request: null, error: status === 'BLOCKED' ? 'failed criterion' : null });
  return parseParallelWorkerResult(raw, { controllerId: 'c1', waveId: 'w1', workerId: `w${phase}`, phase, criteria: [] });
}

describe('tdk-implement parallel helper integration', () => {
  it('feeds planner-safe phase files through the resolver into one controller wave', () => {
    const input = repository();
    const parsed = parsePhasesTable(readFileSync(input.planPath, 'utf8'));
    expect(parsed.errors).toEqual([]);
    const schedule = buildPhaseScheduleInputs(parsed.phases, input.planPath, input.root);
    expect(schedule.errors).toEqual([]);
    expect(resolveParallelPhaseWave(schedule.inputs)).toMatchObject({ ok: true, state: 'wave', wave: [1, 2] });
  });

  it('rejects a full wave and keeps every sibling in_progress on one worker failure', () => {
    const input = repository();
    for (const phase of [1, 2]) transitionParallelPhaseStatuses({ ...input,
      transitions: [{ phase, from: 'todo', to: 'in_progress' }] });
    const phases = [
      { phase: 1, reads: [], writes: [{ operation: 'modify' as const, path: 'src/a.ts' }] },
      { phase: 2, reads: [], writes: [{ operation: 'modify' as const, path: 'src/b.ts' }] },
    ];
    const baseline = captureParallelWaveBaseline({ projectRoot: input.root,
      protectedPaths: ['plan.md', 'phases/phase-01-a.md', 'phases/phase-02-b.md'], phases });
    writeFileSync(join(input.root, 'src/a.ts'), 'a2\n'); writeFileSync(join(input.root, 'src/b.ts'), 'b2\n');
    const audit = auditParallelWavePostWorker({ projectRoot: input.root, baseline,
      results: [worker(1, 'DONE'), worker(2, 'BLOCKED')] });
    expect(audit).toEqual({ ok: false, errors: ['phase 2 worker status is BLOCKED'] });
    expect(inspectParallelPhaseStatuses(input.root, input.planPath, input.root).rows.map((row) => row.planStatus))
      .toEqual(['in_progress', 'in_progress']);
    expect(readFileSync(input.planPath, 'utf8')).not.toContain('| done |');
  });

  it('persists all sibling completion through one wave journal only after final audit', () => {
    const input = repository();
    for (const phase of [1, 2]) transitionParallelPhaseStatuses({ ...input,
      transitions: [{ phase, from: 'todo', to: 'in_progress' }] });
    transitionParallelPhaseStatuses({ ...input, waveId: 'w1', transitions: [
      { phase: 1, from: 'in_progress', to: 'done' }, { phase: 2, from: 'in_progress', to: 'done' },
    ] });
    expect(inspectParallelPhaseStatuses(input.root, input.planPath, input.root).rows.map((row) => row.planStatus)).toEqual(['done', 'done']);
  });

  it('reaches byte-equivalent final artifacts through serial phases and one parallel wave', () => {
    const serial = repository(); const parallel = repository();
    for (const phase of [1, 2]) {
      transitionParallelPhaseStatuses({ ...serial, transitions: [{ phase, from: 'todo', to: 'in_progress' }] });
      writeFileSync(join(serial.root, `src/${phase === 1 ? 'a' : 'b'}.ts`), `${phase === 1 ? 'a' : 'b'}2\n`);
      transitionParallelPhaseStatuses({ ...serial, transitions: [{ phase, from: 'in_progress', to: 'done' }] });
    }
    for (const phase of [1, 2]) transitionParallelPhaseStatuses({ ...parallel,
      transitions: [{ phase, from: 'todo', to: 'in_progress' }] });
    const phases = [
      { phase: 1, reads: [], writes: [{ operation: 'modify' as const, path: 'src/a.ts' }] },
      { phase: 2, reads: [], writes: [{ operation: 'modify' as const, path: 'src/b.ts' }] },
    ];
    const baseline = captureParallelWaveBaseline({ projectRoot: parallel.root,
      protectedPaths: ['plan.md', 'phases/phase-01-a.md', 'phases/phase-02-b.md'], phases });
    writeFileSync(join(parallel.root, 'src/a.ts'), 'a2\n'); writeFileSync(join(parallel.root, 'src/b.ts'), 'b2\n');
    const audit = auditParallelWavePostWorker({ projectRoot: parallel.root, baseline,
      results: [worker(1, 'DONE'), worker(2, 'DONE')] });
    expect(audit.ok).toBe(true);
    if (!audit.ok) return;
    expect(auditParallelWaveFinal({ projectRoot: parallel.root, baseline: audit.baseline }).ok).toBe(true);
    transitionParallelPhaseStatuses({ ...parallel, waveId: 'w1', transitions: [
      { phase: 1, from: 'in_progress', to: 'done' }, { phase: 2, from: 'in_progress', to: 'done' },
    ] });
    for (const path of ['plan.md', 'phases/phase-01-a.md', 'phases/phase-02-b.md', 'src/a.ts', 'src/b.ts']) {
      expect(readFileSync(join(parallel.root, path), 'utf8')).toBe(readFileSync(join(serial.root, path), 'utf8'));
    }
  });

  it('recovers a crash during whole-wave completion without persisting partial sibling success', () => {
    const input = repository();
    for (const phase of [1, 2]) transitionParallelPhaseStatuses({ ...input,
      transitions: [{ phase, from: 'todo', to: 'in_progress' }] });
    expect(() => transitionParallelPhaseStatuses({ ...input, waveId: 'w1', crashAt: 'after-frontmatter-1', transitions: [
      { phase: 1, from: 'in_progress', to: 'done' }, { phase: 2, from: 'in_progress', to: 'done' },
    ] })).toThrow('injected crash');
    expect(inspectParallelPhaseStatuses(input.root, input.planPath, input.root).mismatches).toEqual([1]);
    expect(recoverParallelPhaseStatuses(input)).toEqual({ recovered: true });
    expect(inspectParallelPhaseStatuses(input.root, input.planPath, input.root).rows).toEqual([
      { phase: 1, planStatus: 'in_progress', frontmatterStatus: 'in_progress' },
      { phase: 2, planStatus: 'in_progress', frontmatterStatus: 'in_progress' },
    ]);
  });
});
