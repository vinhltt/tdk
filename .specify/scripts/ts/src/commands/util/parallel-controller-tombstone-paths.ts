import { readdirSync } from 'node:fs';
import { basename, dirname, join } from 'node:path';

export function findParallelControllerRecoveryTombstones(lockPath: string, controllerId: string): string[] {
  const prefix = `${basename(lockPath)}.recovered-`;
  const suffix = `-${controllerId}`;
  return readdirSync(dirname(lockPath), { withFileTypes: true })
    .filter((entry) => entry.isDirectory() && entry.name.startsWith(prefix) && entry.name.endsWith(suffix))
    .map((entry) => join(dirname(lockPath), entry.name));
}
