import {
  closeSync, fchmodSync, fsyncSync, lstatSync, openSync, renameSync, rmdirSync, unlinkSync, writeFileSync,
} from 'node:fs';
import { randomUUID } from 'node:crypto';
import { syncParentDirectory } from './parent-directory-sync';

export function durableAtomicWriteFileSync(
  path: string,
  bytes: string | NodeJS.ArrayBufferView,
  requestedMode?: number,
): void {
  const temporary = `${path}.tmp-${randomUUID()}`;
  const mode = requestedMode ?? (lstatSync(path).mode & 0o7777);
  let descriptor: number | undefined;
  try {
    descriptor = openSync(temporary, 'wx', mode);
    fchmodSync(descriptor, mode);
    if (typeof bytes === 'string') writeFileSync(descriptor, bytes, 'utf8');
    else writeFileSync(descriptor, bytes);
    fsyncSync(descriptor);
    closeSync(descriptor);
    descriptor = undefined;
    renameSync(temporary, path);
    syncParentDirectory(path);
  } catch (error) {
    if (descriptor !== undefined) closeSync(descriptor);
    try { unlinkSync(temporary); } catch { /* best-effort cleanup */ }
    throw error;
  }
}

export function durableUnlinkSync(path: string): void {
  unlinkSync(path);
  syncParentDirectory(path);
}

export function durableRmdirSync(path: string): void {
  rmdirSync(path);
  syncParentDirectory(path);
}
