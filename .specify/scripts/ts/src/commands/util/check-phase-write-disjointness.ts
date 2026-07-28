/**
 * check-phase-write-disjointness.ts
 *
 * One public entry point: re-exports both host adapters (ported verbatim into
 * `check-phase-write-disjointness-host-adapters.ts` to hold this file's LOC down)
 * plus the pure pipeline and the retained `extractPhaseAccess` grammar parser.
 *
 * CLI input is exactly one shape: a JSON array of
 * `{phase, read[], modify[], create[], delete[]}` on stdin, built by the calling
 * agent from each phase's `## Related Code Files` bullets. The CLI never parses
 * markdown; `extractPhaseAccess` is a library export only, used by
 * `resolvePhaseAccess` for `validate-phase-file --mode parallel`, unreachable
 * from any flag here.
 *
 * Pipeline: 1 validate input (glob/placeholder/directory-target/duplicate/
 * cross-action) -> 2 canonicalize (root-escape, symlink-component) -> 3 case-fold
 * [host, schedule only] -> 4 mount capability [host, schedule only] -> 5 prefix
 * containment (the comparison primitive step 7 uses) -> 6 deny class (migration/
 * lockfile/generated/gitignored) -> 7 pairwise intersect (write/write +
 * write/declared-read, both modes).
 *
 * `--validate-only` runs 1,2,5,6,7 and MUST NOT invoke the case-probe or
 * mount-capability adapters — this is what makes native-Windows `/tdk-plan` work.
 * Deliberate consequence: under `--validate-only`, two paths differing only by
 * case are NOT flagged — plan time has no target filesystem to probe, so
 * case-fold defers to scheduling time on the real host. Do not "fix" this into
 * a host call.
 */

import { spawnSync } from 'node:child_process';
import { lstatSync, readFileSync, realpathSync } from 'node:fs';
import { join, relative as pathRelative } from 'node:path';
import { Command } from 'commander';
import { formatAgentJson, writeAgentJson } from '../../utils';
import { readParallelSafety, readPhaseFrontmatter } from './phase-frontmatter-reader';
import {
  probeProjectCaseSensitivity,
  resolveProjectFilesystemCapability,
  type CaseProbeResult,
  type FilesystemCapabilityOptions,
  type FilesystemCapabilityResult,
} from './check-phase-write-disjointness-host-adapters';

export {
  parseMountInfo,
  probeProjectCaseSensitivity,
  resolveProjectFilesystemCapability,
  type CaseProbeOptions,
  type CaseProbeResult,
  type FilesystemCapabilityOptions,
  type FilesystemCapabilityResult,
  type MountRecord,
} from './check-phase-write-disjointness-host-adapters';

// Data model (absorbed from parallel-phase-access-grammar.ts / graph-validator.ts)

export type WriteAction = 'Modify' | 'Create' | 'Delete';
export type AccessAction = 'Read' | WriteAction;

export interface OwnershipEntry { action: WriteAction; path: string }
/** Shared diagnostic shape. */
export interface Diagnostic { code: string; message: string; phase?: number; path?: string }
export interface PhaseAccessResult { reads: string[]; writes: OwnershipEntry[]; errors: Diagnostic[] }

// Path policy (ported from parallel-phase-path-policy.ts). V1 platform: POSIX and WSL POSIX paths only — backslash/drive-letter/UNC forms always reject, regardless of host `process.platform`.

interface CanonicalPathResult { ok: boolean; relativePath?: string; hadTrailingSeparator?: boolean; reason?: string }

const DRIVE_LETTER_RE = /^[A-Za-z]:/;
const UNC_RE = /^\/\/[^/]/;

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

export interface ProjectPathWalkResult { exists: boolean; isDirectory: boolean; symlinkComponent: boolean }

/** Walk each path component; rejects as soon as any existing component is a symlink. */
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
    if (stat.isSymbolicLink()) return { exists: true, isDirectory: false, symlinkComponent: true };
    isDirectory = stat.isDirectory();
  }
  return { exists: true, isDirectory, symlinkComponent: false };
}

