// Preconditions for archiving a feature, shared by `archive.ts --check` and the apply path.
// Every problem becomes one blocker string (problem + fix line), so the caller can show a single
// list. Nothing here writes to disk; the only git calls are the read-only `rev-parse` and
// `status --porcelain` (run with --no-optional-locks so git never refreshes the index).

import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { join, relative, resolve } from 'node:path';
import { parseFeatureId } from '../../utils/feature';
import { runGit } from '../../utils/git-env';
import { readGitMap, rowStateOf } from '../../utils/git-map';
import { findPendingArtifactMigration } from '../util/artifact-migration-transaction';
import { extractFrontmatter } from '../util/parse-plan-frontmatter';
import { parsePhasesTable } from '../util/phases-table-parser';
import { derivePlanRootStatus, normalizeLifecycleStatus, readFrontmatterStatus } from '../util/plan-root-status';
import { ARCHIVE_DIR, collectIncomingReferences, type IncomingReferences } from './archive-incoming-references';

export type ArchivedFrom = 'done' | 'cancelled';
/** Runs git with the given args and returns untrimmed stdout; throws when git fails. */
export type GitRunner = (args: string[]) => string;

export interface ArchiveInput {
  featureId: string;
  repoRoot: string;
  specsRoot: string;
  defaultFolder: string;
  /** Root that workspace-relative git-map paths resolve against; defaults to `repoRoot`. */
  workspaceRoot?: string;
  /** Injectable git runner (tests); defaults to the sanitized `runGit`. */
  git?: GitRunner;
}

/** Everything the apply path needs once there are no blockers. */
export interface ArchiveFacts {
  featureDir: string;
  target: string;
  planPath: string;
  specPath: string;
  planBytes: Buffer;
  specBytes: Buffer;
  derived: ArchivedFrom;
}

export interface ArchivePreconditions {
  blockers: string[];
  warnings: string[];
  /** Repo-relative POSIX paths; null when the feature id did not resolve to an active dir. */
  from: string | null;
  to: string | null;
  archivedFrom: ArchivedFrom | null;
  references: IncomingReferences;
  /** Non-null only when `blockers` is empty. */
  facts: ArchiveFacts | null;
}

const BLOCKING_ROW_STATES = new Set(['realized', 'realized-unverified', 'cleaning']);

const toPosix = (path: string): string => path.split('\\').join('/');
const errorMessage = (err: unknown): string => (err instanceof Error ? err.message : String(err));

function findLockFiles(dir: string, base = dir): string[] {
  const found: string[] = [];
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const full = join(dir, entry.name);
    if (entry.isDirectory()) found.push(...findLockFiles(full, base));
    else if (entry.isFile() && entry.name.endsWith('.lock')) found.push(toPosix(relative(base, full)));
  }
  return found;
}

/** Full stderr of a failed git call, falling back to the error message. */
function gitErrorText(err: unknown): string {
  const stderr = (err as { stderr?: unknown }).stderr;
  return (typeof stderr === 'string' && stderr.trim() !== '' ? stderr : errorMessage(err)).trim();
}

const firstLine = (text: string): string => text.split('\n').find((line) => line.trim() !== '')?.trim() ?? 'unknown git error';

type DirtyCheck =
  | { kind: 'paths'; paths: string[] }
  | { kind: 'not-a-repo' }
  | { kind: 'git-error'; message: string };

// `sessions.jsonl` is appended by the session hook as soon as a prompt mentions the ticket, so it is
// dirty by the time the archive runs. It moves byte-unchanged with the dir; `close-out.md` is the
// skill's own output.
const IGNORED_DIRTY_PATHSPECS = [':(exclude)close-out.md', ':(exclude)sessions.jsonl'];

/**
 * Dirty paths under the feature dir. Only "not a git repository" counts as no-repo; any other git
 * failure (dubious ownership, corrupt index, git missing) is reported so the caller fails closed.
 */
