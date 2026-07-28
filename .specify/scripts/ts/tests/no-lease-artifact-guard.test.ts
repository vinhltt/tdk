import { afterEach, beforeEach, describe, expect, it } from 'bun:test';
import { execFileSync, spawnSync } from 'node:child_process';
import { mkdtempSync, readFileSync, readdirSync, realpathSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';

// D4 proof: the removed lease system built its state directory as
// `join(gitCommonDir, 'tdk', 'parallel-controller.lock')` (parallel-controller-lease.ts,
// pre-deletion). `tdk` is the only path segment `distribute.sh` rewrites per-brand; the
// file name `parallel-controller.lock` and the `--git-common-dir` call site are brand-invariant,
// so grepping for them survives distribution to any consumer prefix.

const SRC_ROOT = resolve(__dirname, '../src');
const TRANSITION_CLI = resolve(__dirname, '../src/commands/util/transition-phase-status.ts');
const DISJOINTNESS_CLI = resolve(__dirname, '../src/commands/util/check-phase-write-disjointness.ts');

function allSourceFiles(): string[] {
  return (readdirSync(SRC_ROOT, { recursive: true } as never) as string[])
    .filter((relPath) => relPath.endsWith('.ts'))
    .map((relPath) => join(SRC_ROOT, relPath));
}

describe('no-lease-artifact guard (D4) — static', () => {
  it('no surviving source file constructs the historical lease-directory artifact name', () => {
    const hits = allSourceFiles().filter((file) => readFileSync(file, 'utf8').includes('parallel-controller.lock'));
    expect(hits).toEqual([]);
  });

  it('no surviving source file queries --git-common-dir, the only call site the lease directory was ever built from', () => {
    const hits = allSourceFiles().filter((file) => readFileSync(file, 'utf8').includes('--git-common-dir'));
    expect(hits).toEqual([]);
  });
});

describe('no-lease-artifact guard (D4) — behavioral', () => {
  let root: string;
  let planPath: string;
  let phasePath: string;
  let gitCommonDir: string;

  beforeEach(() => {
    root = realpathSync.native(mkdtempSync(join(tmpdir(), 'tdk-no-lease-guard-')));
    execFileSync('git', ['init', '-q'], { cwd: root });
    gitCommonDir = resolve(root, execFileSync('git', ['rev-parse', '--git-common-dir'], { cwd: root, encoding: 'utf8' }).trim());

    phasePath = join(root, 'phase-01-a.md');
    planPath = join(root, 'plan.md');
    writeFileSync(phasePath, '---\nphase: 1\nstatus: todo\n---\n# A\n');
    writeFileSync(planPath, '## Phases\n\n| # | File | Status | Blocks | BlockedBy |\n|---|------|--------|--------|-----------|\n| 01 | [A](phase-01-a.md) | todo | — | — |\n');
  });

  afterEach(() => {
    rmSync(root, { recursive: true, force: true });
  });

  function snapshotGitCommonDir(): string[] {
    return (readdirSync(gitCommonDir, { recursive: true } as never) as string[]).sort();
  }

  it('transitioning phase status through the surviving lease-free write path creates nothing new under git-common-dir', () => {
    const before = snapshotGitCommonDir();
    const result = spawnSync('bun', [
      TRANSITION_CLI, '--project-root', root, '--plan', planPath, '--feature-dir', root, '--phase', '1', '--to', 'in_progress',
    ], { encoding: 'utf8' });
    expect(result.status).toBe(0);
    expect(snapshotGitCommonDir()).toEqual(before);
  });

  it('the plan-time write-disjointness gate creates nothing new under git-common-dir, in scheduling mode', () => {
    const before = snapshotGitCommonDir();
    const declarations = JSON.stringify([{ phase: 1, read: [], modify: ['phase-01-a.md'], create: [], delete: [] }]);
    const result = spawnSync('bun', [DISJOINTNESS_CLI, '--project-root', root], { input: declarations, encoding: 'utf8' });
    expect(result.status).toBe(0);
    expect(JSON.parse(result.stdout)).toEqual({ safe: [1], conflicts: [], rejected: [] });
    expect(snapshotGitCommonDir()).toEqual(before);
  });
});