/** Deepest existing absolute ancestor of `relativePath` — feeds an absent Create target's nearest ancestor into `resolveProjectFilesystemCapability`. */
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

/** `git check-ignore -q --` via argv spawn (never shell interpolation); any non-0/1 exit fails closed as `'error'`. */
export function checkGitIgnoredWrite(projectRoot: string, gitRelativePath: string): GitIgnoreCheckResult {
  const result = spawnSync('git', ['check-ignore', '-q', '--', gitRelativePath], { cwd: projectRoot, stdio: 'pipe' });
  if (result.error) return 'error';
  if (result.status === 0) return 'ignored';
  if (result.status === 1) return 'not-ignored';
  return 'error';
}

// Write-deny policy (ported from parallel-phase-write-deny-policy.ts). Every path here MUST already be canonicalized (project-relative, forward slashes).

export const ROOT_SHARED_WRITE_DENY_NAMES: ReadonlySet<string> = new Set([
  'package.json', 'pnpm-workspace.yaml', 'bunfig.toml', 'deno.json', 'deno.jsonc',
  'turbo.json', 'nx.json', 'lerna.json', 'Cargo.toml', 'go.mod', 'go.work',
  'pyproject.toml', 'Pipfile', 'Gemfile', 'composer.json', 'pom.xml', 'build.gradle',
  'build.gradle.kts', 'settings.gradle', 'settings.gradle.kts', 'gradle.properties',
  'Directory.Build.props', 'Directory.Build.targets', 'Directory.Packages.props',
  'global.json', 'NuGet.Config',
]);

export const ROOT_SHARED_WRITE_DENY_PATTERNS: readonly RegExp[] = [/^requirements[^/]*\.txt$/i];

const LOCK_FILE_EXACT_NAMES_LOWER: ReadonlySet<string> = new Set([
  'bun.lockb', 'package-lock.json', 'npm-shrinkwrap.json', 'pnpm-lock.yaml', 'go.sum', 'package.resolved',
]);

function isLockFileName(basename: string): boolean {
  const lower = basename.toLowerCase();
  return lower.endsWith('.lock') || LOCK_FILE_EXACT_NAMES_LOWER.has(lower);
}

function includesConsecutivePair(segments: string[], first: string, second: string): boolean {
  for (let i = 0; i < segments.length - 1; i++) {
    if (segments[i] === first && segments[i + 1] === second) return true;
  }
  return false;
}

function underSpecifyChild(segments: string[], child: string): boolean {
  const idx = segments.indexOf('.specify');
  return idx !== -1 && segments[idx + 1] === child;
}

function specifyExactSuffixFrom(segments: string[], anchor: string, suffix: string[]): boolean {
  const idx = segments.indexOf(anchor);
  if (idx === -1) return false;
  const tail = segments.slice(idx + 1);
  return tail.length === suffix.length && tail.every((s, i) => s === suffix[i]);
}

function specifyExactSuffix(segments: string[], suffix: string[]): boolean {
  return specifyExactSuffixFrom(segments, '.specify', suffix);
}

function specifyDepsCacheBasename(segments: string[], basename: string): boolean {
  return segments.includes('.specify') && basename.startsWith('.deps-cache.json');
}

