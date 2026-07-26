/**
 * parallel-controller-lease-read.ts (C-B7)
 *
 * Shared read-only inspection of the parallel controller's lock directory.
 * Serial `/tdk-implement` entry points and `/tdk-plan` mutation flows use
 * this to detect an active parallel controller without gaining a lock
 * lifecycle of their own.
 *
 * This module NEVER creates, writes, renames, or removes anything. It never
 * acquires, never waits, and applies no TTL/staleness judgement. Lease
 * acquisition, fencing, and release belong to Phase 4 — do not add them here.
 */

import { spawnSync } from 'node:child_process';
import { lstatSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { z } from 'zod';

/** All fields optional/nullable — partial or absent metadata never blocks a `held: true` verdict. */
export const LeaseOwnerSchema = z.object({
  controllerId: z.string().nullish(),
  taskId: z.string().nullish(),
  startedAt: z.string().nullish(),
  updatedAt: z.string().nullish(),
});
export type LeaseOwner = z.infer<typeof LeaseOwnerSchema>;

export type LeaseInspection =
  | { held: false; reason: 'no-git' | 'no-lock-dir' }
  | { held: true; lockPath: string; owner: LeaseOwner | null };

/** Bound on `owner.json` reads — an oversized or non-regular file is treated as unreadable metadata, not an error. */
const MAX_OWNER_FILE_BYTES = 65536;
const OWNER_FILE_NAME = 'owner.json';

/** `git rev-parse --path-format=absolute --git-common-dir` via argv spawning — never shell interpolation. */
function resolveGitCommonDir(projectRoot: string): string | null {
  const result = spawnSync('git', ['rev-parse', '--path-format=absolute', '--git-common-dir'], {
    cwd: projectRoot,
    stdio: ['ignore', 'pipe', 'ignore'],
    encoding: 'utf8',
  });
  if (result.error || result.status !== 0) return null;
  const out = result.stdout.trim();
  return out.length > 0 ? out : null;
}

/** Missing file, oversized file, unreadable file, or malformed/non-matching JSON all degrade to `null` — never thrown. */
function readOwnerFile(ownerPath: string): LeaseOwner | null {
  let stat;
  try {
    stat = statSync(ownerPath);
  } catch {
    return null;
  }
  if (!stat.isFile() || stat.size > MAX_OWNER_FILE_BYTES) return null;

  let raw: string;
  try {
    raw = readFileSync(ownerPath, 'utf8');
  } catch {
    return null;
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return null;
  }

  const result = LeaseOwnerSchema.safeParse(parsed);
  return result.success ? result.data : null;
}

/**
 * Read-only lease inspection. `projectRoot` should already be canonicalized
 * by the caller (e.g. `realpathSync.native`) — this module only forwards it
 * as the `git` subprocess `cwd`.
 */
export function inspectControllerLease(projectRoot: string): LeaseInspection {
  const gitCommonDir = resolveGitCommonDir(projectRoot);
  if (!gitCommonDir) return { held: false, reason: 'no-git' };

  const lockPath = join(gitCommonDir, 'tdk', 'parallel-controller.lock');
  let stat;
  try {
    stat = lstatSync(lockPath);
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') return { held: false, reason: 'no-lock-dir' };
    throw error;
  }

  if (!stat.isDirectory()) return { held: true, lockPath, owner: null };
  return { held: true, lockPath, owner: readOwnerFile(join(lockPath, OWNER_FILE_NAME)) };
}
