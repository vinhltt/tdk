import { describe, expect, it } from 'bun:test';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { syncParentDirectory } from '../src/commands/util/parent-directory-sync';

function errnoError(code: string): NodeJS.ErrnoException {
  const error = new Error(code) as NodeJS.ErrnoException;
  error.code = code;
  return error;
}

describe('syncParentDirectory', () => {
  it('syncs a real directory successfully on POSIX using the default fs primitives', () => {
    const dir = mkdtempSync(join(tmpdir(), 'tdk-parent-dir-sync-'));
    try {
      expect(() => syncParentDirectory(join(dir, 'file.txt'))).not.toThrow();
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it('degrades silently for native Windows directory-fsync EPERM', () => {
    const calls: string[] = [];
    expect(() => syncParentDirectory('/some/target.txt', {
      platform: 'win32',
      openSync: (path) => { calls.push(`open:${path}`); return 7; },
      fsyncSync: () => { calls.push('fsync'); throw errnoError('EPERM'); },
      closeSync: (fd) => { calls.push(`close:${fd}`); },
    })).not.toThrow();
    expect(calls).toEqual(['open:/some', 'fsync', 'close:7']);
  });

  it('throws on Windows EINVAL (not a recognized unsupported-capability signal)', () => {
    expect(() => syncParentDirectory('/some/target.txt', {
      platform: 'win32',
      openSync: () => 7,
      fsyncSync: () => { throw errnoError('EINVAL'); },
      closeSync: () => {},
    })).toThrow(/EINVAL/);
  });

  it('throws on Windows EIO', () => {
    expect(() => syncParentDirectory('/some/target.txt', {
      platform: 'win32',
      openSync: () => 7,
      fsyncSync: () => { throw errnoError('EIO'); },
      closeSync: () => {},
    })).toThrow(/EIO/);
  });

  it('throws on non-Windows EPERM (the tolerance is Windows-only)', () => {
    expect(() => syncParentDirectory('/some/target.txt', {
      platform: 'linux',
      openSync: () => 7,
      fsyncSync: () => { throw errnoError('EPERM'); },
      closeSync: () => {},
    })).toThrow(/EPERM/);
  });

  it('propagates open failures untouched by the sync-tolerance policy, even on Windows with EPERM', () => {
    const fsyncCalls: string[] = [];
    expect(() => syncParentDirectory('/some/target.txt', {
      platform: 'win32',
      openSync: () => { throw errnoError('EPERM'); },
      fsyncSync: () => { fsyncCalls.push('fsync'); },
      closeSync: () => {},
    })).toThrow(/EPERM/);
    expect(fsyncCalls).toEqual([]);
  });

  it('propagates close failures distinctly from a sync failure', () => {
    expect(() => syncParentDirectory('/some/target.txt', {
      platform: 'linux',
      openSync: () => 7,
      fsyncSync: () => {},
      closeSync: () => { throw errnoError('EBADF'); },
    })).toThrow(/EBADF/);
  });

  it('never tolerates a close-originated EPERM on Windows: tolerance applies only to the sync operation', () => {
    expect(() => syncParentDirectory('/some/target.txt', {
      platform: 'win32',
      openSync: () => 7,
      fsyncSync: () => {},
      closeSync: () => { throw errnoError('EPERM'); },
    })).toThrow(/EPERM/);
  });

  it('confirms the tolerated Windows EPERM error genuinely originates from the sync call, not open or close', () => {
    let sawFsyncError: unknown;
    expect(() => syncParentDirectory('/some/target.txt', {
      platform: 'win32',
      openSync: () => 7,
      fsyncSync: () => {
        const error = errnoError('EPERM');
        sawFsyncError = error;
        throw error;
      },
      closeSync: () => {},
    })).not.toThrow();
    expect(sawFsyncError).toBeDefined();
    expect((sawFsyncError as NodeJS.ErrnoException).code).toBe('EPERM');
  });
});
