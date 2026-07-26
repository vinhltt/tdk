import {
  closeSync, fchmodSync, fsyncSync, lstatSync, openSync, renameSync, rmdirSync, unlinkSync, writeFileSync,
} from 'node:fs';
import { dirname } from 'node:path';
import { randomUUID } from 'node:crypto';

function syncDirectory(path: string): void {
  const descriptor = openSync(path, 'r');
  try { fsyncSync(descriptor); } finally { closeSync(descriptor); }
}

export function durableAtomicWriteFileSync(
  path: string,
  bytes: string | NodeJS.ArrayBufferView,
  requestedMode?: number,
): void {
  const directory = dirname(path);
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
    syncDirectory(directory);
  } catch (error) {
    if (descriptor !== undefined) closeSync(descriptor);
    try { unlinkSync(temporary); } catch { /* best-effort cleanup */ }
    throw error;
  }
}

export function durableUnlinkSync(path: string): void {
  unlinkSync(path);
  syncDirectory(dirname(path));
}

export function durableRmdirSync(path: string): void {
  rmdirSync(path);
  syncDirectory(dirname(path));
}
