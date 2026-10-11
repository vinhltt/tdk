import * as fs from 'node:fs';

export type CreateNewFileError = 'collision_exists' | 'write_failed';

/**
 * Create-new only: never replaces, appends to, or follows anything already at `path`.
 * Returns null on success, otherwise the failure code. Cleanup is limited to the inode this call opened.
 * The single copy of the anti-overwrite rule; /tdk-handoff and /tdk-review both write through it.
 */
export function createNewFile(path: string, body: string, mode: number): CreateNewFileError | null {
  // Bun on Windows follows dangling final symlinks even with wx; reject every occupied entry first.
  let existing: fs.Stats | undefined;
  try { existing = fs.lstatSync(path, { throwIfNoEntry: false }); }
  catch { return 'write_failed'; }
  if (existing) return 'collision_exists';
  let fd: number;
  try { fd = fs.openSync(path, 'wx', mode); }
  catch (error) {
    return error instanceof Error && 'code' in error && error.code === 'EEXIST' ? 'collision_exists' : 'write_failed';
  }
  let identity: fs.BigIntStats | undefined;
  let closed = false;
  try {
    identity = fs.fstatSync(fd, { bigint: true });
    fs.writeFileSync(fd, body, 'utf8');
    fs.closeSync(fd);
    closed = true;
    return null;
  } catch {
    if (!closed) { try { fs.closeSync(fd); } catch { /* Preserve the original write/close failure. */ } }
    try {
      const current = fs.lstatSync(path, { bigint: true });
      if (identity && current.isFile() && current.dev === identity.dev && current.ino === identity.ino) fs.unlinkSync(path);
    } catch { /* Cleanup failure cannot turn an incomplete write into success. */ }
    return 'write_failed';
  }
}
