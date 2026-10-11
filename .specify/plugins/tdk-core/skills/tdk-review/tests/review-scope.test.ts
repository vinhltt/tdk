import { afterEach, describe, expect, it } from 'bun:test';
import { execFileSync } from 'node:child_process';
import { cpSync, mkdirSync, mkdtempSync, realpathSync, rmSync, symlinkSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { computeReviewScope, ReviewScopeError, type ReviewScope } from '../scripts/review-scope';

const BUNDLE = resolve(import.meta.dir, '../scripts/review-scope.js');
const roots: string[] = [];
afterEach(() => { for (const root of roots.splice(0)) rmSync(root, { recursive: true, force: true }); });

function git(cwd: string, ...args: string[]): string {
  return execFileSync('git', ['-c', 'user.email=t@t', '-c', 'user.name=t', '-c', 'commit.gpgsign=false', ...args], { cwd, encoding: 'utf-8' }).trim();
}
function put(path: string, content: string | Buffer): void {
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, content);
}
function initRepo(dir: string, files: Record<string, string> = { 'src/a.ts': 'export const a = 1;\n' }): string {
  mkdirSync(dir, { recursive: true });
  git(dir, 'init', '-q', '-b', 'main');
  for (const [name, body] of Object.entries(files)) put(join(dir, name), body);
  git(dir, 'add', '-A');
  git(dir, 'commit', '-q', '-m', 'base');
  return git(dir, 'rev-parse', 'HEAD');
}

type MapMode = 'realized' | 'seed' | 'pending' | 'badbase' | 'none';
interface PhaseSpec { n: number; status?: string; paths: string[] }
interface Fx { root: string; feature: string; api: string; base: string }

/** An artifact host with one nested code repo (`apps/api`), a plan with phases, and a git-map in the requested state. */
function fixture(phases: PhaseSpec[], mode: MapMode = 'realized'): Fx {
  const root = realpathSync(mkdtempSync(join(tmpdir(), 'review-scope-')));
  roots.push(root);
  const api = join(root, 'apps', 'api');
  const base = initRepo(api);
  put(join(root, '.specify', '.specify.json'), JSON.stringify({ version: '1.0', name: 'fixture', subWorkspaces: [{ name: 'api', path: 'apps/api' }] }));
  const feature = join(root, 'specs', 'task-1');
  writePlan(feature, phases);
  const baseLine = mode === 'badbase' ? '0123456789abcdef0123456789abcdef01234567' : base;
  const frontmatter = mode === 'seed' ? 'task_id: task-1' : `task_id: task-1\nfeature_branch: feat/x\nbase_commit_by_repo:\n  api: ${baseLine}`;
  const branch = mode === 'pending' ? '-' : 'feat/x';
  if (mode !== 'none') {
    put(join(feature, 'git-map.md'), `---\n${frontmatter}\n---\n# Git map\n\n| Sub-workspace | Repo path | Milestone | Branch | Base ref | Worktree path |\n|---|---|---|---|---|---|\n| api | apps/api | main | ${branch} | refs/heads/main | - |\n`);
  }
  return { root, feature, api, base };
}

