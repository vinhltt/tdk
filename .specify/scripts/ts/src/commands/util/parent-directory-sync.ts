/**
 * parent-directory-sync.ts
 *
 * Single policy owner for parent-directory fsync durability. On POSIX,
 * fsync-ing the parent directory after a rename/unlink/rmdir is required to
 * durably persist the directory-entry change across a crash. Native Windows
 * has no POSIX-equivalent directory-fsync primitive: `fsyncSync()` on a
 * directory descriptor there fails with `EPERM`. That is an unsupported
 * capability, not a failed mutation, so it is the ONLY combination this
 * helper tolerates. Every other failure — including a Windows `EPERM` that
 * originates from `open`/`close` rather than the sync call itself — still
 * throws.
 *
 * CRITICAL for testability: platform and the three fs primitives are all
 * injectable seams for deterministic unit tests. Production defaults call
 * the real Node fs functions and read the real `process.platform`.
 */

import {
  closeSync as nodeCloseSync,
  fsyncSync as nodeFsyncSync,
  openSync as nodeOpenSync,
} from 'node:fs';
import { dirname } from 'node:path';

export interface DirectorySyncOptions {
  /** Defaults to the real running platform (`process.platform`). */
  platform?: NodeJS.Platform;
  /** Defaults to `openSync(directoryPath, 'r')`. */
  openSync?: (directoryPath: string) => number;
  /** Defaults to `fsyncSync(descriptor)`. */
  fsyncSync?: (descriptor: number) => void;
  /** Defaults to `closeSync(descriptor)`. */
  closeSync?: (descriptor: number) => void;
}

/**
 * Opens the parent directory of `targetPath`, attempts a directory fsync,
 * and always closes the descriptor. Suppresses ONLY a directory-fsync
 * failure whose error `code` is `EPERM` while `platform` is `win32`; the
 * open and close calls are never covered by that tolerance.
 */
export function syncParentDirectory(targetPath: string, options: DirectorySyncOptions = {}): void {
  const platform = options.platform ?? process.platform;
  const openDirectory = options.openSync ?? ((directoryPath: string) => nodeOpenSync(directoryPath, 'r'));
  const syncDirectory = options.fsyncSync ?? nodeFsyncSync;
  const closeDirectory = options.closeSync ?? nodeCloseSync;

  const descriptor = openDirectory(dirname(targetPath));

  let syncError: NodeJS.ErrnoException | undefined;
  try {
    syncDirectory(descriptor);
  } catch (error) {
    syncError = error as NodeJS.ErrnoException;
  }

  // Close is unconditional and outside the tolerance: a close failure must
  // always propagate, even when the sync itself was tolerated above.
  closeDirectory(descriptor);

  const isUnsupportedWindowsDirectorySync = platform === 'win32' && syncError?.code === 'EPERM';
  if (syncError && !isUnsupportedWindowsDirectorySync) {
    throw syncError;
  }
}
