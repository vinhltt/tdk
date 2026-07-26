import { lstatSync, readFileSync, realpathSync } from 'node:fs';
import { isAbsolute, relative } from 'node:path';
import type { z } from 'zod';
import { writeAgentJson } from '../../utils/agent-output';

export function readControllerLeaseText(path: string, lock: string): string {
  if (!isAbsolute(path)) throw new Error('input JSON path must be absolute');
  const realLock = realpathSync.native(lock);
  const realPath = realpathSync.native(path);
  const relativePath = relative(realLock, realPath);
  if (relativePath.startsWith('..') || isAbsolute(relativePath) || realPath === realLock) {
    throw new Error('input JSON must be under the owned lease');
  }
  const stat = lstatSync(realPath);
  if (!stat.isFile() || stat.isSymbolicLink() || stat.size > 65536) {
    throw new Error('input JSON must be a bounded regular file');
  }
  return readFileSync(realPath, 'utf8');
}

export function readControllerLeaseJson<T>(path: string, lock: string, schema: z.ZodType<T>): T {
  return schema.parse(JSON.parse(readControllerLeaseText(path, lock)));
}

export function runControllerOperation(action: () => unknown): void {
  try { writeAgentJson(action()); } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    process.stderr.write(`Error: ${message}\n`);
    writeAgentJson({ error: message });
    process.exitCode = error && typeof error === 'object' && 'code' in error ? 1 : 2;
  }
}
