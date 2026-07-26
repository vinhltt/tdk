/**
 * parallel-phase-access-grammar.ts (C-B4)
 *
 * Parses the `## Related Code Files` section of a phase markdown file into a
 * complete read/write access declaration. Path syntax, canonicalization,
 * containment, symlink-safe existence, and directory checks all delegate to
 * `parallel-phase-path-policy.ts` (C-B5) — this module owns only the bullet
 * grammar (one section, exact `- Action: \`path\`` shape, no duplicates/
 * cross-action paths, no globs/placeholders).
 *
 * Fixed write-deny classification and git-ignore checks are NOT applied
 * here — they are a distinct write-authorization layer composed on top in
 * `parallel-phase-ownership.ts`, so a plain Read of a deny-listed path is
 * never rejected by this module.
 */

import { realpathSync } from 'node:fs';
import type { Diagnostic } from './parallel-phase-graph-validator';
import { canonicalizeAccessPath, walkProjectPath } from './parallel-phase-path-policy';

export type WriteAction = 'Modify' | 'Create' | 'Delete';

export interface OwnershipEntry {
  action: WriteAction;
  path: string;
}

export interface PhaseAccessResult {
  reads: string[];
  writes: OwnershipEntry[];
  errors: Diagnostic[];
}

const SECTION_HEADING = '## Related Code Files';
const BULLET_PREFIX_RE = /^-\s+(.*)$/;
const CANONICAL_ACTIONS: ReadonlySet<string> = new Set(['Read', 'Modify', 'Create', 'Delete']);
const BACKTICKED_PATH_RE = /^`([^`]+)`$/;
const GLOB_CHARS_RE = /[*?]/;
const PLACEHOLDER_CHARS_RE = /[[\]<>]/;

/** Locate the section body lines: everything between the heading and the next `#` heading or EOF. */
function findSectionBodyLines(lines: string[]): { bodyLines: string[]; sectionCount: number } {
  const headingIndexes: number[] = [];
  for (let i = 0; i < lines.length; i++) {
    if ((lines[i] ?? '').trim() === SECTION_HEADING) headingIndexes.push(i);
  }
  if (headingIndexes.length !== 1) return { bodyLines: [], sectionCount: headingIndexes.length };

  const start = headingIndexes[0]! + 1;
  const bodyLines: string[] = [];
  for (let i = start; i < lines.length; i++) {
    const trimmed = (lines[i] ?? '').trim();
    if (trimmed.startsWith('#')) break;
    bodyLines.push(lines[i] ?? '');
  }
  return { bodyLines, sectionCount: 1 };
}

/** Parse one bullet line's action + raw path, classifying grammar-level defects. */
function parseBulletLine(line: string): { action: string; rawPath: string } | { errorCode: string } {
  const trimmed = line.trim();
  const dashMatch = BULLET_PREFIX_RE.exec(trimmed);
  if (!dashMatch) return { errorCode: 'UNRECOGNIZED_ACCESS_BULLET' };

  const body = dashMatch[1]!;
  const colonIdx = body.indexOf(':');
  if (colonIdx === -1) return { errorCode: 'UNRECOGNIZED_ACCESS_BULLET' };

  const actionPart = body.slice(0, colonIdx).trim();
  const remainder = body.slice(colonIdx + 1).trim();

  if (actionPart.includes(',')) return { errorCode: 'COMBINED_ACTION' };
  if (!CANONICAL_ACTIONS.has(actionPart)) return { errorCode: 'UNRECOGNIZED_ACCESS_BULLET' };

  const pathMatch = BACKTICKED_PATH_RE.exec(remainder);
  if (!pathMatch) return { errorCode: 'UNBACKTICKED_ACCESS_PATH' };

  return { action: actionPart, rawPath: pathMatch[1]! };
}

/**
 * Parse the `## Related Code Files` section into canonical reads/writes.
 * `projectRoot` is resolved internally via `realpathSync.native()`.
 */