/** Classify a canonical write path against the fixed deny policy; null = not fixed-deny (still subject to git-ignore). */
export function findFixedDenyReason(relativePath: string): string | null {
  const segments = relativePath.split('/');
  const basename = segments[segments.length - 1] ?? '';

  if (segments.includes('.git')) return 'git-segment';
  if (segments.includes('migrations')) return 'migrations-segment';
  if (includesConsecutivePair(segments, 'db', 'migrate') || includesConsecutivePair(segments, 'database', 'migrate')) {
    return 'migrate-sequence';
  }
  if (isLockFileName(basename)) return 'lock-file';
  if (segments.includes('.github') || segments.includes('.gitlab') || segments.includes('.circleci')) return 'ci-control-tree';
  if (segments.length === 1 && /^tsconfig.*\.json$/.test(basename)) return 'root-tsconfig';
  if (basename === '.gitignore' || basename === '.gitattributes' || basename === 'AGENTS.md' || basename === 'CLAUDE.md') {
    return 'git-control-file';
  }
  if (segments.length === 1 && ROOT_SHARED_WRITE_DENY_NAMES.has(basename)) return 'root-shared-file';
  if (segments.length === 1 && ROOT_SHARED_WRITE_DENY_PATTERNS.some((re) => re.test(basename))) return 'root-shared-pattern';
  if (segments[0] === '.claude' || segments[0] === '.codex' || segments[0] === '.agents') return 'harness-control-tree';

  if (underSpecifyChild(segments, 'codex-plugins')) return 'tdk-specify-generated';
  if (specifyExactSuffix(segments, ['release-manifest.json'])) return 'tdk-specify-generated';
  if (specifyDepsCacheBasename(segments, basename)) return 'tdk-specify-generated';
  if (underSpecifyChild(segments, 'state')) return 'tdk-specify-generated';
  if (specifyExactSuffix(segments, ['plugins', 'manifest.json'])) return 'tdk-specify-generated';
  if (specifyExactSuffix(segments, ['plugins', 'plugin-dependencies.json'])) return 'tdk-specify-generated';
  if (specifyExactSuffix(segments, ['.specify.json'])) return 'tdk-specify-generated';
  if (basename === 'distribute.json') return 'tdk-generated-file';
  if (specifyExactSuffixFrom(segments, '.claude-plugin', ['marketplace.json'])) return 'tdk-generated-file';

  return null;
}

/** Deny-class (fixed list) + git-ignore, applied to one canonical write path. Shared by `resolvePhaseAccess` and the checker's own step 6. */
function checkWriteAuthorization(canonicalPath: string, realRoot: string): Diagnostic[] {
  const diagnostics: Diagnostic[] = [];
  const denyReason = findFixedDenyReason(canonicalPath);
  if (denyReason) {
    diagnostics.push({ code: 'DENIED_WRITE_PATH', message: `write to '${canonicalPath}' is denied (${denyReason})`, path: canonicalPath });
  }
  const gitResult = checkGitIgnoredWrite(realRoot, canonicalPath);
  if (gitResult === 'ignored') {
    diagnostics.push({ code: 'GIT_IGNORED_WRITE_PATH', message: `write to '${canonicalPath}' is git-ignored`, path: canonicalPath });
  } else if (gitResult === 'error') {
    diagnostics.push({ code: 'GIT_CHECK_IGNORE_FAILED', message: `git check-ignore failed for '${canonicalPath}'`, path: canonicalPath });
  }
  return diagnostics;
}

// Shared per-path validator (steps 1-2). Used by both `extractPhaseAccess` (markdown bullets) and the CLI pipeline (JSON-declared paths) so the two input shapes share one source of truth for path-level rejection.

const GLOB_CHARS_RE = /[*?]/;
const PLACEHOLDER_CHARS_RE = /[[\]<>]/;

type PathValidationResult = { ok: true; canonicalPath: string } | { ok: false; diagnostic: Diagnostic };

function fail(code: string, message: string, path?: string): PathValidationResult {
  return { ok: false, diagnostic: path === undefined ? { code, message } : { code, message, path } };
}