function writePlan(feature: string, phases: PhaseSpec[]): void {
  const rows = phases.map((p) => `| ${p.n} | [Phase ${p.n}](phase-0${p.n}-work.md) | ${p.status ?? 'done'} | — | — |`).join('\n');
  put(join(feature, 'plan.md'), `---\nstatus: in_progress\n---\n# Plan\n\n## Phases\n\n| # | File | Status | Blocks | BlockedBy |\n|---|---|---|---|---|\n${rows}\n`);
  for (const p of phases) {
    put(join(feature, `phase-0${p.n}-work.md`), `---\nphase: ${p.n}\nstatus: ${p.status ?? 'done'}\n---\n# Phase ${p.n}: Work\n\n## Overview\nWork.\n\n## Related Code Files\n${p.paths.map((path) => `- Modify: \`${path}\``).join('\n')}\n`);
  }
}

const scope = (fx: Fx, phase?: number): ReviewScope => computeReviewScope({ projectRoot: fx.root, featureDir: fx.feature, phase });
function stop(fx: Fx, phase?: number): ReviewScopeError {
  try { scope(fx, phase); } catch (error) { if (error instanceof ReviewScopeError) return error; throw error; }
  throw new Error('expected a ReviewScopeError');
}

describe('review scope: realized git-map rows', () => {
  it('diffs base to working tree: committed, uncommitted and untracked content all reach the diff (V10)', () => {
    const fx = fixture([{ n: 1, paths: ['apps/api/src/a.ts', 'apps/api/src/new-file.ts', 'apps/api/src/committed.ts'] }]);
    put(join(fx.api, 'src', 'committed.ts'), 'export const committed = 1;\n');
    git(fx.api, 'add', '-A'); git(fx.api, 'commit', '-q', '-m', 'work');
    put(join(fx.api, 'src', 'a.ts'), 'export const a = 2; // uncommitted\n');
    put(join(fx.api, 'src', 'new-file.ts'), 'export const created = 42;\n');

    const result = scope(fx);
    expect(result.empty).toBe(false);
    expect(result.repos).toHaveLength(1);
    const repo = result.repos[0]!;
    expect(repo).toMatchObject({ subWorkspace: 'api', repoPath: 'apps/api', baseCommit: fx.base, source: 'git-map', includesUncommitted: true, workingRoot: fx.api });
    expect(repo.files.sort()).toEqual(['src/a.ts', 'src/committed.ts', 'src/new-file.ts']);
    expect(repo.diff).toContain('+export const committed = 1;');
    expect(repo.diff).toContain('+export const a = 2; // uncommitted');
    expect(repo.diff).toContain('+++ b/src/new-file.ts');
    expect(repo.diff).toContain('+export const created = 42;');
    expect(repo.diffLines).toBe(repo.diff.trimEnd().split('\n').length);
    expect(repo.truncated).toEqual([]);
    expect(result.phases).toEqual({ reviewed: [1], skipped: [] });
    expect(result.porcelain['apps/api']).toEqual([' M src/a.ts', '?? src/new-file.ts']);
  });

  it('lists an untracked binary and an oversize untracked file as stat-only in `truncated`, never as content', () => {
    const fx = fixture([{ n: 1, paths: ['apps/api/blob.bin', 'apps/api/big.txt'] }]);
    put(join(fx.api, 'blob.bin'), Buffer.from([0, 1, 2, 3, 0, 0, 255]));
    put(join(fx.api, 'big.txt'), `${'line\n'.repeat(2500)}`);
    const repo = scope(fx).repos[0]!;
    expect(repo.truncated.sort((a, b) => a.path.localeCompare(b.path))).toEqual([{ path: 'big.txt', reason: 'oversize' }, { path: 'blob.bin', reason: 'binary' }]);
    expect(repo.diff).not.toContain('+line');
    expect(repo.diff).toContain('big.txt');
    expect(repo.diff).toContain('blob.bin');
    expect(repo.diffLines).toBeLessThan(20);
  });

  it('an oversize tracked change is stat-only too, while a small tracked change keeps its content', () => {
    const fx = fixture([{ n: 1, paths: ['apps/api/src/a.ts', 'apps/api/src/huge.ts'] }]);
    put(join(fx.api, 'src', 'huge.ts'), 'seed\n');
    git(fx.api, 'add', '-A'); git(fx.api, 'commit', '-q', '-m', 'seed');
    put(join(fx.api, 'src', 'huge.ts'), 'x\n'.repeat(2500));
    put(join(fx.api, 'src', 'a.ts'), 'export const a = 3;\n');
    const repo = scope(fx).repos[0]!;
    expect(repo.files.sort()).toEqual(['src/a.ts', 'src/huge.ts']);
    expect(repo.truncated).toEqual([{ path: 'src/huge.ts', reason: 'oversize' }]);
    expect(repo.diff).toContain('+export const a = 3;');
    expect(repo.diff).not.toContain('+x\n+x');
  });

  it('reports empty when nothing changed since the base, so no reviewer is spawned (AC10 data half)', () => {
    const fx = fixture([{ n: 1, paths: ['apps/api/src/a.ts'] }]);
    const result = scope(fx);
    expect(result.empty).toBe(true);
    expect(result.repos[0]!.files).toEqual([]);
    expect(result.repos[0]!.diff).toBe('');
    expect(result.repos[0]!.diffLines).toBe(0);
  });

  it('--phase NN narrows to that phase\'s files and leaves the other phase out', () => {
    const fx = fixture([{ n: 1, paths: ['apps/api/src/one.ts'] }, { n: 2, paths: ['apps/api/src/two.ts'] }]);
    put(join(fx.api, 'src', 'one.ts'), 'one\n');
    put(join(fx.api, 'src', 'two.ts'), 'two\n');
    const result = scope(fx, 2);
    expect(result.repos[0]!.files).toEqual(['src/two.ts']);
    expect(result.repos[0]!.diff).toContain('+two');
    expect(result.repos[0]!.diff).not.toContain('+one');
    expect(result.phases).toEqual({ reviewed: [2], skipped: [{ number: 1, status: 'done' }] });
  });

  it('a full run reviews only done phases and lists the others as skipped', () => {
    const fx = fixture([{ n: 1, paths: ['apps/api/src/one.ts'] }, { n: 2, status: 'todo', paths: ['apps/api/src/two.ts'] }]);
    put(join(fx.api, 'src', 'one.ts'), 'one\n');
    const result = scope(fx);
    expect(result.phases).toEqual({ reviewed: [1], skipped: [{ number: 2, status: 'todo' }] });
  });
});

describe('review scope: preconditions', () => {
  it('stops with phase_in_progress when any phase is in_progress, on a full run and on --phase for that phase', () => {
    const fx = fixture([{ n: 1, paths: ['apps/api/src/a.ts'] }, { n: 2, status: 'in_progress', paths: ['apps/api/src/b.ts'] }]);
    expect(stop(fx).code).toBe('phase_in_progress');
    expect(stop(fx, 2).code).toBe('phase_in_progress');
  });

  it('--phase on a done phase is allowed even while another phase is in_progress', () => {
    const fx = fixture([{ n: 1, paths: ['apps/api/src/a.ts'] }, { n: 2, status: 'in_progress', paths: ['apps/api/src/b.ts'] }]);
    expect(scope(fx, 1).phases.reviewed).toEqual([1]);
  });

  it('stops with phase_not_done for a todo phase and phase_not_found for an unknown one', () => {
    const fx = fixture([{ n: 1, paths: ['apps/api/src/a.ts'] }, { n: 2, status: 'todo', paths: ['apps/api/src/b.ts'] }]);
    expect(stop(fx, 2)).toMatchObject({ code: 'phase_not_done', details: { phase: 2, status: 'todo' } });
    expect(stop(fx, 9).code).toBe('phase_not_found');
  });
});

describe('review scope: rows that are not reviewed', () => {
  it('an invalid base commit goes to notReviewed with its reason and is never treated as an empty diff', () => {
    const fx = fixture([{ n: 1, paths: ['apps/api/src/a.ts'] }], 'badbase');
    put(join(fx.api, 'src', 'a.ts'), 'changed\n');
    const result = scope(fx);
    expect(result.repos).toEqual([]);
    expect(result.notReviewed).toEqual([{ subWorkspace: 'api', state: 'invalid-base-commit', reason: 'does not name a commit in this repository' }]);
    expect(result.empty).toBe(false);
  });

  it('a pending row (no branch yet) is not reviewed, and its paths are not silently re-routed to the HEAD fallback', () => {
    const fx = fixture([{ n: 1, paths: ['apps/api/src/a.ts'] }], 'pending');
    put(join(fx.api, 'src', 'a.ts'), 'changed\n');
    const result = scope(fx);
    expect(result.notReviewed).toMatchObject([{ subWorkspace: 'api', state: 'pending' }]);
    expect(result.repos).toEqual([]);
  });

  it('a worktree path that is an independent clone fails the identity gate; a real registered worktree is reviewed in place', () => {
    const fx = fixture([{ n: 1, paths: ['apps/api/src/a.ts'] }]);
    const mapWith = (worktree: string): string => `---\ntask_id: task-1\nfeature_branch: feat/x\nbase_commit_by_repo:\n  api: ${fx.base}\n---\n\n| Sub-workspace | Repo path | Milestone | Branch | Base ref | Worktree path |\n|---|---|---|---|---|---|\n| api | apps/api | main | feat/x | refs/heads/main | ${worktree} |\n`;
    const dir = join(fx.root, '_worktrees', 'api', 'feat-x');

    mkdirSync(dirname(dir), { recursive: true });
    git(fx.root, 'clone', '-q', fx.api, dir);
    put(join(fx.feature, 'git-map.md'), mapWith('_worktrees/api/feat-x'));
    expect(scope(fx).notReviewed).toEqual([{ subWorkspace: 'api', state: 'identity_failed', reason: 'worktree path is not a worktree of this repository' }]);

    rmSync(dir, { recursive: true, force: true });
    git(fx.api, 'worktree', 'add', '-q', '-b', 'feat/x', dir);
    put(join(dir, 'src', 'a.ts'), 'export const a = "in-worktree";\n');
    put(join(fx.api, 'src', 'a.ts'), 'export const a = "main-checkout";\n');
    const repo = scope(fx).repos[0]!;
    expect(repo.workingRoot).toBe(dir);
    expect(repo.diff).toContain('in-worktree');
    expect(repo.diff).not.toContain('main-checkout');
  });

  it('a recorded worktree that no longer exists falls back to the repository itself', () => {
    const fx = fixture([{ n: 1, paths: ['apps/api/src/a.ts'] }]);
    put(join(fx.feature, 'git-map.md'), `---\ntask_id: task-1\nfeature_branch: feat/x\nbase_commit_by_repo:\n  api: ${fx.base}\n---\n\n| Sub-workspace | Repo path | Milestone | Branch | Base ref | Worktree path |\n|---|---|---|---|---|---|\n| api | apps/api | main | feat/x | refs/heads/main | _worktrees/api/gone |\n`);
    put(join(fx.api, 'src', 'a.ts'), 'changed\n');
    expect(scope(fx).repos[0]).toMatchObject({ workingRoot: fx.api, source: 'git-map' });
  });
});

describe('review scope: fallback to git diff HEAD', () => {
  it('a seed-only git-map records no realized repository, so Related Code Files are diffed against HEAD and labeled fallback', () => {
    const fx = fixture([{ n: 1, paths: ['apps/api/src/a.ts'] }], 'seed');
    put(join(fx.api, 'src', 'a.ts'), 'changed\n');
    const result = scope(fx);
    expect(result.notReviewed).toEqual([]);
    expect(result.repos).toHaveLength(1);
    expect(result.repos[0]).toMatchObject({ source: 'fallback', subWorkspace: null, baseCommit: fx.base, workingRoot: fx.api });
    expect(result.repos[0]!.diff).toContain('+changed');
  });

  it('a monolith project with no git-map and no sub-workspaces diffs its single repo against HEAD', () => {
    const root = realpathSync(mkdtempSync(join(tmpdir(), 'review-scope-mono-')));
    roots.push(root);
    const base = initRepo(root);
    put(join(root, '.specify', '.specify.json'), JSON.stringify({ version: '1.0', name: 'mono' }));
    git(root, 'add', '-A'); git(root, 'commit', '-q', '-m', 'config');
    const feature = join(root, 'specs', 'task-1');
    writePlan(feature, [{ n: 1, paths: ['src/a.ts', 'src/added.ts'] }]);
    put(join(root, 'src', 'a.ts'), 'export const a = 9;\n');
    put(join(root, 'src', 'added.ts'), 'export const added = true;\n');
    const result = computeReviewScope({ projectRoot: root, featureDir: feature });
    expect(result.repos).toHaveLength(1);
    expect(result.repos[0]).toMatchObject({ source: 'fallback', repoPath: '.', workingRoot: root });
    expect(result.repos[0]!.baseCommit).not.toBe('');
    expect(result.repos[0]!.baseCommit).toBe(git(root, 'rev-parse', 'HEAD'));
    expect(base).not.toBe(result.repos[0]!.baseCommit);
    expect(result.repos[0]!.diff).toContain('+export const a = 9;');
    expect(result.repos[0]!.diff).toContain('+export const added = true;');
  });

  it('reports a Related Code Files entry that would leave the project under notReviewed, and diffs the rest', () => {
    const fx = fixture([{ n: 1, paths: ['apps/api/src/a.ts', '../outside.ts', '/etc/passwd'] }], 'seed');
    put(join(fx.api, 'src', 'a.ts'), 'changed\n');
    const result = scope(fx);
    expect(result.notReviewed.map((entry) => [entry.subWorkspace, entry.state])).toEqual([['../outside.ts', 'unsafe_path'], ['/etc/passwd', 'unsafe_path']]);
    expect(result.repos[0]!.files).toEqual(['src/a.ts']);
    expect(result.empty).toBe(false);
  });

  it('a directory entry naming a nested repo is diffed in that repo, not in the enclosing one', () => {
    const fx = fixture([{ n: 1, paths: ['apps/api'] }], 'none');
    put(join(fx.api, 'src', 'a.ts'), 'changed\n');
    const result = scope(fx);
    expect(result.repos).toHaveLength(1);
    expect(result.repos[0]).toMatchObject({ source: 'fallback', workingRoot: fx.api, files: ['src/a.ts'] });
    expect(result.empty).toBe(false);
  });

  it('a symlink inside the project that points at an outside repository is refused, never diffed', () => {
    const fx = fixture([{ n: 1, paths: ['link/secret.txt'] }], 'none');
    const outside = realpathSync(mkdtempSync(join(tmpdir(), 'review-outside-')));
    roots.push(outside);
    initRepo(outside, { 'secret.txt': 'secret\n' });
    put(join(outside, 'secret.txt'), 'changed secret\n');
    symlinkSync(outside, join(fx.root, 'link'));
    const result = scope(fx);
    expect(result.repos).toEqual([]);
    expect(result.notReviewed).toEqual([{ subWorkspace: 'link/secret.txt', state: 'outside_project', reason: 'path resolves outside the project through a symlink' }]);
    expect(JSON.stringify(result)).not.toContain('changed secret');
    expect(result.empty).toBe(false);
  });

  it('a `.` entry stays inside the project when the project sits inside a larger repository', () => {
    const outer = realpathSync(mkdtempSync(join(tmpdir(), 'review-scope-outer-')));
    roots.push(outer);
    const projectRoot = join(outer, 'proj');
    const feature = join(projectRoot, 'specs', 'task-1');
    put(join(projectRoot, '.specify', '.specify.json'), JSON.stringify({ version: '1.0', name: 'inner' }));
    put(join(projectRoot, 'a.ts'), 'old\n');
    put(join(outer, 'outside.ts'), 'old\n');
    writePlan(feature, [{ n: 1, paths: ['.'] }]);
    git(outer, 'init', '-q', '-b', 'main'); git(outer, 'add', '-A'); git(outer, 'commit', '-q', '-m', 'base');
    put(join(projectRoot, 'a.ts'), 'new\n');
    put(join(outer, 'outside.ts'), 'SECRET-OUTSIDE\n');
    const result = computeReviewScope({ projectRoot, featureDir: feature });
    expect(result.repos[0]!.files).toEqual(['proj/a.ts']);
    expect(result.repos[0]!.diff).not.toContain('SECRET-OUTSIDE');
  });

  it('a plain directory of a root repo whose row is not realized still falls back to HEAD (plain monorepo)', () => {
    const root = realpathSync(mkdtempSync(join(tmpdir(), 'review-scope-plain-')));
    roots.push(root);
    initRepo(root, { 'apps/web/index.ts': 'old\n', '.specify/.specify.json': JSON.stringify({ version: '1.0', name: 'plain', subWorkspaces: [{ name: 'web', path: 'apps/web' }] }) });
    const feature = join(root, 'specs', 'task-1');
    writePlan(feature, [{ n: 1, paths: ['apps/web/index.ts'] }]);
    put(join(feature, 'git-map.md'), '---\ntask_id: task-1\nfeature_branch: feat/x\n---\n\n| Sub-workspace | Repo path | Milestone | Branch | Base ref | Worktree path |\n|---|---|---|---|---|---|\n| web | apps/web | main | - | refs/heads/main | - |\n');
    put(join(root, 'apps', 'web', 'index.ts'), 'new\n');
    const result = computeReviewScope({ projectRoot: root, featureDir: feature });
    expect(result.notReviewed).toEqual([]);
    expect(result.repos[0]).toMatchObject({ source: 'fallback', files: ['apps/web/index.ts'] });
  });
});

describe('review scope: untracked content edge cases', () => {
  it('an untracked symlink to a directory is flagged unreadable instead of counting as reviewed with no content', () => {
    const fx = fixture([{ n: 1, paths: ['apps/api/src/dirlink'] }]);
    symlinkSync(tmpdir(), join(fx.api, 'src', 'dirlink'));
    expect(scope(fx).repos[0]!.truncated).toEqual([{ path: 'src/dirlink', reason: 'unreadable' }]);
  });

  it('a file of exactly the line cap keeps its content', () => {
    const fx = fixture([{ n: 1, paths: ['apps/api/at-cap.txt'] }]);
    put(join(fx.api, 'at-cap.txt'), 'line\n'.repeat(2000));
    const repo = scope(fx).repos[0]!;
    expect(repo.truncated).toEqual([]);
    expect(repo.diff).toContain('+line');
  });

  it('the porcelain snapshot lists files inside a new directory, so a write there changes it', () => {
    const fx = fixture([{ n: 1, paths: ['apps/api/newdir/one.ts'] }]);
    put(join(fx.api, 'newdir', 'one.ts'), 'one\n');
    put(join(fx.api, 'newdir', 'two.ts'), 'two\n');
    const result = scope(fx);
    expect(result.porcelain['apps/api']!.sort()).toEqual(['?? newdir/one.ts', '?? newdir/two.ts']);
    expect(result.porcelainArgs).toEqual(['status', '--porcelain=v1', '-z', '--untracked-files=all']);
  });

  it('an empty untracked file still lands in files[] and its new-file header reaches the diff', () => {
    const fx = fixture([{ n: 1, paths: ['apps/api/__init__.py'] }]);
    put(join(fx.api, '__init__.py'), '');
    const repo = scope(fx).repos[0]!;
    expect(repo.files).toEqual(['__init__.py']);
    expect(repo.truncated).toEqual([]);
    expect(repo.diff).toContain('new file mode');
  });

  it('a non-ASCII path is reported literally, not as an octal-quoted string', () => {
    const fx = fixture([{ n: 1, paths: ['apps/api/é.ts'] }]);
    put(join(fx.api, 'é.ts'), 'x\n');
    const repo = scope(fx).repos[0]!;
    expect(repo.files).toEqual(['é.ts']);
    expect(repo.diff).toContain('+++ b/é.ts');
  });

  it('user diff config (noprefix, color, external) cannot change the diff shape', () => {
    const fx = fixture([{ n: 1, paths: ['apps/api/src/a.ts'] }]);
    git(fx.api, 'config', 'diff.noprefix', 'true');
    git(fx.api, 'config', 'color.ui', 'always');
    git(fx.api, 'config', 'diff.external', 'false');
    put(join(fx.api, 'src', 'a.ts'), 'changed\n');
    const repo = scope(fx).repos[0]!;
    expect(repo.diff).toContain('+++ b/src/a.ts');
    expect(repo.diff).not.toContain('\u001b[');
  });
});

describe('review scope: integrity snapshot of the artifact host', () => {
  it('snapshots the repo holding the feature dir even when every code repo is mapped separately', () => {
    const fx = fixture([{ n: 1, paths: ['apps/api/src/a.ts'] }]);
    git(fx.root, 'init', '-q', '-b', 'main');
    git(fx.root, 'add', '-A');
    git(fx.root, 'commit', '-q', '-m', 'host');
    put(join(fx.feature, 'reviews', 'stray.md'), 'x\n');
    const result = scope(fx);
    expect(result.repos.map((repo) => repo.source)).toEqual(['git-map']);
    expect(Object.keys(result.porcelain).sort()).toEqual(['.', 'apps/api']);
    expect(result.porcelain['.']).toEqual(['?? specs/task-1/reviews/stray.md']);
  });

  it('does not duplicate the host key when the host is already a reviewed repo', () => {
    const root = realpathSync(mkdtempSync(join(tmpdir(), 'review-scope-host-')));
    roots.push(root);
    initRepo(root, { 'src/a.ts': 'old\n', '.specify/.specify.json': JSON.stringify({ version: '1.0', name: 'mono' }) });
    const feature = join(root, 'specs', 'task-1');
    writePlan(feature, [{ n: 1, paths: ['src/a.ts'] }]);
    put(join(root, 'src', 'a.ts'), 'new\n');
    const result = computeReviewScope({ projectRoot: root, featureDir: feature });
    expect(Object.keys(result.porcelain)).toEqual(['.']);
    expect(result.warnings).toEqual([]);
  });

  it('warns, instead of silently skipping the check, when the feature dir is not in any repository', () => {
    const fx = fixture([{ n: 1, paths: ['apps/api/src/a.ts'] }]);
    expect(scope(fx).warnings).toEqual(['feature dir is not inside a git repository; reviewer writes there cannot be detected']);
  });
});

describe('review scope: --phase and non-realized rows', () => {
  it('--phase does not list a repository the phase never touched as not reviewed', () => {
    const fx = fixture([{ n: 1, paths: ['docs/readme.md'] }], 'pending');
    expect(scope(fx, 1).notReviewed.some((entry) => entry.subWorkspace === 'api')).toBe(false);
  });

  it('a narrowed run whose phase repo is unchanged is empty with nothing to report', () => {
    const fx = fixture([{ n: 1, paths: ['apps/api/src/a.ts'] }, { n: 2, paths: ['docs/other.md'] }]);
    const result = scope(fx, 1);
    expect(result.notReviewed).toEqual([]);
    expect(result.empty).toBe(true);
  });
});

describe('review-scope bundle', () => {
  async function run(fx: Fx, extra: string[] = [], bundle = BUNDLE) {
    const proc = Bun.spawn([process.execPath, '--no-install', bundle, '--project-root', fx.root, '--feature-dir', fx.feature, ...extra], { cwd: fx.root, stdout: 'pipe', stderr: 'pipe' });
    const [stdout, stderr] = await Promise.all([new Response(proc.stdout).text(), new Response(proc.stderr).text()]);
    return { exitCode: await proc.exited, stderr, payload: JSON.parse(stdout) };
  }

  it('runs from a copy of the skill dir outside any project, with no consumer scripts/ts tree', async () => {
    const fx = fixture([{ n: 1, paths: ['apps/api/src/a.ts'] }]);
    put(join(fx.api, 'src', 'a.ts'), 'changed\n');
    const dir = realpathSync(mkdtempSync(join(tmpdir(), 'review-skill-')));
    roots.push(dir);
    // Only what ships: scripts/ without node_modules. tests/ and anything else stays behind.
    cpSync(resolve(BUNDLE, '..'), join(dir, 'tdk-review', 'scripts'), { recursive: true, filter: (src) => !src.includes('node_modules') });
    const result = await run(fx, [], join(dir, 'tdk-review', 'scripts', 'review-scope.js'));
    expect(result.exitCode).toBe(0);
    expect(result.payload).toMatchObject({ ok: true, empty: false, repos: [{ subWorkspace: 'api', source: 'git-map' }] });
  });

  it('exits 1 with invalid_arguments for a missing option or an unknown flag', async () => {
    const fx = fixture([{ n: 1, paths: ['apps/api/src/a.ts'] }]);
    const unknown = await run(fx, ['--bogus']);
    expect(unknown.exitCode).toBe(1);
    expect(unknown.payload).toEqual({ ok: false, error: 'invalid_arguments' });
    const proc = Bun.spawn([process.execPath, '--no-install', BUNDLE, '--project-root', fx.root], { stdout: 'pipe', stderr: 'pipe' });
    expect(JSON.parse(await new Response(proc.stdout).text())).toEqual({ ok: false, error: 'invalid_arguments' });
    expect(await proc.exited).toBe(1);
  });

  it('prints the scope JSON on success', async () => {
    const fx = fixture([{ n: 1, paths: ['apps/api/src/a.ts'] }]);
    put(join(fx.api, 'src', 'a.ts'), 'changed\n');
    const result = await run(fx);
    expect(result.exitCode).toBe(0);
    expect(result.payload).toMatchObject({ ok: true, empty: false, repos: [{ subWorkspace: 'api', source: 'git-map' }] });
  });

  it('exits 1 with the error envelope for an in_progress phase, and rejects a non-numeric --phase', async () => {
    const fx = fixture([{ n: 1, status: 'in_progress', paths: ['apps/api/src/a.ts'] }]);
    const blocked = await run(fx);
    expect(blocked.exitCode).toBe(1);
    expect(blocked.payload).toMatchObject({ ok: false, error: 'phase_in_progress', phases: [1] });
    const bad = await run(fx, ['--phase', 'one']);
    expect(bad.exitCode).toBe(1);
    expect(bad.payload).toMatchObject({ ok: false, error: 'invalid_phase' });
  });

  it('end to end from a copied skill dir: scope reports an untracked defect, and the report is the only porcelain change (AC1)', async () => {
    const fx = fixture([{ n: 1, paths: ['apps/api/src/a.ts', 'apps/api/src/b.ts'] }]);
    put(join(fx.api, 'src', 'a.ts'), 'export const a = 2;\n');
    put(join(fx.api, 'src', 'b.ts'), 'export function run(x) { return eval(x); }\n');
    // The artifact host must be a repository too, otherwise scope has no host key and the porcelain check would be vacuous.
    git(fx.root, 'init', '-q', '-b', 'main');
    const dir = realpathSync(mkdtempSync(join(tmpdir(), 'review-skill-')));
    roots.push(dir);
    cpSync(resolve(BUNDLE, '..'), join(dir, 'scripts'), { recursive: true, filter: (src) => !src.includes('node_modules') });

    const scoped = await run(fx, [], join(dir, 'scripts', 'review-scope.js'));
    expect(scoped.exitCode).toBe(0);
    expect(scoped.payload).toMatchObject({ ok: true, empty: false });
    const repo = scoped.payload.repos[0];
    expect(repo.files.sort()).toEqual(['src/a.ts', 'src/b.ts']);
    // The planted defect sits in an untracked file: its content must reach the reviewers.
    expect(repo.diff).toContain('+export function run(x) { return eval(x); }');
    expect(Object.keys(scoped.payload.porcelain).sort()).toEqual(['.', 'apps/api']);

    // The skill's integrity check: replay `git -C <repo> <porcelainArgs>` for every key.
    const snapshot = (): Record<string, string[]> => {
      const result: Record<string, string[]> = {};
      for (const key of Object.keys(scoped.payload.porcelain)) {
        result[key] = execFileSync('git', ['-C', join(fx.root, key), ...scoped.payload.porcelainArgs], { encoding: 'utf-8' }).split('\0').filter(Boolean);
      }
      return result;
    };
    const before = snapshot();
    expect(before).toEqual(scoped.payload.porcelain);

    const proc = Bun.spawn([process.execPath, '--no-install', join(dir, 'scripts', 'review-write-report.js'), '--project-root', fx.root, '--feature-dir', fx.feature, '--slug', 'e2e-standard'], {
      cwd: fx.root, stdin: new Blob(['---\nverdict: changes_requested\n---\n# Report\n']), stdout: 'pipe', stderr: 'pipe',
    });
    expect(await proc.exited).toBe(0);

    const after = snapshot();
    expect(after['apps/api']).toEqual(before['apps/api']);
    const added = after['.']!.filter((line) => !before['.']!.includes(line));
    expect(added).toHaveLength(1);
    expect(added[0]).toMatch(/^\?\? specs\/task-1\/reviews\/\d{8}-\d{6}-e2e-standard\.md$/);
    expect(before['.']!.filter((line) => !after['.']!.includes(line))).toEqual([]);
  });
});