export function extractPhaseAccess(markdown: string, projectRoot: string): PhaseAccessResult {
  const realRoot = realpathSync.native(projectRoot);
  const errors: Diagnostic[] = [];
  const reads: string[] = [];
  const writes: OwnershipEntry[] = [];

  const lines = markdown.split('\n');
  const { bodyLines, sectionCount } = findSectionBodyLines(lines);

  if (sectionCount === 0) {
    errors.push({ code: 'MISSING_ACCESS_SECTION', message: `${SECTION_HEADING} section not found` });
    return { reads, writes, errors };
  }
  if (sectionCount > 1) {
    errors.push({ code: 'DUPLICATE_ACCESS_SECTION', message: `multiple ${SECTION_HEADING} sections found` });
    return { reads, writes, errors };
  }

  const seenPaths = new Map<string, string>(); // canonical path -> action already recorded
  for (const rawLine of bodyLines) {
    if (rawLine.trim().length === 0) continue;

    const parsed = parseBulletLine(rawLine);
    if ('errorCode' in parsed) {
      errors.push({ code: parsed.errorCode, message: `malformed access bullet: '${rawLine.trim()}'` });
      continue;
    }
    const { action, rawPath } = parsed;

    if (GLOB_CHARS_RE.test(rawPath)) {
      errors.push({ code: 'GLOB_ACCESS_PATH', message: `access path must not contain a glob: '${rawPath}'` });
      continue;
    }
    if (PLACEHOLDER_CHARS_RE.test(rawPath)) {
      errors.push({ code: 'PLACEHOLDER_ACCESS_PATH', message: `access path looks like an unedited placeholder: '${rawPath}'` });
      continue;
    }

    const canonical = canonicalizeAccessPath(realRoot, rawPath);
    if (!canonical.ok || !canonical.relativePath) {
      errors.push({ code: 'INVALID_ACCESS_PATH', message: `access path '${rawPath}' is invalid: ${canonical.reason}` });
      continue;
    }
    const canonicalPath = canonical.relativePath;

    const previousAction = seenPaths.get(canonicalPath);
    if (previousAction !== undefined) {
      const code = previousAction === action ? 'DUPLICATE_ACCESS_PATH' : 'CROSS_ACTION_ACCESS_PATH';
      errors.push({ code, message: `'${canonicalPath}' already declared under ${previousAction}`, path: canonicalPath });
      continue;
    }
    seenPaths.set(canonicalPath, action);

    if (action === 'Create') {
      if (canonical.hadTrailingSeparator) {
        errors.push({ code: 'ACCESS_TARGET_TRAILING_SEPARATOR', message: `Create target must not end in a separator: '${canonicalPath}'`, path: canonicalPath });
        continue;
      }
      const walk = walkProjectPath(realRoot, canonicalPath);
      if (walk.symlinkComponent) {
        errors.push({ code: 'ACCESS_PATH_SYMLINK_COMPONENT', message: `'${canonicalPath}' has a symlink component`, path: canonicalPath });
        continue;
      }
      if (walk.exists) {
        errors.push({ code: 'ACCESS_TARGET_ALREADY_EXISTS', message: `Create target already exists: '${canonicalPath}'`, path: canonicalPath });
        continue;
      }
      writes.push({ action: 'Create', path: canonicalPath });
      continue;
    }

    // Read | Modify | Delete: require an existing, non-directory, non-symlink-component target.
    const walk = walkProjectPath(realRoot, canonicalPath);
    if (walk.symlinkComponent) {
      errors.push({ code: 'ACCESS_PATH_SYMLINK_COMPONENT', message: `'${canonicalPath}' has a symlink component`, path: canonicalPath });
      continue;
    }
    if (!walk.exists) {
      errors.push({ code: 'ACCESS_TARGET_NOT_FOUND', message: `target does not exist: '${canonicalPath}'`, path: canonicalPath });
      continue;
    }
    if (walk.isDirectory) {
      errors.push({ code: 'ACCESS_TARGET_IS_DIRECTORY', message: `target is a directory, not a file: '${canonicalPath}'`, path: canonicalPath });
      continue;
    }

    if (action === 'Read') reads.push(canonicalPath);
    else writes.push({ action: action as WriteAction, path: canonicalPath });
  }

  return { reads, writes, errors };
}
