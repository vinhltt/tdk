import { afterEach, describe, expect, it } from 'bun:test';
import { createHash } from 'node:crypto';
import {
  chmodSync, existsSync, lstatSync, mkdirSync, mkdtempSync, readFileSync, rmSync, symlinkSync, writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { spawnSync } from 'node:child_process';

const CLI = join(import.meta.dir, '../src/commands/util/parallel-controller.ts');
const RESOLVE_WAVE_CLI = join(import.meta.dir, '../src/commands/util/resolve-parallel-phase-wave.ts');
const roots: string[] = [];
function repository(): string {
  const root = mkdtempSync(join(tmpdir(), 'tdk-controller-cli-')); roots.push(root);
  spawnSync('git', ['init', '-q'], { cwd: root });
  spawnSync('git', ['-c', 'user.name=TDK', '-c', 'user.email=tdk@example.invalid', 'commit', '--allow-empty', '-qm', 'base'], { cwd: root });
  return root;
}
afterEach(() => roots.splice(0).forEach((root) => rmSync(root, { recursive: true, force: true })));

function run(args: string[]) {
  return spawnSync('bun', [CLI, ...args], { encoding: 'utf8' });
}

function writeValidPlannerArtifacts(feature: string): void {
  mkdirSync(join(feature, 'phases'), { recursive: true });
  writeFileSync(join(feature, 'phases/phase-01-a.md'), [
    '---', 'phase: 1', 'status: todo', 'dependencies: []', 'parallel_safe: never',
    'parallel_reason: serial fixture', '---', '', '# Phase A', '',
  ].join('\n'));
  writeFileSync(join(feature, 'plan.md'), [
    '## Phases', '', '| # | File | Status | Blocks | BlockedBy |',
    '|---|------|--------|--------|-----------|',
    '| 01 | [A](phases/phase-01-a.md) | todo | — | — |', '',
  ].join('\n'));
}

describe('parallel-controller CLI', () => {
  it('exposes only the frozen lifecycle operations', () => {
    const result = run(['--help']);
    expect(result.status).toBe(0);
    for (const operation of [
      'acquire', 'reserve', 'recover', 'assert-owner', 'inspect-status', 'reconcile-status',
      'snapshot-plan', 'finalize-plan', 'recover-plan', 'transition-status', 'snapshot-wave',
      'audit-wave', 'release',
    ]) expect(result.stdout).toContain(operation);
    expect(result.stdout).not.toContain('inspect-lease');
  });

  it('emits one compact JSON line and exit 2 for a lease collision', () => {
    const root = repository();
    const base = ['--project-root', root, '--feature-dir', root, '--task-id'];
    const first = run(['acquire', ...base, 'feat-1', '--controller-id', 'c1']);
    expect(first.status).toBe(0);
    expect(first.stdout.split('\n')).toHaveLength(2);
    expect(first.stdout).not.toContain('\n  ');
    const collision = run(['acquire', ...base, 'feat-2', '--controller-id', 'c2']);
    expect(collision.status).toBe(2);
    expect(JSON.parse(collision.stdout).reason).toBe('lease-held');
  });

  it('returns exit 2 when owner fencing rejects an operation', () => {
    const root = repository();
    const result = run(['assert-owner', '--project-root', root, '--feature-dir', root,
      '--controller-id', 'missing']);
    expect(result.status).toBe(2);
    expect(JSON.parse(result.stdout).error).toContain('fenced');
    expect(result.stderr).toContain('fenced');
  });

  it('refuses release while an interrupted verified transition still has a WAL', () => {
    const root = repository();
    writeFileSync(join(root, 'phase-01-a.md'), '---\nphase: 1\nstatus: todo\n---\n# A\n');
    writeFileSync(join(root, 'plan.md'), '## Phases\n\n| # | File | Status | Blocks | BlockedBy |\n|---|------|--------|--------|-----------|\n| 01 | [A](phase-01-a.md) | todo | — | — |\n');
    const common = ['--project-root', root, '--feature-dir', root];
    const acquired = JSON.parse(run(['reserve', ...common, '--task-id', 'feat-1',
      '--purpose', 'serial-implement', '--controller-id', 'c1']).stdout);
    const inputPath = join(acquired.lockPath, 'transition-input.json');
    writeFileSync(inputPath, JSON.stringify({ controllerId: 'c1', crashAt: 'after-verification',
      transitions: [{ phase: 1, from: 'todo', to: 'in_progress' }] }));
    expect(run(['transition-status', ...common, '--controller-id', 'c1', '--input-json', inputPath]).status).toBe(2);
    expect(run(['release', ...common, '--controller-id', 'c1']).status).toBe(2);
    expect(existsSync(join(acquired.lockPath, 'transition.json'))).toBe(true);
  });

  it('runs transition, snapshot, post-worker audit, and final audit through JSON files under the lease', () => {
    const root = repository();
    writeFileSync(join(root, 'phase-01-a.md'), '---\nphase: 1\nstatus: todo\n---\n# A\n');
    writeFileSync(join(root, 'plan.md'), '## Phases\n\n| # | File | Status | Blocks | BlockedBy |\n|---|------|--------|--------|-----------|\n| 01 | [A](phase-01-a.md) | todo | — | — |\n');
    writeFileSync(join(root, 'a.ts'), 'a1\n');
    spawnSync('git', ['add', '.'], { cwd: root });
    spawnSync('git', ['-c', 'user.name=TDK', '-c', 'user.email=tdk@example.invalid', 'commit', '-qm', 'base'], { cwd: root });
    const common = ['--project-root', root, '--feature-dir', root];
    const acquired = JSON.parse(run(['acquire', ...common, '--task-id', 'feat-1', '--controller-id', 'c1']).stdout);
    const lock = acquired.lockPath as string;
    const transitionInput = join(lock, 'transition-input.json');
    writeFileSync(transitionInput, JSON.stringify({ controllerId: 'c1', transitions: [{ phase: 1, from: 'todo', to: 'in_progress' }] }));
    expect(run(['transition-status', ...common, '--controller-id', 'c1', '--input-json', transitionInput]).status).toBe(0);
    expect(run(['release', ...common, '--controller-id', 'c1']).status).toBe(2);
    const snapshotInput = join(lock, 'snapshot-input.json');
    writeFileSync(snapshotInput, JSON.stringify({ controllerId: 'c1', waveId: 'w1', protectedPaths: ['plan.md', 'phase-01-a.md'],
      phases: [{ phase: 1, reads: [], writes: [{ operation: 'modify', path: 'a.ts' }] }] }));
    expect(run(['snapshot-wave', ...common, '--controller-id', 'c1', '--input-json', snapshotInput]).status).toBe(0);
    expect(run(['release', ...common, '--controller-id', 'c1']).status).toBe(2);
    writeFileSync(join(root, 'a.ts'), 'a2\n');
    const resultPath = join(lock, 'worker-1.json');
    writeFileSync(resultPath, JSON.stringify({ schemaVersion: 1, controllerId: 'c1', waveId: 'w1', workerId: 'worker-1',
      phase: 1, status: 'DONE', changes: [{ operation: 'modify', path: 'a.ts' }], delegates: [], criteria: [],
      tests: [], concerns: [], request: null, error: null }));
    const auditInput = join(lock, 'audit-input.json');
    writeFileSync(auditInput, JSON.stringify({ controllerId: 'c1', workers: [{ resultPath,
      expected: { controllerId: 'c1', waveId: 'w1', workerId: 'worker-1', phase: 1, criteria: [] } }] }));
    expect(run(['audit-wave', ...common, '--controller-id', 'c1', '--stage', 'post-worker', '--input-json', auditInput]).status).toBe(0);
    expect(run(['audit-wave', ...common, '--controller-id', 'c1', '--stage', 'final']).status).toBe(0);
    expect(run(['release', ...common, '--controller-id', 'c1']).status).toBe(2);
    writeFileSync(join(root, 'extra.ts'), 'late\n');
    expect(run(['audit-wave', ...common, '--controller-id', 'c1', '--stage', 'final']).status).toBe(2);
    rmSync(join(root, 'extra.ts'));
    expect(run(['audit-wave', ...common, '--controller-id', 'c1', '--stage', 'final']).status).toBe(0);
    writeFileSync(transitionInput, JSON.stringify({ controllerId: 'c1', waveId: 'w1',
      transitions: [{ phase: 1, from: 'in_progress', to: 'done' }] }));
    expect(run(['transition-status', ...common, '--controller-id', 'c1', '--input-json', transitionInput]).status).toBe(0);
    expect(existsSync(join(lock, 'mutation-state.json'))).toBe(false);
    expect(existsSync(join(lock, 'wave-baseline.json'))).toBe(false);
    expect(run(['release', ...common, '--controller-id', 'c1']).status).toBe(0);
  });

  it('persists and idempotently restores a planner snapshot before release', () => {
    const root = repository(); const feature = join(root, 'feature'); mkdirSync(feature);
    writeFileSync(join(feature, 'note.md'), 'before\n');
    mkdirSync(join(feature, 'readonly')); writeFileSync(join(feature, 'readonly/value.md'), 'fixed\n');
    chmodSync(join(feature, 'readonly'), 0o555);
    mkdirSync(join(root, '.specify/configurations/custom-workflow'), { recursive: true });
    const routingPath = '.specify/configurations/custom-workflow/plan-skill-routing.md';
    writeFileSync(join(root, routingPath), 'route-before\n');
    const common = ['--project-root', root, '--feature-dir', feature];
    const acquired = JSON.parse(run(['reserve', ...common, '--task-id', 'feat-1',
      '--purpose', 'planner', '--controller-id', 'c1']).stdout);
    const snapshotInput = join(acquired.lockPath, 'snapshot-input.json');
    writeFileSync(snapshotInput, JSON.stringify({ controllerId: 'c1', externalPaths: [routingPath] }));
    expect(run(['snapshot-plan', ...common, '--controller-id', 'c1', '--input-json', snapshotInput]).status).toBe(0);
    writeFileSync(join(feature, 'note.md'), 'after\n'); writeFileSync(join(feature, 'orphan.md'), 'orphan\n');
    writeFileSync(join(root, routingPath), 'route-after\n');
    expect(run(['release', ...common, '--controller-id', 'c1']).status).toBe(2);
    expect(run(['finalize-plan', ...common, '--controller-id', 'c1']).status).toBe(2);
    expect(existsSync(join(acquired.lockPath, 'planner-snapshot.json'))).toBe(true);
    expect(run(['recover-plan', ...common, '--controller-id', 'c1', '--crash-at', 'after-file-1']).status).toBe(2);
    const recovery = run(['recover-plan', ...common, '--controller-id', 'c1']);
    if (recovery.status !== 0) throw new Error(`${recovery.stdout}${recovery.stderr}`);
    expect(readFileSync(join(feature, 'note.md'), 'utf8')).toBe('before\n');
    expect(readFileSync(join(root, routingPath), 'utf8')).toBe('route-before\n');
    expect(lstatSync(join(feature, 'readonly')).mode & 0o777).toBe(0o555);
    chmodSync(join(feature, 'readonly'), 0o755);
    expect(existsSync(join(feature, 'orphan.md'))).toBe(false);
    expect(existsSync(join(acquired.lockPath, 'planner-snapshot.json'))).toBe(false);
    expect(run(['release', ...common, '--controller-id', 'c1']).status).toBe(0);
  });

  it('requires planner rollback before a recovered controller can release', () => {
    const root = repository(); const feature = join(root, 'feature'); mkdirSync(feature);
    writeFileSync(join(feature, 'note.md'), 'before\n');
    const common = ['--project-root', root, '--feature-dir', feature];
    const acquired = JSON.parse(run(['reserve', ...common, '--task-id', 'feat-1',
      '--purpose', 'planner', '--controller-id', 'c1']).stdout);
    const snapshotInput = join(acquired.lockPath, 'snapshot-input.json');
    writeFileSync(snapshotInput, JSON.stringify({ controllerId: 'c1', externalPaths: [] }));
    run(['snapshot-plan', ...common, '--controller-id', 'c1', '--input-json', snapshotInput]);
    writeFileSync(join(feature, 'orphan.md'), 'orphan\n');
    expect(run(['recover', ...common, '--task-id', 'feat-1', '--expected-controller-id', 'c1',
      '--controller-id', 'c2']).status).toBe(0);
    expect(run(['release', ...common, '--controller-id', 'c2']).status).toBe(2);
    expect(run(['reconcile-status', ...common, '--controller-id', 'c2', '--old-controller-id', 'c1']).status).toBe(2);
    const recovery = run(['recover-plan', ...common, '--controller-id', 'c2', '--old-controller-id', 'c1']);
    if (recovery.status !== 0) throw new Error(`${recovery.stdout}${recovery.stderr}`);
    expect(existsSync(join(feature, 'orphan.md'))).toBe(false);
    expect(run(['release', ...common, '--controller-id', 'c2']).status).toBe(0);
  });

  it('retains planner evidence for an undeclared mutation outside the feature', () => {
    const root = repository(); const feature = join(root, 'feature'); mkdirSync(feature);
    writeFileSync(join(feature, 'note.md'), 'before\n');
    const common = ['--project-root', root, '--feature-dir', feature];
    const acquired = JSON.parse(run(['reserve', ...common, '--task-id', 'feat-1',
      '--purpose', 'planner', '--controller-id', 'c1']).stdout);
    const input = join(acquired.lockPath, 'snapshot-input.json');
    writeFileSync(input, JSON.stringify({ controllerId: 'c1', externalPaths: [] }));
    expect(run(['snapshot-plan', ...common, '--controller-id', 'c1', '--input-json', input]).status).toBe(0);
    writeFileSync(join(root, 'outside-orphan.md'), 'orphan\n');
    expect(run(['recover-plan', ...common, '--controller-id', 'c1']).status).toBe(2);
    expect(existsSync(join(acquired.lockPath, 'planner-snapshot.json'))).toBe(true);
    expect(run(['release', ...common, '--controller-id', 'c1']).status).toBe(2);
  });

  it('retains planner evidence when an already-dirty outside file changes again', () => {
    const root = repository(); const feature = join(root, 'feature'); mkdirSync(feature);
    writeFileSync(join(feature, 'note.md'), 'before\n');
    writeFileSync(join(root, 'outside.md'), 'clean\n');
    spawnSync('git', ['add', 'outside.md'], { cwd: root });
    spawnSync('git', ['-c', 'user.name=TDK', '-c', 'user.email=tdk@example.invalid',
      'commit', '-qm', 'outside'], { cwd: root });
    writeFileSync(join(root, 'outside.md'), 'dirty-before\n');
    const common = ['--project-root', root, '--feature-dir', feature];
    const acquired = JSON.parse(run(['reserve', ...common, '--task-id', 'feat-1',
      '--purpose', 'planner', '--controller-id', 'c1']).stdout);
    const input = join(acquired.lockPath, 'snapshot-input.json');
    writeFileSync(input, JSON.stringify({ controllerId: 'c1', externalPaths: [] }));
    expect(run(['snapshot-plan', ...common, '--controller-id', 'c1', '--input-json', input]).status).toBe(0);
    writeFileSync(join(root, 'outside.md'), 'dirty-after\n');
    expect(run(['recover-plan', ...common, '--controller-id', 'c1']).status).toBe(2);
    expect(readFileSync(join(root, 'outside.md'), 'utf8')).toBe('dirty-after\n');
    expect(existsSync(join(acquired.lockPath, 'planner-snapshot.json'))).toBe(true);
    expect(run(['release', ...common, '--controller-id', 'c1']).status).toBe(2);
  });

  it('rejects a planner snapshot with a Git-visible symlink', () => {
    const root = repository(); const feature = join(root, 'feature'); mkdirSync(feature);
    writeFileSync(join(feature, 'note.md'), 'before\n');
    writeFileSync(join(root, 'target-a'), 'a\n'); writeFileSync(join(root, 'target-b'), 'b\n');
    symlinkSync('target-a', join(root, 'outside-link'));
    spawnSync('git', ['add', 'target-a', 'target-b', 'outside-link'], { cwd: root });
    spawnSync('git', ['-c', 'user.name=TDK', '-c', 'user.email=tdk@example.invalid',
      'commit', '-qm', 'symlink'], { cwd: root });
    rmSync(join(root, 'outside-link')); symlinkSync('target-b', join(root, 'outside-link'));
    const common = ['--project-root', root, '--feature-dir', feature];
    const acquired = JSON.parse(run(['reserve', ...common, '--task-id', 'feat-1',
      '--purpose', 'planner', '--controller-id', 'c1']).stdout);
    const input = join(acquired.lockPath, 'snapshot-input.json');
    writeFileSync(input, JSON.stringify({ controllerId: 'c1', externalPaths: [] }));
    expect(run(['snapshot-plan', ...common, '--controller-id', 'c1', '--input-json', input]).status).toBe(2);
    expect(existsSync(join(acquired.lockPath, 'planner-snapshot.json'))).toBe(false);
    expect(run(['release', ...common, '--controller-id', 'c1']).status).toBe(0);
  });

  it('removes parent directories created for an initially absent external file', () => {
    const root = repository(); const feature = join(root, 'feature'); mkdirSync(feature);
    writeFileSync(join(feature, 'note.md'), 'before\n');
    const external = 'plans/other/plan.md';
    const common = ['--project-root', root, '--feature-dir', feature];
    const acquired = JSON.parse(run(['reserve', ...common, '--task-id', 'feat-1',
      '--purpose', 'planner', '--controller-id', 'c1']).stdout);
    const input = join(acquired.lockPath, 'snapshot-input.json');
    writeFileSync(input, JSON.stringify({ controllerId: 'c1', externalPaths: [external] }));
    expect(run(['snapshot-plan', ...common, '--controller-id', 'c1', '--input-json', input]).status).toBe(0);
    mkdirSync(join(root, 'plans/other'), { recursive: true });
    writeFileSync(join(root, external), 'new plan\n');
    expect(run(['recover-plan', ...common, '--controller-id', 'c1']).status).toBe(0);
    expect(existsSync(join(root, external))).toBe(false);
    expect(existsSync(join(root, 'plans'))).toBe(false);
    expect(run(['release', ...common, '--controller-id', 'c1']).status).toBe(0);
  });

  for (const leafType of ['symlink', 'directory'] as const) {
    it(`restores an absent external target created as a ${leafType}`, () => {
      const root = repository(); const feature = join(root, 'feature'); mkdirSync(feature);
      writeFileSync(join(feature, 'note.md'), 'before\n');
      const external = 'plans/other/plan.md';
      const common = ['--project-root', root, '--feature-dir', feature];
      const acquired = JSON.parse(run(['reserve', ...common, '--task-id', 'feat-1',
        '--purpose', 'planner', '--controller-id', 'c1']).stdout);
      const input = join(acquired.lockPath, 'snapshot-input.json');
      writeFileSync(input, JSON.stringify({ controllerId: 'c1', externalPaths: [external] }));
      expect(run(['snapshot-plan', ...common, '--controller-id', 'c1', '--input-json', input]).status).toBe(0);
      mkdirSync(join(root, 'plans/other'), { recursive: true });
      if (leafType === 'symlink') symlinkSync('missing-target', join(root, external));
      else mkdirSync(join(root, external));
      expect(run(['recover-plan', ...common, '--controller-id', 'c1']).status).toBe(0);
      expect(existsSync(join(root, 'plans'))).toBe(false);
      expect(run(['release', ...common, '--controller-id', 'c1']).status).toBe(0);
    });
  }

  it('rejects a serialized planner snapshot larger than the recovery bound', () => {
    const root = repository(); const feature = join(root, 'feature'); mkdirSync(feature);
    writeFileSync(join(feature, 'large.bin'), Buffer.alloc(30 * 1024 * 1024));
    const external = '.specify/configurations/custom-workflow/plan-skill-routing.md';
    mkdirSync(join(root, '.specify/configurations/custom-workflow'), { recursive: true });
    writeFileSync(join(root, external), Buffer.alloc(7 * 1024 * 1024));
    const common = ['--project-root', root, '--feature-dir', feature];
    const acquired = JSON.parse(run(['reserve', ...common, '--task-id', 'feat-1',
      '--purpose', 'planner', '--controller-id', 'c1']).stdout);
    const input = join(acquired.lockPath, 'snapshot-input.json');
    writeFileSync(input, JSON.stringify({ controllerId: 'c1', externalPaths: [external] }));
    expect(run(['snapshot-plan', ...common, '--controller-id', 'c1', '--input-json', input]).status).toBe(2);
    expect(existsSync(join(acquired.lockPath, 'planner-snapshot.json'))).toBe(false);
    expect(run(['release', ...common, '--controller-id', 'c1']).status).toBe(0);
  });

  it('finalizes only a valid planner artifact set and then permits release', () => {
    const root = repository(); const feature = join(root, 'feature'); mkdirSync(feature);
    writeFileSync(join(feature, 'spec.md'), '# Spec\n');
    const common = ['--project-root', root, '--feature-dir', feature];
    const acquired = JSON.parse(run(['reserve', ...common, '--task-id', 'feat-1',
      '--purpose', 'planner', '--controller-id', 'c1']).stdout);
    const input = join(acquired.lockPath, 'snapshot-input.json');
    writeFileSync(input, JSON.stringify({ controllerId: 'c1', externalPaths: [] }));
    expect(run(['snapshot-plan', ...common, '--controller-id', 'c1', '--input-json', input]).status).toBe(0);
    writeValidPlannerArtifacts(feature);
    const finalize = run(['finalize-plan', ...common, '--controller-id', 'c1']);
    if (finalize.status !== 0) throw new Error(`${finalize.stdout}${finalize.stderr}`);
    expect(existsSync(join(acquired.lockPath, 'planner-snapshot.json'))).toBe(false);
    expect(run(['release', ...common, '--controller-id', 'c1']).status).toBe(0);
  });

  it('completes a v2 lifecycle: reserve, snapshot, mutate, validate-only finalize, release', () => {
    const root = repository(); const feature = join(root, 'feature'); mkdirSync(feature);
    writeFileSync(join(feature, 'spec.md'), '# Spec\n');
    const common = ['--project-root', root, '--feature-dir', feature];
    const acquired = JSON.parse(run(['reserve', ...common, '--task-id', 'feat-1',
      '--purpose', 'planner', '--controller-id', 'c1']).stdout);
    const input = join(acquired.lockPath, 'snapshot-input.json');
    writeFileSync(input, JSON.stringify({ controllerId: 'c1', externalPaths: [] }));
    expect(run(['snapshot-plan', ...common, '--controller-id', 'c1', '--input-json', input]).status).toBe(0);

    // Assert the on-disk snapshot is schema v2 (content-addressed blobs) with no inline
    // per-entry payload, before finalize-plan consumes and removes it.
    const snapshotPath = join(acquired.lockPath, 'planner-snapshot.json');
    const onDisk = JSON.parse(readFileSync(snapshotPath, 'utf8')) as { schemaVersion: number; entries: unknown[] };
    expect(onDisk.schemaVersion).toBe(2);
    for (const entry of onDisk.entries) expect(entry).not.toHaveProperty('contentBase64');

    writeValidPlannerArtifacts(feature); // the planner's mutation of feature content

    // finalize-plan resolves the plan through the resolver's platform-independent
    // `--validate-only` mode (see parallel-planner-validation.ts), not parallel scheduling.
    const finalize = run(['finalize-plan', ...common, '--controller-id', 'c1']);
    if (finalize.status !== 0) throw new Error(`${finalize.stdout}${finalize.stderr}`);
    expect(existsSync(snapshotPath)).toBe(false);
    expect(run(['release', ...common, '--controller-id', 'c1']).status).toBe(0);
  });

  it('recovers a manually constructed v1 planner snapshot through the CLI lifecycle', () => {
    const root = repository(); const feature = join(root, 'feature'); mkdirSync(feature);
    const content = Buffer.from('legacy recovery payload\n');
    writeFileSync(join(feature, 'legacy.md'), content); chmodSync(join(feature, 'legacy.md'), 0o640);
    const featureMode = lstatSync(feature).mode & 0o7777;
    const common = ['--project-root', root, '--feature-dir', feature];
    const acquired = JSON.parse(run(['reserve', ...common, '--task-id', 'feat-1',
      '--purpose', 'planner', '--controller-id', 'c1']).stdout);

    // Manually constructed v1 wire snapshot (schemaVersion 1, inline contentBase64 file entries, no
    // blobs array) standing in for a snapshot written before schema v2 existed, proving the CLI
    // recovery path still reads it. `gitEntries: []` is safe here: assertNoUndeclaredPlannerDelta only
    // fails closed on changes OUTSIDE the feature directory, and every path used here is inside it.
    const sha = createHash('sha256').update(content).digest('hex');
    const v1Snapshot = {
      schemaVersion: 1, controllerId: 'c1', featureMode,
      entries: [{ kind: 'file', path: 'legacy.md', mode: 0o640, sha256: sha, contentBase64: content.toString('base64') }],
      external: [], gitEntries: [],
    };
    writeFileSync(join(acquired.lockPath, 'planner-snapshot.json'), JSON.stringify(v1Snapshot));

    // Simulate crash/corruption before recovery.
    rmSync(join(feature, 'legacy.md'));
    writeFileSync(join(feature, 'orphan.md'), 'orphan\n');

    const recovery = run(['recover-plan', ...common, '--controller-id', 'c1']);
    if (recovery.status !== 0) throw new Error(`${recovery.stdout}${recovery.stderr}`);
    expect(readFileSync(join(feature, 'legacy.md')).equals(content)).toBe(true);
    expect(lstatSync(join(feature, 'legacy.md')).mode & 0o777).toBe(0o640);
    expect(lstatSync(feature).mode & 0o777).toBe(featureMode);
    expect(existsSync(join(feature, 'orphan.md'))).toBe(false);
    expect(existsSync(join(acquired.lockPath, 'planner-snapshot.json'))).toBe(false);
    expect(run(['release', ...common, '--controller-id', 'c1']).status).toBe(0);
  });

  it('completes a dedup incident lifecycle: one shared buffer across three paths yields one blob and restores exactly', () => {
    const root = repository(); const feature = join(root, 'feature'); mkdirSync(feature);
    // ONE shared buffer reused for all three writes -- do not allocate three separate buffers.
    // 2 MiB (well under the 32 MiB unique-bytes bound) keeps this subprocess-spawning CLI lifecycle
    // test fast; the bound-proximity property (three 17 MiB copies deduping to fit under the same
    // bound that three undeduped copies would exceed) is already covered at the module level by
    // tests/parallel-planner-snapshot.test.ts. This test proves the CLI reserve/snapshot/recover/
    // release lifecycle round-trips a deduplicated snapshot correctly end to end.
    const shared = Buffer.alloc(2 * 1024 * 1024, 9);
    mkdirSync(join(feature, 'nested'));
    writeFileSync(join(feature, 'a.bin'), shared);
    writeFileSync(join(feature, 'b.bin'), shared);
    writeFileSync(join(feature, 'nested/c.bin'), shared);
    const common = ['--project-root', root, '--feature-dir', feature];
    const acquired = JSON.parse(run(['reserve', ...common, '--task-id', 'feat-1',
      '--purpose', 'planner', '--controller-id', 'c1']).stdout);
    const input = join(acquired.lockPath, 'snapshot-input.json');
    writeFileSync(input, JSON.stringify({ controllerId: 'c1', externalPaths: [] }));
    expect(run(['snapshot-plan', ...common, '--controller-id', 'c1', '--input-json', input]).status).toBe(0);

    const snapshotPath = join(acquired.lockPath, 'planner-snapshot.json');
    const onDisk = JSON.parse(readFileSync(snapshotPath, 'utf8')) as { schemaVersion: number; blobs: unknown[] };
    expect(onDisk.schemaVersion).toBe(2);
    expect(onDisk.blobs).toHaveLength(1); // three identical files, one stored blob

    // Simulate crash/corruption before recovery: one file missing, one file corrupted.
    rmSync(join(feature, 'a.bin')); writeFileSync(join(feature, 'b.bin'), 'corrupt\n');

    const recovery = run(['recover-plan', ...common, '--controller-id', 'c1']);
    if (recovery.status !== 0) throw new Error(`${recovery.stdout}${recovery.stderr}`);
    expect(readFileSync(join(feature, 'a.bin')).equals(shared)).toBe(true);
    expect(readFileSync(join(feature, 'b.bin')).equals(shared)).toBe(true);
    expect(readFileSync(join(feature, 'nested/c.bin')).equals(shared)).toBe(true);
    expect(existsSync(snapshotPath)).toBe(false);
    expect(run(['release', ...common, '--controller-id', 'c1']).status).toBe(0);
  });

  it('finalizes the feature plan and an external plan.md via validate-only, bypassing the schedule-mode probe both accept', () => {
    const root = repository(); const feature = join(root, 'feature'); mkdirSync(feature);
    writeFileSync(join(feature, 'spec.md'), '# Spec\n');
    const external = 'external-plan/plan.md';
    mkdirSync(join(root, 'external-plan'), { recursive: true });
    writeFileSync(join(root, external), [
      '## Phases', '', '| # | File | Status | Blocks | BlockedBy |',
      '|---|------|--------|--------|-----------|',
      '| 01 | [A](phase-01-a.md) | done | — | — |', '',
    ].join('\n'));
    const common = ['--project-root', root, '--feature-dir', feature];
    const acquired = JSON.parse(run(['reserve', ...common, '--task-id', 'feat-1',
      '--purpose', 'planner', '--controller-id', 'c1']).stdout);
    const input = join(acquired.lockPath, 'snapshot-input.json');
    writeFileSync(input, JSON.stringify({ controllerId: 'c1', externalPaths: [external] }));
    expect(run(['snapshot-plan', ...common, '--controller-id', 'c1', '--input-json', input]).status).toBe(0);
    writeValidPlannerArtifacts(feature);

    // Break only the schedule-mode case-sensitivity probe (it mkdirs directly
    // under the project root); nested writes (e.g. under .git/tdk/) are
    // unaffected, so this isolates the host-admission gate specifically.
    chmodSync(root, 0o500);
    try {
      const finalize = run(['finalize-plan', ...common, '--controller-id', 'c1']);
      if (finalize.status !== 0) throw new Error(`${finalize.stdout}${finalize.stderr}`);

      // Proof this is not incidental: the default (schedule-mode) invocation of
      // the very same feature plan under the very same root DOES fail the probe.
      const scheduleModeCheck = spawnSync('bun', [
        RESOLVE_WAVE_CLI, '--project-root', root, '--plan', join(feature, 'plan.md'),
      ], { encoding: 'utf8' });
      expect(scheduleModeCheck.status).toBe(2);
      const codes = (JSON.parse(scheduleModeCheck.stdout) as { errors: { code: string }[] })
        .errors.map((e) => e.code);
      expect(codes).toContain('CASE_SENSITIVITY_PROBE_FAILED');
    } finally {
      chmodSync(root, 0o700);
    }
    expect(existsSync(join(acquired.lockPath, 'planner-snapshot.json'))).toBe(false);
    expect(run(['release', ...common, '--controller-id', 'c1']).status).toBe(0);
  });

  it('retains planner evidence when a declared routing file is deleted', () => {
    const root = repository(); const feature = join(root, 'feature'); mkdirSync(feature);
    writeFileSync(join(feature, 'spec.md'), '# Spec\n');
    const external = '.specify/configurations/custom-workflow/plan-skill-routing.md';
    mkdirSync(join(root, '.specify/configurations/custom-workflow'), { recursive: true });
    writeFileSync(join(root, external), '## global\n- code: ck:cook\n');
    const common = ['--project-root', root, '--feature-dir', feature];
    const acquired = JSON.parse(run(['reserve', ...common, '--task-id', 'feat-1',
      '--purpose', 'planner', '--controller-id', 'c1']).stdout);
    const input = join(acquired.lockPath, 'snapshot-input.json');
    writeFileSync(input, JSON.stringify({ controllerId: 'c1', externalPaths: [external] }));
    expect(run(['snapshot-plan', ...common, '--controller-id', 'c1', '--input-json', input]).status).toBe(0);
    rmSync(join(root, external)); writeValidPlannerArtifacts(feature);
    expect(run(['finalize-plan', ...common, '--controller-id', 'c1']).status).toBe(2);
    expect(existsSync(join(acquired.lockPath, 'planner-snapshot.json'))).toBe(true);
    expect(run(['release', ...common, '--controller-id', 'c1']).status).toBe(2);
  });

  it('retains planner evidence for an external plan symlink or parent mode drift', () => {
    for (const mutation of ['symlink', 'parent-mode'] as const) {
      const root = repository(); const feature = join(root, 'feature'); mkdirSync(feature);
      writeFileSync(join(feature, 'spec.md'), '# Spec\n');
      const external = 'plans/other/plan.md'; mkdirSync(join(root, 'plans/other'), { recursive: true });
      writeFileSync(join(root, external), 'old plan\n'); writeFileSync(join(root, 'outside-plan.md'), 'outside\n');
      const common = ['--project-root', root, '--feature-dir', feature];
      const acquired = JSON.parse(run(['reserve', ...common, '--task-id', 'feat-1',
        '--purpose', 'planner', '--controller-id', `c-${mutation}`]).stdout);
      const input = join(acquired.lockPath, 'snapshot-input.json');
      writeFileSync(input, JSON.stringify({ controllerId: `c-${mutation}`, externalPaths: [external] }));
      expect(run(['snapshot-plan', ...common, '--controller-id', `c-${mutation}`, '--input-json', input]).status).toBe(0);
      writeValidPlannerArtifacts(feature);
      if (mutation === 'symlink') {
        rmSync(join(root, external)); symlinkSync('../../outside-plan.md', join(root, external));
      } else chmodSync(join(root, 'plans'), 0o700);
      expect(run(['finalize-plan', ...common, '--controller-id', `c-${mutation}`]).status).toBe(2);
      expect(existsSync(join(acquired.lockPath, 'planner-snapshot.json'))).toBe(true);
      expect(run(['release', ...common, '--controller-id', `c-${mutation}`]).status).toBe(2);
    }
  });

  it('retains planner evidence when external final files exceed the aggregate bound', () => {
    const root = repository(); const feature = join(root, 'feature'); mkdirSync(feature);
    writeFileSync(join(feature, 'spec.md'), '# Spec\n');
    const external = [
      'a/custom-workflow/plan-skill-routing.md',
      'b/custom-workflow/plan-skill-routing.md',
    ];
    const common = ['--project-root', root, '--feature-dir', feature];
    const acquired = JSON.parse(run(['reserve', ...common, '--task-id', 'feat-1',
      '--purpose', 'planner', '--controller-id', 'c1']).stdout);
    const input = join(acquired.lockPath, 'snapshot-input.json');
    writeFileSync(input, JSON.stringify({ controllerId: 'c1', externalPaths: external }));
    expect(run(['snapshot-plan', ...common, '--controller-id', 'c1', '--input-json', input]).status).toBe(0);
    writeValidPlannerArtifacts(feature);
    for (const path of external) {
      mkdirSync(join(root, path, '..'), { recursive: true });
      writeFileSync(join(root, path), Buffer.alloc(5 * 1024 * 1024));
    }
    expect(run(['finalize-plan', ...common, '--controller-id', 'c1']).status).toBe(2);
    expect(existsSync(join(acquired.lockPath, 'planner-snapshot.json'))).toBe(true);
    expect(run(['release', ...common, '--controller-id', 'c1']).status).toBe(2);
  });

  it('requires takeover recovery before a replacement planner snapshot', () => {
    const root = repository(); const feature = join(root, 'feature'); mkdirSync(feature);
    writeFileSync(join(feature, 'note.md'), 'before\n');
    const common = ['--project-root', root, '--feature-dir', feature];
    const first = JSON.parse(run(['reserve', ...common, '--task-id', 'feat-1',
      '--purpose', 'planner', '--controller-id', 'c1']).stdout);
    let input = join(first.lockPath, 'snapshot-input.json');
    writeFileSync(input, JSON.stringify({ controllerId: 'c1', externalPaths: [] }));
    expect(run(['snapshot-plan', ...common, '--controller-id', 'c1', '--input-json', input]).status).toBe(0);
    const second = JSON.parse(run(['recover', ...common, '--task-id', 'feat-1',
      '--expected-controller-id', 'c1', '--controller-id', 'c2']).stdout);
    input = join(second.lockPath, 'snapshot-input.json');
    writeFileSync(input, JSON.stringify({ controllerId: 'c2', externalPaths: [] }));
    expect(run(['snapshot-plan', ...common, '--controller-id', 'c2', '--input-json', input]).status).toBe(2);
    expect(run(['recover-plan', ...common, '--controller-id', 'c2', '--old-controller-id', 'c1']).status).toBe(0);
    expect(run(['snapshot-plan', ...common, '--controller-id', 'c2', '--input-json', input]).status).toBe(0);
    expect(run(['finalize-plan', ...common, '--controller-id', 'c1']).status).toBe(2);
    expect(existsSync(join(second.lockPath, 'planner-snapshot.json'))).toBe(true);
    expect(run(['recover-plan', ...common, '--controller-id', 'c2']).status).toBe(0);
    expect(run(['release', ...common, '--controller-id', 'c2']).status).toBe(0);
  });

  it('fences status and wave operations by reservation purpose', () => {
    const root = repository();
    writeFileSync(join(root, 'phase-01-a.md'), '---\nphase: 1\nstatus: todo\n---\n# A\n');
    writeFileSync(join(root, 'plan.md'), '## Phases\n\n| # | File | Status | Blocks | BlockedBy |\n|---|------|--------|--------|-----------|\n| 01 | [A](phase-01-a.md) | todo | — | — |\n');
    const common = ['--project-root', root, '--feature-dir', root];
    const acquired = JSON.parse(run(['reserve', ...common, '--task-id', 'feat-1',
      '--purpose', 'planner', '--controller-id', 'c1']).stdout);
    const input = join(acquired.lockPath, 'input.json');
    writeFileSync(input, JSON.stringify({ controllerId: 'c1', transitions: [{ phase: 1, from: 'todo', to: 'in_progress' }] }));
    expect(run(['transition-status', ...common, '--controller-id', 'c1', '--input-json', input]).status).toBe(2);
    writeFileSync(input, JSON.stringify({ controllerId: 'c1', waveId: 'w1', protectedPaths: [], phases: [] }));
    expect(run(['snapshot-wave', ...common, '--controller-id', 'c1', '--input-json', input]).status).toBe(2);
    expect(run(['audit-wave', ...common, '--controller-id', 'c1', '--stage', 'final']).status).toBe(2);
    expect(existsSync(join(acquired.lockPath, 'mutation-state.json'))).toBe(false);
  });

  it('retains old wave evidence when takeover finds a partial worker delta', () => {
    const root = repository();
    writeFileSync(join(root, 'phase-01-a.md'), '---\nphase: 1\nstatus: todo\n---\n# A\n');
    writeFileSync(join(root, 'plan.md'), '## Phases\n\n| # | File | Status | Blocks | BlockedBy |\n|---|------|--------|--------|-----------|\n| 01 | [A](phase-01-a.md) | todo | — | — |\n');
    writeFileSync(join(root, 'a.ts'), 'a1\n'); spawnSync('git', ['add', '.'], { cwd: root });
    spawnSync('git', ['-c', 'user.name=TDK', '-c', 'user.email=tdk@example.invalid', 'commit', '-qm', 'files'], { cwd: root });
    const common = ['--project-root', root, '--feature-dir', root];
    const acquired = JSON.parse(run(['acquire', ...common, '--task-id', 'feat-1', '--controller-id', 'c1']).stdout);
    const input = join(acquired.lockPath, 'input.json');
    writeFileSync(input, JSON.stringify({ controllerId: 'c1', transitions: [{ phase: 1, from: 'todo', to: 'in_progress' }] }));
    expect(run(['transition-status', ...common, '--controller-id', 'c1', '--input-json', input]).status).toBe(0);
    writeFileSync(input, JSON.stringify({ controllerId: 'c1', waveId: 'w1', protectedPaths: ['plan.md', 'phase-01-a.md'],
      phases: [{ phase: 1, reads: [], writes: [{ operation: 'modify', path: 'a.ts' }] }] }));
    expect(run(['snapshot-wave', ...common, '--controller-id', 'c1', '--input-json', input]).status).toBe(0);
    writeFileSync(join(root, 'a.ts'), 'partial\n');
    const recovered = JSON.parse(run(['recover', ...common, '--task-id', 'feat-1', '--expected-controller-id', 'c1',
      '--controller-id', 'c2']).stdout);
    expect(run(['reconcile-status', ...common, '--controller-id', 'c2', '--old-controller-id', 'c1']).status).toBe(2);
    expect(existsSync(recovered.tombstonePath)).toBe(true);
    expect(run(['release', ...common, '--controller-id', 'c2']).status).toBe(2);
  });
});
