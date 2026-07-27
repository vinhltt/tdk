import {
  closeSync,
  existsSync,
  fsyncSync,
  mkdirSync,
  openSync,
  readFileSync,
  renameSync,
  rmSync,
  writeFileSync,
} from 'node:fs';
import { createHash } from 'node:crypto';
import { dirname } from 'node:path';
import { syncParentDirectory } from './parent-directory-sync';

function hashFile(path: string): string | null {
  if (!existsSync(path)) return null;
  return createHash('sha256').update(readFileSync(path)).digest('hex');
}

function hashContent(content: string): string {
  return createHash('sha256').update(content).digest('hex');
}

export function atomicReplaceTextFile(
  targetPath: string,
  content: string,
  tempPath: string,
  options: { expectedCurrentHash?: string | null } = {},
): void {
  mkdirSync(dirname(tempPath), { recursive: true });
  rmSync(tempPath, { force: true });

  const fd = openSync(tempPath, 'wx');
  try {
    writeFileSync(fd, content, 'utf8');
    fsyncSync(fd);
  } finally {
    closeSync(fd);
  }

  const expectedNewHash = hashContent(content);
  if (hashFile(tempPath) !== expectedNewHash) {
    throw new Error(`Staged write verification failed: ${targetPath}`);
  }
  if (Object.prototype.hasOwnProperty.call(options, 'expectedCurrentHash')
      && hashFile(targetPath) !== options.expectedCurrentHash) {
    throw new Error(`Migration target changed after planning: ${targetPath}`);
  }

  renameSync(tempPath, targetPath);
  syncParentDirectory(targetPath);
  if (hashFile(targetPath) !== expectedNewHash) {
    throw new Error(`Published write verification failed: ${targetPath}`);
  }
}