/** Validate + canonicalize one declared path for one phase's own `seenPaths` map (duplicate/cross-action are per-phase). */
function validateOneAccessPath(
  realRoot: string,
  action: AccessAction,
  rawPath: string,
  seenPaths: Map<string, AccessAction>
): PathValidationResult {
  if (GLOB_CHARS_RE.test(rawPath)) return fail('GLOB_ACCESS_PATH', `access path must not contain a glob: '${rawPath}'`);
  if (PLACEHOLDER_CHARS_RE.test(rawPath)) return fail('PLACEHOLDER_ACCESS_PATH', `access path looks like an unedited placeholder: '${rawPath}'`);

  const canonical = canonicalizeAccessPath(realRoot, rawPath);
  if (!canonical.ok || !canonical.relativePath) return fail('INVALID_ACCESS_PATH', `access path '${rawPath}' is invalid: ${canonical.reason}`);
  const canonicalPath = canonical.relativePath;

  const previousAction = seenPaths.get(canonicalPath);
  if (previousAction !== undefined) {
    const code = previousAction === action ? 'DUPLICATE_ACCESS_PATH' : 'CROSS_ACTION_ACCESS_PATH';
    return fail(code, `'${canonicalPath}' already declared under ${previousAction}`, canonicalPath);
  }
  seenPaths.set(canonicalPath, action);

  if (action === 'Create') {
    if (canonical.hadTrailingSeparator) return fail('ACCESS_TARGET_TRAILING_SEPARATOR', `Create target must not end in a separator: '${canonicalPath}'`, canonicalPath);
    const walk = walkProjectPath(realRoot, canonicalPath);
    if (walk.symlinkComponent) return fail('ACCESS_PATH_SYMLINK_COMPONENT', `'${canonicalPath}' has a symlink component`, canonicalPath);
    if (walk.exists) return fail('ACCESS_TARGET_ALREADY_EXISTS', `Create target already exists: '${canonicalPath}'`, canonicalPath);
    return { ok: true, canonicalPath };
  }

  const walk = walkProjectPath(realRoot, canonicalPath);
  if (walk.symlinkComponent) return fail('ACCESS_PATH_SYMLINK_COMPONENT', `'${canonicalPath}' has a symlink component`, canonicalPath);
  if (!walk.exists) return fail('ACCESS_TARGET_NOT_FOUND', `target does not exist: '${canonicalPath}'`, canonicalPath);
  if (walk.isDirectory) return fail('ACCESS_TARGET_IS_DIRECTORY', `target is a directory, not a file: '${canonicalPath}'`, canonicalPath);
  return { ok: true, canonicalPath };
}

// extractPhaseAccess — retained library grammar parser (~85 LOC), NOT reachable from the CLI. Owns the `## Related Code Files` bullet grammar only; path-level validation delegates to `validateOneAccessPath` above. The 6 grammar-level reject codes it alone can produce (a malformed bullet is silently inferred by an agent, never surfaced) are: MISSING_ACCESS_SECTION, DUPLICATE_ACCESS_SECTION, UNRECOGNIZED_ACCESS_BULLET, UNBACKTICKED_ACCESS_PATH, COMBINED_ACTION, INVALID_ACCESS_PATH (this last one is also reachable from the checker's own step-2 canonicalize on JSON input — same failure semantics, shared code name).

const SECTION_HEADING = '## Related Code Files';
const BULLET_PREFIX_RE = /^-\s+(.*)$/;
const CANONICAL_ACTIONS: ReadonlySet<string> = new Set(['Read', 'Modify', 'Create', 'Delete']);
const BACKTICKED_PATH_RE = /^`([^`]+)`$/;

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

function parseBulletLine(line: string): { action: AccessAction; rawPath: string } | { errorCode: string } {
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

  return { action: actionPart as AccessAction, rawPath: pathMatch[1]! };
}

/** Parse the `## Related Code Files` section into canonical reads/writes. `projectRoot` is resolved via `realpathSync.native()`. */
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

  const seenPaths = new Map<string, AccessAction>();
  for (const rawLine of bodyLines) {
    if (rawLine.trim().length === 0) continue;

    const parsed = parseBulletLine(rawLine);
    if ('errorCode' in parsed) {
      errors.push({ code: parsed.errorCode, message: `malformed access bullet: '${rawLine.trim()}'` });
      continue;
    }
    const { action, rawPath } = parsed;
    const result = validateOneAccessPath(realRoot, action, rawPath, seenPaths);
    if (!result.ok) {
      errors.push(result.diagnostic);
      continue;
    }
    if (action === 'Read') reads.push(result.canonicalPath);
    else writes.push({ action, path: result.canonicalPath });
  }

  return { reads, writes, errors };
}

/**
 * Composition entry point `phase-file-validator.ts` calls for `--mode parallel`:
 * grammar (`extractPhaseAccess`) + the `auto` mode's "at least one write" rule +
 * write authorization (fixed deny set + git-ignore). This is what reaches all
 * 19 reject codes from markdown; `extractPhaseAccess` alone reaches only 15.
 */
