/**
 * parallel-phase-path-policy.ts (C-B5)
 *
 * Path syntax, canonicalization, containment, symlink-safe existence checks,
 * and the git-ignore write check. Fixed deny-set classification lives in the
 * sibling module `parallel-phase-write-deny-policy.ts`.
 *
 * V1 platform: POSIX and WSL POSIX paths only. This module is intentionally
 * OS-agnostic on path syntax (it always rejects backslash/drive-letter/UNC
 * forms, regardless of the host `process.platform`); the "native Windows is
 * unsupported" host-platform gate belongs to `parallel-phase-mount-capability.ts`,
 * which is where the Linux-vs-non-Linux-vs-Windows branch actually matters.
 */

import { spawnSync } from 'node:child_process';
import { lstatSync } from 'node:fs';
import { join, relative as pathRelative } from 'node:path';

export interface CanonicalPathResult {
  ok: boolean;
  relativePath?: string;
  hadTrailingSeparator?: boolean;
  reason?: string;
}

const DRIVE_LETTER_RE = /^[A-Za-z]:/;
const UNC_RE = /^\/\/[^/]/;

/**
 * Resolve a raw declared path (project-relative or in-root absolute) to a
 * canonical, non-empty, project-relative POSIX path. `realProjectRoot` MUST
 * already be resolved (e.g. via `realpathSync.native()`).
 */
export function canonicalizeAccessPath(realProjectRoot: string, rawPath: string): CanonicalPathResult {
  if (rawPath.trim().length === 0) return { ok: false, reason: 'empty-path' };
  if (DRIVE_LETTER_RE.test(rawPath)) return { ok: false, reason: 'drive-letter-path' };
  if (UNC_RE.test(rawPath)) return { ok: false, reason: 'unc-path' };
  if (rawPath.includes('\\')) return { ok: false, reason: 'backslash-path' };

  const hadTrailingSeparator = rawPath.length > 1 && rawPath.endsWith('/');

  let relative: string;
  if (rawPath.startsWith('/')) {
    const rel = pathRelative(realProjectRoot, rawPath);
    if (rel === '' || rel.startsWith('..')) return { ok: false, reason: 'root-escape' };
    relative = rel;
  } else {
    // Normalize `.`/`..` segments without touching separators (already POSIX-only above).
    const segments = rawPath.split('/').filter((s) => s.length > 0 && s !== '.');
    const normalized: string[] = [];
    for (const seg of segments) {
      if (seg === '..') {
        if (normalized.length === 0) return { ok: false, reason: 'root-escape' };
        normalized.pop();
      } else {
        normalized.push(seg);
      }
    }
    relative = normalized.join('/');
  }

  if (relative.length === 0) return { ok: false, reason: 'root-escape' };
  return { ok: true, relativePath: relative, hadTrailingSeparator };
}

export interface ProjectPathWalkResult {
  exists: boolean;
  isDirectory: boolean;
  symlinkComponent: boolean;
}

/**
 * Walk every path component from `projectRoot` down `relativePath`, lstat-ing
 * each one. Rejects (via `symlinkComponent: true`) as soon as any existing
 * component — ancestor or leaf — is a symlink/junction. Stops at the first
 * missing component (the absent tail is fine for a `Create` target; the
 * caller validates only the nearest existing ancestor by construction).
 */
export function walkProjectPath(projectRoot: string, relativePath: string): ProjectPathWalkResult {
  const segments = relativePath.split('/').filter((s) => s.length > 0);
  let current = projectRoot;
  let isDirectory = false;
  for (const segment of segments) {
    current = join(current, segment);
    let stat;
    try {
      stat = lstatSync(current);
    } catch {
      return { exists: false, isDirectory: false, symlinkComponent: false };
    }
    if (stat.isSymbolicLink()) {
      return { exists: true, isDirectory: false, symlinkComponent: true };
    }
    isDirectory = stat.isDirectory();
  }
  return { exists: true, isDirectory, symlinkComponent: false };
}

/**
 * Deepest existing absolute path along `relativePath` from `projectRoot`
 * (returns `projectRoot` itself when nothing along the path exists). Used to
 * feed an absent `Create` target's nearest existing ancestor into
 * `resolveProjectFilesystemCapability`, per C-B5.
 */
export function findNearestExistingAncestor(projectRoot: string, relativePath: string): string {
  const segments = relativePath.split('/').filter((s) => s.length > 0);
  let current = projectRoot;
  for (const segment of segments) {
    const next = join(current, segment);
    try {
      lstatSync(next);
    } catch {
      return current;
    }
    current = next;
  }
  return current;
}

export type GitIgnoreCheckResult = 'ignored' | 'not-ignored' | 'error';

/**
 * Run `git check-ignore -q -- <path>` via argv spawning (never shell
 * interpolation). Exit 0 denies (ignored), exit 1 allows (not ignored), any
 * other exit — including a missing git binary or a non-repository root —
 * fails closed as `'error'`.
 */
export function checkGitIgnoredWrite(projectRoot: string, gitRelativePath: string): GitIgnoreCheckResult {
  const result = spawnSync('git', ['check-ignore', '-q', '--', gitRelativePath], {
    cwd: projectRoot,
    stdio: 'pipe',
  });
  if (result.error) return 'error';
  if (result.status === 0) return 'ignored';
  if (result.status === 1) return 'not-ignored';
  return 'error';
}
