import { afterEach, describe, expect, it } from 'bun:test';
import { mkdirSync, mkdtempSync, renameSync, rmSync, symlinkSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { spawnSync } from 'node:child_process';
import { parseParallelWorkerResult } from '../src/commands/util/parallel-worker-result';
import {
  auditParallelWaveFinal,
  auditParallelWavePostWorker,
  captureParallelWaveBaseline,
  inspectParallelGitTree,
} from '../src/commands/util/parallel-wave-git-audit';

const roots: string[] = [];
function repository(): string {
  const root = mkdtempSync(join(tmpdir(), 'tdk-wave-audit-')); roots.push(root);
  mkdirSync(join(root, 'src')); writeFileSync(join(root, 'src/a.ts'), 'export const a = 1;\n');
  writeFileSync(join(root, 'plan.md'), '# plan\n');
  spawnSync('git', ['init', '-q'], { cwd: root });
  spawnSync('git', ['add', '.'], { cwd: root });
  spawnSync('git', ['-c', 'user.name=TDK', '-c', 'user.email=tdk@example.invalid', 'commit', '-qm', 'base'], { cwd: root });
  return root;
}
afterEach(() => roots.splice(0).forEach((root) => rmSync(root, { recursive: true, force: true })));

function result(changes: Array<{ operation: 'modify' | 'create' | 'delete'; path: string }>) {
  return parseParallelWorkerResult(JSON.stringify({
    schemaVersion: 1, controllerId: 'c1', waveId: 'w1', workerId: 'worker-1', phase: 1,
    status: 'DONE', changes, delegates: [], criteria: [], tests: [], concerns: [], request: null, error: null,
  }), { controllerId: 'c1', waveId: 'w1', workerId: 'worker-1', phase: 1, criteria: [] });
}

const phase = { phase: 1, reads: ['plan.md'], writes: [
  { operation: 'modify' as const, path: 'src/a.ts' },
  { operation: 'create' as const, path: 'src/b.ts' },
] };

describe('parallel wave Git audit', () => {
  it('pins rename-disabled porcelain-v2 and attributes exact worker changes', () => {
    const root = repository();
    const baseline = captureParallelWaveBaseline({ projectRoot: root, protectedPaths: ['plan.md'], phases: [phase] });
    writeFileSync(join(root, 'src/a.ts'), 'export const a = 2;\n');
    const audit = auditParallelWavePostWorker({ projectRoot: root, baseline, results: [result([{ operation: 'modify', path: 'src/a.ts' }])] });
    expect(audit.ok).toBe(true);
    if (!audit.ok) return;
    expect(audit.attribution).toEqual([{ phase: 1, changes: [{ operation: 'modify', path: 'src/a.ts' }] }]);
    expect(auditParallelWaveFinal({ projectRoot: root, baseline: audit.baseline }).ok).toBe(true);
  });

  it('rejects staged, protected, out-of-scope, and post-gate deltas', () => {
    const root = repository();
    const baseline = captureParallelWaveBaseline({ projectRoot: root, protectedPaths: ['plan.md'], phases: [phase] });
    writeFileSync(join(root, 'plan.md'), 'changed\n');
    expect(auditParallelWavePostWorker({ projectRoot: root, baseline, results: [result([])] }).ok).toBe(false);
    writeFileSync(join(root, 'plan.md'), '# plan\n'); writeFileSync(join(root, 'extra.ts'), 'x\n');
    expect(auditParallelWavePostWorker({ projectRoot: root, baseline, results: [result([])] }).ok).toBe(false);
    rmSync(join(root, 'extra.ts')); writeFileSync(join(root, 'src/a.ts'), 'export const a = 2;\n');
    spawnSync('git', ['add', 'src/a.ts'], { cwd: root });
    expect(inspectParallelGitTree(root).errors).toContain('staged change: src/a.ts');
  });

  it('treats a filesystem rename as delete plus create with --no-renames', () => {
    const root = repository();
    const baseline = captureParallelWaveBaseline({ projectRoot: root, protectedPaths: ['plan.md'], phases: [{
      phase: 1, reads: [], writes: [{ operation: 'delete', path: 'src/a.ts' }, { operation: 'create', path: 'src/b.ts' }],
    }] });
    renameSync(join(root, 'src/a.ts'), join(root, 'src/b.ts'));
    const changes = [{ operation: 'delete' as const, path: 'src/a.ts' }, { operation: 'create' as const, path: 'src/b.ts' }];
    expect(auditParallelWavePostWorker({ projectRoot: root, baseline, results: [result(changes)] }).ok).toBe(true);
  });

  it('rejects duplicate worker results, created symlinks, and escaping audit paths', () => {
    const root = repository();
    const baseline = captureParallelWaveBaseline({ projectRoot: root, protectedPaths: ['plan.md'], phases: [phase] });
    writeFileSync(join(root, 'src/a.ts'), 'export const a = 2;\n');
    const workerResult = result([{ operation: 'modify', path: 'src/a.ts' }]);
    expect(auditParallelWavePostWorker({ projectRoot: root, baseline, results: [workerResult, workerResult] }).ok).toBe(false);

    writeFileSync(join(root, 'src/a.ts'), 'export const a = 1;\n');
    symlinkSync('a.ts', join(root, 'src/b.ts'));
    expect(auditParallelWavePostWorker({ projectRoot: root, baseline,
      results: [result([{ operation: 'create', path: 'src/b.ts' }])] }).ok).toBe(false);
    expect(() => captureParallelWaveBaseline({ projectRoot: root, protectedPaths: ['../escape'], phases: [] })).toThrow();
  });

  it('uses the worker schema binary ordering for case-distinct paths', () => {
    const root = repository();
    writeFileSync(join(root, 'src/A.ts'), 'export const upper = 1;\n');
    spawnSync('git', ['add', 'src/A.ts'], { cwd: root });
    spawnSync('git', ['-c', 'user.name=TDK', '-c', 'user.email=tdk@example.invalid', 'commit', '-qm', 'add uppercase'], { cwd: root });
    const baseline = captureParallelWaveBaseline({ projectRoot: root, protectedPaths: ['plan.md'], phases: [{
      phase: 1, reads: [], writes: [
        { operation: 'modify', path: 'src/A.ts' }, { operation: 'modify', path: 'src/a.ts' },
      ],
    }] });
    writeFileSync(join(root, 'src/A.ts'), 'export const upper = 2;\n');
    writeFileSync(join(root, 'src/a.ts'), 'export const a = 2;\n');
    expect(auditParallelWavePostWorker({ projectRoot: root, baseline, results: [result([
      { operation: 'modify', path: 'src/A.ts' }, { operation: 'modify', path: 'src/a.ts' },
    ])] }).ok).toBe(true);
  });

  it('never attests a blocked or needs-context worker', () => {
    const root = repository();
    const baseline = captureParallelWaveBaseline({ projectRoot: root, protectedPaths: ['plan.md'], phases: [phase] });
    const blocked = parseParallelWorkerResult(JSON.stringify({
      schemaVersion: 1, controllerId: 'c1', waveId: 'w1', workerId: 'worker-1', phase: 1,
      status: 'BLOCKED', changes: [], delegates: [], criteria: [], tests: [], concerns: [],
      request: null, error: 'blocked',
    }), { controllerId: 'c1', waveId: 'w1', workerId: 'worker-1', phase: 1, criteria: [] });
    expect(auditParallelWavePostWorker({ projectRoot: root, baseline, results: [blocked] }).ok).toBe(false);
  });
});