export function resolvePhaseAccess(markdown: string, projectRoot: string): PhaseAccessResult {
  const { metadata } = readPhaseFrontmatter(markdown);
  const { parallelSafe } = readParallelSafety(metadata);
  const access = extractPhaseAccess(markdown, projectRoot);
  const errors: Diagnostic[] = [...access.errors];

  if (parallelSafe === 'auto' && access.writes.length === 0) {
    errors.push({ code: 'AUTO_PHASE_REQUIRES_WRITE', message: 'parallel_safe: auto requires at least one Modify/Create/Delete write' });
  }

  const realRoot = realpathSync.native(projectRoot);
  for (const entry of access.writes) {
    errors.push(...checkWriteAuthorization(entry.path, realRoot));
  }

  return { reads: access.reads, writes: access.writes, errors };
}

// CLI pipeline: JSON access-set array -> {safe, conflicts, rejected}.

export interface PhaseAccessDeclaration { phase: number; read: string[]; modify: string[]; create: string[]; delete: string[] }
export interface DisjointnessConflict { a: number; b: number; paths: string[] }
export interface DisjointnessRejection { phase: number; code: string; message: string; path?: string }
export interface DisjointnessResult { safe: number[]; conflicts: DisjointnessConflict[]; rejected: DisjointnessRejection[] }
export type DisjointnessMode = 'schedule' | 'validate-only';

export interface DisjointnessHostDeps {
  /** Test seam only. Defaults to the real `probeProjectCaseSensitivity`. */
  probeCaseSensitivity?: (projectRoot: string) => CaseProbeResult;
  /** Test seam only. Defaults to the real `resolveProjectFilesystemCapability`. */
  resolveCapability?: (
    realProjectRoot: string,
    accessPaths: readonly string[],
    options?: FilesystemCapabilityOptions
  ) => FilesystemCapabilityResult;
}

interface ValidPhaseAccess { phase: number; reads: string[]; writes: string[] }

/** Step 5's comparison primitive: same path, or one is an ancestor directory of the other. */
function overlapsPath(a: string, b: string): boolean {
  return a === b || a.startsWith(`${b}/`) || b.startsWith(`${a}/`);
}

function collectPhaseAccess(decl: PhaseAccessDeclaration, realRoot: string, rejected: DisjointnessRejection[]): ValidPhaseAccess | null {
  const seenPaths = new Map<string, AccessAction>();
  const reads: string[] = [];
  const writes: string[] = [];
  let ok = true;

  const record = (action: AccessAction, rawPaths: readonly string[]): void => {
    for (const rawPath of rawPaths) {
      const result = validateOneAccessPath(realRoot, action, rawPath, seenPaths);
      if (!result.ok) {
        rejected.push({ phase: decl.phase, ...result.diagnostic });
        ok = false;
        continue;
      }
      if (action === 'Read') reads.push(result.canonicalPath);
      else writes.push(result.canonicalPath);
    }
  };
  record('Read', decl.read);
  record('Modify', decl.modify);
  record('Create', decl.create);
  record('Delete', decl.delete);
  if (!ok) return null;

  // Step 6: deny class + git-ignore, per declared write.
  for (const path of writes) {
    const diagnostics = checkWriteAuthorization(path, realRoot);
    if (diagnostics.length > 0) {
      for (const d of diagnostics) rejected.push({ phase: decl.phase, ...d });
      ok = false;
    }
  }
  return ok ? { phase: decl.phase, reads, writes } : null;
}

/**
 * Deterministic write-disjointness check over an agent-built JSON access-set
 * array. `mode: 'schedule'` (default) invokes the case-probe and mount-capability
 * host adapters; `mode: 'validate-only'` never does (see module header).
 */