function dirtyPaths(featureDir: string, git: GitRunner): DirtyCheck {
  let probe: string;
  try {
    probe = git(['-C', featureDir, 'rev-parse', '--is-inside-work-tree']);
  } catch (err) {
    const text = gitErrorText(err);
    return /not a git repository/i.test(text) ? { kind: 'not-a-repo' } : { kind: 'git-error', message: firstLine(text) };
  }
  if (probe.trim() === 'false') return { kind: 'not-a-repo' };
  let out: string;
  try {
    out = git(['--no-optional-locks', '-C', featureDir, 'status', '--porcelain', '--', '.', ...IGNORED_DIRTY_PATHSPECS]);
  } catch (err) {
    return { kind: 'git-error', message: firstLine(gitErrorText(err)) };
  }
  return { kind: 'paths', paths: out.split('\n').filter((line) => line.trim() !== '').map((line) => line.slice(3)) };
}

/** Blockers that depend on the feature dir contents, not on spec/plan lifecycle state. */
function collectDirBlockers(input: ArchiveInput, featureDir: string, from: string, out: ArchivePreconditions): void {
  const { featureId, repoRoot } = input;
  const workspaceRoot = input.workspaceRoot ?? repoRoot;
  const map = readGitMap(featureDir);
  for (const row of map?.rows ?? []) {
    const state = rowStateOf(map!, row.subWorkspace);
    if (!BLOCKING_ROW_STATES.has(state) || row.worktreePath === null) continue;
    if (!existsSync(join(workspaceRoot, row.worktreePath))) continue;
    out.blockers.push(`live worktree for '${row.subWorkspace}' at ${row.worktreePath} (git-map state: ${state}); `
      + `run \`/tdk-repo-worktree cleanup ${featureId}\` first`);
  }

  const dirty = dirtyPaths(featureDir, input.git ?? ((args) => runGit(args, { raw: true })));
  if (dirty.kind === 'not-a-repo') out.warnings.push('dirty-path check skipped: not a git working tree');
  else if (dirty.kind === 'git-error') {
    out.blockers.push(`cannot check uncommitted changes under ${from}: git failed (${dirty.message}); `
      + 'fix the git error (for example add the directory to safe.directory), then rerun');
  } else if (dirty.paths.length > 0) {
    out.blockers.push(`uncommitted changes under ${from} (close-out.md and sessions.jsonl ignored): `
      + `${dirty.paths.slice(0, 5).join(', ')}${dirty.paths.length > 5 ? ', ...' : ''}; commit or discard them, then rerun`);
  }

  let locks: string[] = [];
  try {
    locks = findLockFiles(featureDir);
  } catch (err) {
    out.blockers.push(`cannot scan ${from} for lock files (${errorMessage(err)}); fix the directory permissions, then rerun`);
  }
  if (locks.length > 0) {
    out.blockers.push(`lock file(s) in ${from}: ${locks.join(', ')}; make sure no TDK run is active, then remove the lock`);
  }

  const migrateFix = `rerun \`/tdk-plan ${featureId} --migrate-artifacts\` to resume or roll back`;
  try {
    const pending = findPendingArtifactMigration(featureDir);
    if (pending) out.blockers.push(`unfinished artifact migration (${toPosix(relative(repoRoot, pending))}); ${migrateFix}`);
  } catch (err) {
    out.blockers.push(`artifact migration manifest unreadable (${errorMessage(err)}); ${migrateFix}`);
  }

  const redTeamDir = join(featureDir, '.tdk-tmp', 'red-team');
  const sessions = !existsSync(redTeamDir) ? []
    : readdirSync(redTeamDir, { withFileTypes: true }).filter((e) => e.isDirectory()).map((e) => e.name);
  if (sessions.length > 0) {
    out.blockers.push(`unfinished red-team session(s) in .tdk-tmp/red-team: ${sessions.join(', ')}; `
      + `rerun \`/tdk-plan ${featureId} --red-team\` to recover or discard`);
  }
}

