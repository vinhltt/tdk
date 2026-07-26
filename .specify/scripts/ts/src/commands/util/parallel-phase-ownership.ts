/**
 * parallel-phase-ownership.ts (C-B4 + C-B5 composition entry)
 *
 * Public entry point other phases (and Batch C's wave resolver) import from.
 * Composes:
 *   - C-B1 frontmatter reader (Batch A)          → parallel_safe mode
 *   - C-B4 access grammar (parallel-phase-access-grammar.ts) → reads/writes
 *   - C-B5 path policy + write-deny policy       → write authorization
 * into one `resolvePhaseAccess(markdown, projectRoot)` call, plus the
 * effective-read-authority predicate and the cross-phase conflict detector
 * Batch C's resolver needs for wave selection.
 *
 * Every sub-module export is re-exported here so callers need only one
 * import path.
 */

import { realpathSync } from 'node:fs';
import { readParallelSafety, readPhaseFrontmatter } from './phase-frontmatter-reader';
import type { Diagnostic } from './parallel-phase-graph-validator';
import { extractPhaseAccess, type OwnershipEntry, type PhaseAccessResult, type WriteAction } from './parallel-phase-access-grammar';
import { checkGitIgnoredWrite } from './parallel-phase-path-policy';
import { findFixedDenyReason } from './parallel-phase-write-deny-policy';

export type { OwnershipEntry, PhaseAccessResult, WriteAction };
export { extractPhaseAccess };
export {
  canonicalizeAccessPath,
  checkGitIgnoredWrite,
  findNearestExistingAncestor,
  walkProjectPath,
  type CanonicalPathResult,
  type GitIgnoreCheckResult,
  type ProjectPathWalkResult,
} from './parallel-phase-path-policy';
export {
  findFixedDenyReason,
  ROOT_SHARED_WRITE_DENY_NAMES,
  ROOT_SHARED_WRITE_DENY_PATTERNS,
} from './parallel-phase-write-deny-policy';
export {
  parseMountInfo,
  resolveProjectFilesystemCapability,
  type FilesystemCapabilityOptions,
  type FilesystemCapabilityResult,
  type MountRecord,
} from './parallel-phase-mount-capability';
export {
  probeProjectCaseSensitivity,
  type CaseProbeOptions,
  type CaseProbeResult,
} from './parallel-phase-case-probe';

/**
 * Resolve one phase's authoritative read/write access: grammar-level
 * reads/writes (C-B4) plus write authorization (fixed deny set + git-ignore,
 * C-B5) plus the `auto` mode's "at least one write" requirement. This is the
 * function planner/controller/resolver call — `extractPhaseAccess` alone
 * does not apply deny-set or git-ignore checks, so a plain Read of a
 * deny-listed path is never rejected.
 */
export function resolvePhaseAccess(markdown: string, projectRoot: string): PhaseAccessResult {
  const { metadata } = readPhaseFrontmatter(markdown);
  const { parallelSafe } = readParallelSafety(metadata);
  const access = extractPhaseAccess(markdown, projectRoot);
  const errors: Diagnostic[] = [...access.errors];

  if (parallelSafe === 'auto' && access.writes.length === 0) {
    errors.push({
      code: 'AUTO_PHASE_REQUIRES_WRITE',
      message: 'parallel_safe: auto requires at least one Modify/Create/Delete write',
    });
  }

  const realRoot = realpathSync.native(projectRoot);
  for (const entry of access.writes) {
    const denyReason = findFixedDenyReason(entry.path);
    if (denyReason) {
      errors.push({ code: 'DENIED_WRITE_PATH', message: `write to '${entry.path}' is denied (${denyReason})`, path: entry.path });
    }
    const gitResult = checkGitIgnoredWrite(realRoot, entry.path);
    if (gitResult === 'ignored') {
      errors.push({ code: 'GIT_IGNORED_WRITE_PATH', message: `write to '${entry.path}' is git-ignored`, path: entry.path });
    } else if (gitResult === 'error') {
      errors.push({ code: 'GIT_CHECK_IGNORE_FAILED', message: `git check-ignore failed for '${entry.path}'`, path: entry.path });
    }
  }

  return { reads: access.reads, writes: access.writes, errors };
}

/**
 * Effective worker read authority = canonical Read set + own Modify/Delete
 * targets + a Create target only after that worker creates it (`createdPaths`).
 */
export function isPathWithinEffectiveReadAuthority(
  access: { reads: string[]; writes: OwnershipEntry[] },
  targetPath: string,
  createdPaths: ReadonlySet<string> = new Set()
): boolean {
  if (access.reads.includes(targetPath)) return true;
  for (const entry of access.writes) {
    if (entry.path !== targetPath) continue;
    if (entry.action === 'Modify' || entry.action === 'Delete') return true;
    if (entry.action === 'Create') return createdPaths.has(targetPath);
  }
  return false;
}

export type AccessConflictKind = 'write-write' | 'write-read' | 'read-write';
export type AccessConflictOverlap = 'same-path' | 'ancestor';

/** Cross-phase write/write or write/read intersection. Read/read never conflicts. */
export interface WaveConflict {
  phase: number;
  candidate: number;
  phasePath: string;
  candidatePath: string;
  access: AccessConflictKind;
  overlap: AccessConflictOverlap;
}

export interface PhaseAccessSummary {
  phase: number;
  reads: string[];
  writes: string[];
}

function classifyPathOverlap(a: string, b: string): AccessConflictOverlap | null {
  if (a === b) return 'same-path';
  if (a.startsWith(`${b}/`) || b.startsWith(`${a}/`)) return 'ancestor';
  return null;
}

/**
 * Detect conflicts between `phase`'s access and `candidate`'s access.
 * Directional: `access` describes the relationship from `phase`'s side, so
 * swapping the two arguments swaps `write-read` and `read-write`. Read/read
 * overlap is never a conflict. Output is sorted for determinism.
 */
export function detectPhaseAccessConflicts(phase: PhaseAccessSummary, candidate: PhaseAccessSummary): WaveConflict[] {
  const conflicts: WaveConflict[] = [];
  const phaseWrites = [...phase.writes].sort();
  const candidateWrites = [...candidate.writes].sort();
  const candidateReads = [...candidate.reads].sort();
  const phaseReads = [...phase.reads].sort();

  for (const w of phaseWrites) {
    for (const cw of candidateWrites) {
      const overlap = classifyPathOverlap(w, cw);
      if (overlap) {
        conflicts.push({ phase: phase.phase, candidate: candidate.phase, phasePath: w, candidatePath: cw, access: 'write-write', overlap });
      }
    }
    for (const cr of candidateReads) {
      const overlap = classifyPathOverlap(w, cr);
      if (overlap) {
        conflicts.push({ phase: phase.phase, candidate: candidate.phase, phasePath: w, candidatePath: cr, access: 'write-read', overlap });
      }
    }
  }
  for (const r of phaseReads) {
    for (const cw of candidateWrites) {
      const overlap = classifyPathOverlap(r, cw);
      if (overlap) {
        conflicts.push({ phase: phase.phase, candidate: candidate.phase, phasePath: r, candidatePath: cw, access: 'read-write', overlap });
      }
    }
  }
  return conflicts;
}
