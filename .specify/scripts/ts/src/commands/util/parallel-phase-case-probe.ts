/**
 * parallel-phase-case-probe.ts (C-B5)
 *
 * Proves whether the real project root is case-sensitive by creating one
 * unique temp directory under it, writing a mixed-case sentinel file, and
 * checking whether a case-swapped name aliases it. Always cleans up in a
 * `finally`, reporting the exact bounded sentinel path on cleanup failure —
 * never a broader deletion.
 *
 * `detectAlias` and `removeDir` are injectable because a genuinely
 * case-insensitive filesystem (or a forced cleanup failure) cannot be
 * produced deterministically on this host — the same testability rationale
 * as the mountinfo/lstat injection in parallel-phase-mount-capability.ts.
 */

import { existsSync, mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

export interface CaseProbeResult {
  ok: boolean;
  reason?: string;
}

export interface CaseProbeOptions {
  /** Defaults to `existsSync(swappedPath)`. */
  detectAlias?: (swappedPath: string) => boolean;
  /** Defaults to `rmSync(path, { recursive: true, force: true })`. */
  removeDir?: (path: string) => void;
}

const SENTINEL_NAME = 'CaseProbeSentinel.tmp';

function swapCase(value: string): string {
  return [...value].map((ch) => (ch === ch.toUpperCase() ? ch.toLowerCase() : ch.toUpperCase())).join('');
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

/**
 * Through one unique temp directory under the real `projectRoot`: create a
 * mixed-case sentinel, test whether a case-swapped name aliases it, and
 * remove the directory in `finally`. A detected alias, a probe error, or a
 * cleanup failure all reject parallel mode.
 */
export function probeProjectCaseSensitivity(projectRoot: string, options: CaseProbeOptions = {}): CaseProbeResult {
  const detectAlias = options.detectAlias ?? existsSync;
  const removeDir = options.removeDir ?? ((p: string) => rmSync(p, { recursive: true, force: true }));

  const probeDirName = `.tdk-parallel-case-probe-${process.pid}-${Date.now()}-${Math.random().toString(36).slice(2)}`;
  const probeDir = join(projectRoot, probeDirName);
  const sentinelPath = join(probeDir, SENTINEL_NAME);
  const swappedPath = join(probeDir, swapCase(SENTINEL_NAME));

  let result: CaseProbeResult;
  try {
    mkdirSync(probeDir);
    writeFileSync(sentinelPath, '');
    result = detectAlias(swappedPath) ? { ok: false, reason: 'case-insensitive-root' } : { ok: true };
  } catch (error) {
    result = { ok: false, reason: `case-probe-error: ${errorMessage(error)}` };
  } finally {
    try {
      removeDir(probeDir);
    } catch {
      result = { ok: false, reason: `case-probe-cleanup-failed: ${probeDir}` };
    }
  }
  return result;
}