/** Plan/spec lifecycle checks; returns the facts needed to apply, or null when any check failed. */
function collectLifecycleBlockers(
  input: ArchiveInput, ticket: string, featureDir: string, target: string, out: ArchivePreconditions,
): ArchiveFacts | null {
  const planPath = join(featureDir, 'plan.md');
  const specPath = join(featureDir, 'spec.md');
  const before = out.blockers.length;
  for (const [name, path] of [['plan.md', planPath], ['spec.md', specPath]] as const) {
    if (!existsSync(path)) out.blockers.push(`${name} not found: ${path}`);
  }
  if (existsSync(target)) out.blockers.push(`archive target already exists: ${target}`);
  if (!existsSync(planPath) || !existsSync(specPath)) return null;

  const [planBytes, specBytes] = [readFileSync(planPath), readFileSync(specPath)];
  const planMd = planBytes.toString('utf-8');
  const planStatus = readFrontmatterStatus(planMd);
  const specStatus = readFrontmatterStatus(specBytes.toString('utf-8'));
  for (const [name, status] of [['plan.md', planStatus], ['spec.md', specStatus]] as const) {
    if (status !== null) continue;
    out.blockers.push(`${name} has no frontmatter 'status:' key; add \`status:\` to ${name}, `
      + `then run \`update-phase-status.ts --reconcile-root ${planPath}\``);
  }
  out.references = collectIncomingReferences({
    repoRoot: input.repoRoot, specsRoot: input.specsRoot, defaultFolder: input.defaultFolder, featureDir,
    taskId: extractFrontmatter(planPath, ticket)?.canonical.task_id ?? null,
  });
  if (planStatus === null || specStatus === null) return null;

  const stored = normalizeLifecycleStatus(planStatus, 'plan').status;
  if (stored === 'archived') {
    out.blockers.push(`feature '${input.featureId}' is already archived`);
    return null;
  }
  const parsed = parsePhasesTable(planMd);
  if (parsed.errors.length > 0) {
    out.blockers.push(`plan.md ## Phases not parseable: ${parsed.errors.map((e) => e.message).join('; ')}`);
    return null;
  }
  const derived = derivePlanRootStatus(parsed.phases, stored);
  if (derived !== 'done' && derived !== 'cancelled') {
    out.blockers.push(`only done or cancelled features can be archived (derived status: ${derived})`);
    return null;
  }
  out.archivedFrom = derived;
  if (out.blockers.length > before) return null;
  return { featureDir, target, planPath, specPath, planBytes, specBytes, derived };
}

export function collectArchivePreconditions(input: ArchiveInput): ArchivePreconditions {
  const { featureId, repoRoot, specsRoot, defaultFolder } = input;
  const out: ArchivePreconditions = {
    blockers: [], warnings: [], from: null, to: null, archivedFrom: null,
    references: { plans: [], children: [] }, facts: null,
  };
  let resolved: ReturnType<typeof parseFeatureId>;
  try { resolved = parseFeatureId(featureId, repoRoot, specsRoot, defaultFolder); } catch (err) {
    out.blockers.push(errorMessage(err));
    return out;
  }
  const { folder, ticket, featureDir } = resolved;
  if (folder === ARCHIVE_DIR) {
    out.blockers.push(`feature '${featureId}' is already under ${ARCHIVE_DIR}/`);
    return out;
  }
  if (!existsSync(featureDir)) {
    out.blockers.push(`feature dir not found: ${featureDir}; if the spec is already archived, `
      + `run \`/tdk-archive --ingest ${featureId}\``);
    return out;
  }
  const target = resolve(repoRoot, specsRoot, ARCHIVE_DIR, folder, ticket);
  out.from = toPosix(relative(repoRoot, featureDir));
  out.to = toPosix(relative(repoRoot, target));

  const facts = collectLifecycleBlockers(input, ticket, featureDir, target, out);
  collectDirBlockers(input, featureDir, out.from, out);
  if (out.blockers.length === 0) out.facts = facts;
  return out;
}