export function checkPhaseWriteDisjointness(
  declarations: readonly PhaseAccessDeclaration[],
  projectRoot: string,
  mode: DisjointnessMode,
  deps: DisjointnessHostDeps = {}
): DisjointnessResult {
  const realRoot = realpathSync.native(projectRoot);
  const rejected: DisjointnessRejection[] = [];
  let validPhases: ValidPhaseAccess[] = [];
  for (const decl of declarations) {
    const access = collectPhaseAccess(decl, realRoot, rejected);
    if (access) validPhases.push(access);
  }

  // Steps 3-4: host adapters, scheduling mode only. A probe failure other than
  // 'case-insensitive-root' (mkdir/cleanup error, unreadable root) means case
  // sensitivity is genuinely unknown, not merely insensitive — reject the batch,
  // matching the old wave-operation's CASE_SENSITIVITY_PROBE_FAILED strictness,
  // same as an unsupported mount capability below.
  let caseFold = false;
  if (mode === 'schedule' && validPhases.length > 0) {
    const probeCaseSensitivity = deps.probeCaseSensitivity ?? probeProjectCaseSensitivity;
    const caseProbe = probeCaseSensitivity(realRoot);
    if (!caseProbe.ok && caseProbe.reason !== 'case-insensitive-root') {
      for (const p of validPhases) {
        rejected.push({ phase: p.phase, code: 'CASE_SENSITIVITY_PROBE_FAILED', message: caseProbe.reason ?? 'case sensitivity probe failed' });
      }
      validPhases = [];
    } else {
      caseFold = !caseProbe.ok;
    }
  }
  if (mode === 'schedule' && validPhases.length > 0) {
    const resolveCapability = deps.resolveCapability ?? resolveProjectFilesystemCapability;
    const accessPaths = validPhases.flatMap((p) => [...p.reads, ...p.writes].map((rel) => findNearestExistingAncestor(realRoot, rel)));
    const capability = resolveCapability(realRoot, accessPaths, {});
    if (!capability.ok) {
      for (const p of validPhases) {
        rejected.push({ phase: p.phase, code: 'FILESYSTEM_CAPABILITY_UNSUPPORTED', message: capability.reason ?? 'filesystem capability check failed' });
      }
      validPhases = [];
    }
  }

  // Step 7 (using step 5's primitive): pairwise write/write + write/declared-read, both modes.
  const fold = (p: string): string => (caseFold ? p.toLowerCase() : p);
  const conflicts: DisjointnessConflict[] = [];
  const conflictingPhases = new Set<number>();
  for (let i = 0; i < validPhases.length; i++) {
    for (let j = i + 1; j < validPhases.length; j++) {
      const a = validPhases[i]!;
      const b = validPhases[j]!;
      const paths = new Set<string>();
      for (const w of a.writes) {
        for (const other of [...b.writes, ...b.reads]) {
          if (overlapsPath(fold(w), fold(other))) { paths.add(w); paths.add(other); }
        }
      }
      for (const r of a.reads) {
        for (const w of b.writes) {
          if (overlapsPath(fold(r), fold(w))) { paths.add(r); paths.add(w); }
        }
      }
      if (paths.size > 0) {
        conflicts.push({ a: a.phase, b: b.phase, paths: [...paths].sort() });
        conflictingPhases.add(a.phase);
        conflictingPhases.add(b.phase);
      }
    }
  }

  const safe = validPhases.map((p) => p.phase).filter((phase) => !conflictingPhases.has(phase)).sort((x, y) => x - y);
  return { safe, conflicts, rejected };
}

// CLI edge

const program = new Command()
  .name('check-phase-write-disjointness')
  .description('Deterministic write-disjointness check over a JSON access-set array read from stdin')
  .requiredOption('--project-root <path>', 'Project root')
  .option('--validate-only', 'Host-independent plan-time gate: never invokes case-probe or mount-capability adapters')
  .action((options: { projectRoot: string; validateOnly?: boolean }) => {
    try {
      const declarations = JSON.parse(readFileSync(0, 'utf8')) as PhaseAccessDeclaration[];
      const result = checkPhaseWriteDisjointness(declarations, options.projectRoot, options.validateOnly ? 'validate-only' : 'schedule');
      writeAgentJson(result);
      // Exit 0 on conflicts alone (a valid, deferrable state the caller reads
      // from `conflicts`); exit 2 only for a policy rejection.
      process.exitCode = result.rejected.length > 0 ? 2 : 0;
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      process.stderr.write(`Error: ${message}\n`);
      process.stdout.write(formatAgentJson({ error: message }));
      process.exitCode = 1;
    }
  });

if (import.meta.main) program.parse();
