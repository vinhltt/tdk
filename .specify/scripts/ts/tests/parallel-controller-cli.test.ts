import { afterEach, describe, expect, it } from 'bun:test';
import {
  chmodSync, existsSync, lstatSync, mkdirSync, mkdtempSync, readFileSync, rmSync, symlinkSync, writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { spawnSync } from 'node:child_process';

const CLI = join(import.meta.dir, '../src/commands/util/parallel-controller.ts');
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
