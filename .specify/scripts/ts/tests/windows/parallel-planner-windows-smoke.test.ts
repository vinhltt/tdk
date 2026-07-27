/**
 * parallel-planner-windows-smoke.test.ts
 *
 * Native Windows/Bun smoke test, guarded end to end by
 * `describe.skipIf(process.platform !== 'win32')` so every case SKIPS cleanly on any non-Windows
 * host (Linux, macOS, and WSL2 alike).
 *
 * IMPORTANT: this file CANNOT be validated on WSL2. WSL2 reports `process.platform === 'linux'`,
 * so the whole suite is skipped there too, exactly as it is on plain Linux -- WSL2 execution is
 * NOT equivalent evidence for the native-Windows gate this file exercises: native win32
 * directory-fsync `EPERM` tolerance (`parent-directory-sync.ts`) and the native-Windows
 * filesystem-capability rejection (`parallel-phase-mount-capability.ts` /
 * `parallel-phase-wave-operation.ts`) are both host-`process.platform`-dependent behavior that
 * WSL2's Linux-reporting kernel never triggers. This file MUST be run on a real Windows host with
 * a native Bun install before any release touching those paths is declared verified.
 *
 * Run natively on Windows:
 *   bun test .specify/scripts/ts/tests/windows/parallel-planner-windows-smoke.test.ts
 */
import { describe, expect, it } from 'bun:test';
import { spawnSync } from 'node:child_process';
import { existsSync, mkdirSync, mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const CLI = join(import.meta.dir, '../../src/commands/util/parallel-controller.ts');
const RESOLVE_WAVE_CLI = join(import.meta.dir, '../../src/commands/util/resolve-parallel-phase-wave.ts');
const PHASES_HEADER = '| # | File | Status | Blocks | BlockedBy |\n|---|------|--------|--------|-----------|';

function run(args: string[]) {
  return spawnSync('bun', [CLI, ...args], { encoding: 'utf8' });
}

function repository(): string {
  const root = mkdtempSync(join(tmpdir(), 'tdk-windows-smoke-'));
  spawnSync('git', ['init', '-q'], { cwd: root });
  spawnSync('git', ['-c', 'user.name=TDK', '-c', 'user.email=tdk@example.invalid',
    'commit', '--allow-empty', '-qm', 'base'], { cwd: root });
  return root;
}

function writeValidPlannerArtifacts(feature: string): void {
  mkdirSync(join(feature, 'phases'), { recursive: true });
  writeFileSync(join(feature, 'phases/phase-01-a.md'), [
    '---', 'phase: 1', 'status: todo', 'dependencies: []', 'parallel_safe: never',
    'parallel_reason: serial fixture', '---', '', '# Phase A', '',
  ].join('\n'));
  writeFileSync(join(feature, 'plan.md'), [
    '## Phases', '', PHASES_HEADER,
    '| 01 | [A](phases/phase-01-a.md) | todo | — | — |', '',
  ].join('\n'));
}

describe.skipIf(process.platform !== 'win32')('native Windows/Bun planner smoke', () => {
  it('reserves, snapshots, mutates, and recovers a planner snapshot on native Windows', () => {
    const root = repository(); const feature = join(root, 'feature'); mkdirSync(feature);
    writeFileSync(join(feature, 'note.md'), 'before\n');
    const common = ['--project-root', root, '--feature-dir', feature];
    const acquired = JSON.parse(run(['reserve', ...common, '--task-id', 'feat-1',
      '--purpose', 'planner', '--controller-id', 'c1']).stdout);
    const input = join(acquired.lockPath, 'snapshot-input.json');
    writeFileSync(input, JSON.stringify({ controllerId: 'c1', externalPaths: [] }));
    // Exercises the Phase 1 directory-fsync EPERM tolerance: capture/restore both durably write
    // through parent directories on the native Windows filesystem. Before that fix, the fsync call
    // failed closed here with an unhandled EPERM instead of tolerating the unsupported capability.
    expect(run(['snapshot-plan', ...common, '--controller-id', 'c1', '--input-json', input]).status).toBe(0);
    writeFileSync(join(feature, 'note.md'), 'after\n');
    writeFileSync(join(feature, 'orphan.md'), 'orphan\n');
    const recovery = run(['recover-plan', ...common, '--controller-id', 'c1']);
    if (recovery.status !== 0) throw new Error(`${recovery.stdout}${recovery.stderr}`);
    expect(readFileSync(join(feature, 'note.md'), 'utf8')).toBe('before\n');
    expect(existsSync(join(feature, 'orphan.md'))).toBe(false);
    expect(run(['release', ...common, '--controller-id', 'c1']).status).toBe(0);
  });

  it('finalizes a valid planner artifact set via the resolver validate-only mode', () => {
    const root = repository(); const feature = join(root, 'feature'); mkdirSync(feature);
    writeFileSync(join(feature, 'spec.md'), '# Spec\n');
    const common = ['--project-root', root, '--feature-dir', feature];
    const acquired = JSON.parse(run(['reserve', ...common, '--task-id', 'feat-1',
      '--purpose', 'planner', '--controller-id', 'c1']).stdout);
    const input = join(acquired.lockPath, 'snapshot-input.json');
    writeFileSync(input, JSON.stringify({ controllerId: 'c1', externalPaths: [] }));
    expect(run(['snapshot-plan', ...common, '--controller-id', 'c1', '--input-json', input]).status).toBe(0);
    writeValidPlannerArtifacts(feature);
    // Planner finalization always runs the resolver in `--validate-only` mode (see
    // parallel-planner-validation.ts), which is host-independent and must succeed here even though
    // direct scheduling (below) is rejected on this very same native-Windows host.
    const finalize = run(['finalize-plan', ...common, '--controller-id', 'c1']);
    if (finalize.status !== 0) throw new Error(`${finalize.stdout}${finalize.stderr}`);
    expect(existsSync(join(acquired.lockPath, 'planner-snapshot.json'))).toBe(false);
    expect(run(['release', ...common, '--controller-id', 'c1']).status).toBe(0);
  });

  it('still rejects direct parallel scheduling on native Windows with native-windows-unsupported', () => {
    const root = repository();
    mkdirSync(join(root, 'phases'), { recursive: true });
    writeFileSync(join(root, 'phases/phase-01-a.md'), [
      '---', 'parallel_safe: auto', '---', '', '# Phase A', '', '## Related Code Files', '',
      '- Create: `src/new-file.ts`', '',
    ].join('\n'));
    writeFileSync(join(root, 'plan.md'), [
      '## Phases', '', PHASES_HEADER,
      '| 01 | [A](phases/phase-01-a.md) | todo | — | — |', '',
    ].join('\n'));
    // Default (schedule) mode, no --validate-only: the actual host-admission gate that
    // /tdk-implement --parallel relies on. It must reject native Windows even though the planner
    // validate-only path above succeeds on this same host -- this is the safety boundary that must
    // never be widened by the validate-only mode added in Phase 3.
    const result = spawnSync('bun', [RESOLVE_WAVE_CLI, '--project-root', root, '--plan', join(root, 'plan.md')],
      { encoding: 'utf8' });
    expect(result.status).toBe(2);
    const errors = (JSON.parse(result.stdout) as { errors: { code: string; message: string }[] }).errors;
    expect(errors.some((error) => error.code === 'FILESYSTEM_CAPABILITY_UNSUPPORTED'
      && error.message === 'native-windows-unsupported')).toBe(true);
  });
});
