import { afterEach, beforeEach, describe, expect, it } from 'bun:test';
import { execFileSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, readFileSync, readdirSync, realpathSync, rmSync, statSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { basename, join } from 'node:path';
import { inspectControllerLease } from '../src/commands/util/parallel-controller-lease-read';

let root: string;

function initGitRepo(dir: string): void {
  execFileSync('git', ['init', '-q'], { cwd: dir });
}

function gitDir(dir: string): string {
  return join(dir, '.git');
}

function lockDirPath(dir: string): string {
  return join(gitDir(dir), 'tdk', 'parallel-controller.lock');
}

beforeEach(() => {
  root = realpathSync.native(mkdtempSync(join(tmpdir(), 'tdk-lease-read-')));
});

afterEach(() => {
  rmSync(root, { recursive: true, force: true });
});

describe('inspectControllerLease', () => {
  it('non-Git directory: held false, reason no-git', () => {
    expect(inspectControllerLease(root)).toEqual({ held: false, reason: 'no-git' });
  });

  it('Git repo with no lock dir: held false, reason no-lock-dir', () => {
    initGitRepo(root);
    expect(inspectControllerLease(root)).toEqual({ held: false, reason: 'no-lock-dir' });
  });

  it('lock dir with valid owner.json: held true with full owner metadata', () => {
    initGitRepo(root);
    const lockPath = lockDirPath(root);
    mkdirSync(lockPath, { recursive: true });
    writeFileSync(join(lockPath, 'owner.json'), JSON.stringify({
      controllerId: 'ctrl-1', taskId: 'task-9', startedAt: '2026-07-25T00:00:00Z', updatedAt: '2026-07-25T00:05:00Z',
    }));
    const result = inspectControllerLease(root);
    expect(result).toEqual({
      held: true,
      lockPath,
      owner: { controllerId: 'ctrl-1', taskId: 'task-9', startedAt: '2026-07-25T00:00:00Z', updatedAt: '2026-07-25T00:05:00Z' },
    });
  });

  it('lock dir with partial owner.json (null fields): held true, owner still parsed', () => {
    initGitRepo(root);
    const lockPath = lockDirPath(root);
    mkdirSync(lockPath, { recursive: true });
    writeFileSync(join(lockPath, 'owner.json'), JSON.stringify({ controllerId: 'ctrl-2', taskId: null }));
    const result = inspectControllerLease(root);
    expect(result.held).toBe(true);
    if (result.held) {
      expect(result.owner).toEqual({ controllerId: 'ctrl-2', taskId: null });
    }
  });

  it('lock dir with missing owner.json: held true, owner null', () => {
    initGitRepo(root);
    const lockPath = lockDirPath(root);
    mkdirSync(lockPath, { recursive: true });
    expect(inspectControllerLease(root)).toEqual({ held: true, lockPath, owner: null });
  });

  it('lock dir with malformed JSON: held true, owner null', () => {
    initGitRepo(root);
    const lockPath = lockDirPath(root);
    mkdirSync(lockPath, { recursive: true });
    writeFileSync(join(lockPath, 'owner.json'), '{ not valid json');
    expect(inspectControllerLease(root)).toEqual({ held: true, lockPath, owner: null });
  });

  it('non-directory lock path: held true, owner null', () => {
    initGitRepo(root);
    const lockPath = lockDirPath(root);
    mkdirSync(join(lockPath, '..'), { recursive: true });
    writeFileSync(lockPath, 'not a directory');
    expect(inspectControllerLease(root)).toEqual({ held: true, lockPath, owner: null });
  });

  it('worktree resolves to the shared common dir of the main repo', () => {
    initGitRepo(root);
    execFileSync('git', ['commit', '--allow-empty', '-q', '-m', 'init'], { cwd: root });
    const worktreeDir = join(root, '..', `${basename(root)}-worktree`);
    execFileSync('git', ['worktree', 'add', '-q', worktreeDir, '-b', 'lease-read-test-branch'], { cwd: root });
    try {
      const lockPath = lockDirPath(root);
      mkdirSync(lockPath, { recursive: true });
      writeFileSync(join(lockPath, 'owner.json'), JSON.stringify({ controllerId: 'ctrl-shared' }));

      const fromMain = inspectControllerLease(root);
      const fromWorktree = inspectControllerLease(realpathSync.native(worktreeDir));
      expect(fromMain).toEqual(fromWorktree);
      expect(fromMain).toEqual({ held: true, lockPath, owner: { controllerId: 'ctrl-shared' } });
    } finally {
      rmSync(worktreeDir, { recursive: true, force: true });
    }
  });

  it('inspection never mutates the lock dir: mtime, listing, and bytes are unchanged', () => {
    initGitRepo(root);
    const lockPath = lockDirPath(root);
    mkdirSync(lockPath, { recursive: true });
    const ownerPath = join(lockPath, 'owner.json');
    const ownerBody = JSON.stringify({ controllerId: 'ctrl-3' });
    writeFileSync(ownerPath, ownerBody);

    const beforeListing = readdirSync(lockPath).sort();
    const beforeOwnerMtime = statSync(ownerPath).mtimeMs;
    const beforeLockMtime = statSync(lockPath).mtimeMs;
    const beforeBytes = readFileSync(ownerPath, 'utf8');

    inspectControllerLease(root);
    inspectControllerLease(root);

    expect(readdirSync(lockPath).sort()).toEqual(beforeListing);
    expect(statSync(ownerPath).mtimeMs).toBe(beforeOwnerMtime);
    expect(statSync(lockPath).mtimeMs).toBe(beforeLockMtime);
    expect(readFileSync(ownerPath, 'utf8')).toBe(beforeBytes);
  });
});
