// Reader for {FEATURE_DIR}/git-map.md plus live per-sub-workspace branch probing.
// Schema authority: plugins/tdk-utils/skills/tdk-branch-preflight/references/git-map-contract.md
//
// Two invariants this module must never break:
//   1. Every git command is read-only, explicitly anchored with `-C`, and routed through runGit
//      so GIT_DIR/GIT_WORK_TREE cannot override that anchor. Nothing here may resolve against an
//      incidental CWD or an inherited git environment — that is the defect this module exists to fix.
//   2. Paths recorded in git-map.md are workspace-relative and stay that way. Absolute paths are
//      joined at probe time and never written back; the file is committed and travels between machines.

import { existsSync, readFileSync, realpathSync } from 'node:fs';
import { join, isAbsolute } from 'node:path';
import { parse as parseYaml } from 'yaml';
import { runGit } from './git-env';
import type { SubWorkspace } from './types';

const FRONTMATTER_RE = /^---\s*\n([\s\S]*?)\n---\s*(?:\n|$)/;

/** Branch and ref values arrive from a committed file, so they are untrusted input.
 *  Same allowlist that tdk-branch-preflight § Value Validation applies. */
const BRANCH_ALLOWLIST = /^[A-Za-z0-9._/-]+$/;

/**
 * Accept a branch or ref value only when it is one git itself would accept.
 *
 * The allowlist alone is not enough: it permits both `.` and `/`, so `../../etc/passwd` passes it.
 * Git rejects `..` inside a ref name, and so must this — a value that reaches a filesystem path
 * elsewhere must never carry a traversal segment.
 */
export function isValidBranchRef(value: unknown): value is string {
  if (typeof value !== 'string' || !BRANCH_ALLOWLIST.test(value)) return false;
  return !value.split('/').includes('..');
}

/** One parsed row of the git-map.md table. Every path is workspace-relative. */
export interface GitMapRow {
  subWorkspace: string;
  repoPath: string;
  /** Per-repository milestone. `undefined` on a legacy five-column file, which has no such column. */
  milestone: string | null | undefined;
  branch: string | null;
  baseRef: string | null;
  worktreePath: string | null;
}

/** Recognised table shapes. Anything else is `malformed` and yields no rows at all. */
export type GitMapLayout = 'current6' | 'legacy5' | 'malformed';

/** A `base_commit_by_repo` entry that is present but unusable. Never silently dropped. */
export interface InvalidObjectName {
  invalid: true;
  raw: unknown;
  reason: string;
}

/** Lifecycle state of a row, as defined by the git-map contract. */
export type GitMapRowState =
  | 'invalid-base-commit'
  | 'seed'
  | 'cleaning'
  | 'cleaned'
  | 'pending'
  | 'realized'
  | 'realized-unverified';

/** Parsed git-map.md. A missing `featureBranch` means the file is still a plan seed. */
export interface GitMap {
  taskId: string;
  featureBranch: string | null;
  /**
   * Legacy scalar `milestone_branch`. The map form lives per row and in `milestoneByRepo`; this
   * field only carries the single-repository spelling.
   */
  milestoneBranch: string | null;
  /** Map form of `milestone_branch`, when the frontmatter uses one. */
  milestoneByRepo: Record<string, string>;
  layout: GitMapLayout;
  rows: GitMapRow[];
  baseCommitByRepo: Record<string, string | InvalidObjectName>;
  cleaningByRepo: Record<string, unknown>;
  cleanedByRepo: Record<string, string>;
  migrationPending: string | null;
}

export type SubWorkspaceBranchState =
  | 'matched'      // live branch equals the branch git-map.md records
  | 'drifted'      // git-map.md records a branch, the repo is on a different one
  | 'not-created'  // no git-map.md yet, or it is still a plan seed
  | 'unknown';     // could not be determined: probe failed, or the row left the config

/** Milestone agreement for one repository. `invalid` is a blocking error, not a lifecycle state. */
export type MilestoneState = 'matched' | 'drifted' | 'unverified' | 'unknown' | 'invalid';

export interface SubWorkspaceBranchInfo {
  name: string;
  path: string;                 // workspace-relative
  expectedBranch: string | null;
  actualBranch: string | null;
  worktreePath: string | null;  // working-root override, or null when the main checkout is used
  state: SubWorkspaceBranchState;
  baseRef: string | null;
  /** Effective milestone for this repository, resolved by the contract's precedence. */
  milestone: string | null;
  milestoneState: MilestoneState;
  note?: string;
}

/**
 * A full object name, in either object format. Deliberately not `isValidBranchRef`: that accepts
 * `HEAD`, which turns the resume invariant `merge-base --is-ancestor HEAD <branch>` into something
 * that is true whenever the branch is checked out.
 */
export function isValidObjectName(value: unknown): value is string {
  return typeof value === 'string' && (/^[0-9a-f]{40}$/.test(value) || /^[0-9a-f]{64}$/.test(value));
}

/** `-` is the contract's empty-cell marker; treat it as absent. */
function cell(value: string | undefined): string | null {
  const trimmed = (value ?? '').trim();
  if (trimmed === '' || trimmed === '-') return null;
  return trimmed;
}

function validBranch(value: unknown): string | null {
  return isValidBranchRef(value) ? value : null;
}

/**
 * Accept a `Worktree path` cell only when it names a location the worktree contract can produce.
 *
 * This is the one value from git-map.md that becomes a filesystem path, and git-map.md is committed,
 * so anyone who can land a commit can steer it. The branch allowlist permits `.` and `/` and is
 * therefore no barrier here: an unchecked cell walks straight out of the workspace and reports an
 * unrelated repository's branch as this sub-workspace's.
 */
function validWorktreePath(value: string | null): string | null {
  if (value === null) return null;
  if (!value.startsWith('_worktrees/')) return null;
  const segments = value.split('/');
  if (segments.length !== 3) return null;
  if (segments.some(segment => segment === '' || segment === '..' || segment === '.')) return null;
  return value;
}

/** The two header sets the contract recognises, by column name. */
const HEADERS: Record<Exclude<GitMapLayout, 'malformed'>, string[]> = {
  current6: ['Sub-workspace', 'Repo path', 'Milestone', 'Branch', 'Base ref', 'Worktree path'],
  legacy5: ['Sub-workspace', 'Repo path', 'Branch', 'Base ref', 'Worktree path'],
};

function splitRow(trimmed: string): string[] {
  return trimmed.slice(1, trimmed.endsWith('|') ? -1 : undefined).split('|').map(c => c.trim());
}

/**
 * Which header set this row is, if any.
 *
 * Matching is exact and by name. There is deliberately no "close enough, read positionally"
 * fallback: the six-column set inserts `Milestone` *before* `Branch`, so reading it by position
 * yields `branch` = the milestone and `baseRef` = the feature branch. Both values pass the branch
 * allowlist, so the result is a plausible, entirely wrong row that nothing downstream can detect.
 */
function matchHeader(cells: string[]): Exclude<GitMapLayout, 'malformed'> | null {
    for (const [layout, expected] of Object.entries(HEADERS)) {
    if (cells.length === expected.length && expected.every((name, i) => cells[i] === name)) {
      return layout as Exclude<GitMapLayout, 'malformed'>;
    }
  }
  return null;
}

function stringMap(value: unknown): Record<string, string> {
  const out = Object.create(null) as Record<string, string>;
  if (value === null || typeof value !== 'object' || Array.isArray(value)) return out;
  for (const [name, raw] of Object.entries(value as Record<string, unknown>)) {
    if (typeof raw === 'string') out[name] = raw;
  }
  return out;
}

function objectMap(value: unknown): Record<string, unknown> {
  const out = Object.create(null) as Record<string, unknown>;
  if (value === null || typeof value !== 'object' || Array.isArray(value)) return out;
  for (const [name, raw] of Object.entries(value as Record<string, unknown>)) out[name] = raw;
  return out;
}

/**
 * Validate `base_commit_by_repo` at the read boundary.
 *
 * A key that is present but unusable becomes an `InvalidObjectName` rather than disappearing.
 * Coercing it to `undefined` would demote the row to `realized-unverified` and quietly resume
 * against a poisoned value — the exact outcome the grammar exists to prevent.
 */
function readBaseCommits(value: unknown): Record<string, string | InvalidObjectName> {
  const out = Object.create(null) as Record<string, string | InvalidObjectName>;
  for (const [name, raw] of Object.entries(objectMap(value))) {
    out[name] = isValidObjectName(raw)
      ? raw
      : { invalid: true, raw, reason: 'not a full object name (40 or 64 hex characters)' };
  }
  return out;
}

/**
 * Read and parse `{featureDir}/git-map.md`.
 * Returns null when the file is absent or unreadable — /tdk-status is a read-only diagnostic and
 * degrades rather than failing on a file someone else committed. A recognisable file with an
 * unrecognisable table returns `layout: 'malformed'` and no rows, which is different from null.
 */
export function readGitMap(featureDir: string): GitMap | null {
  const file = join(featureDir, 'git-map.md');
  if (!existsSync(file)) return null;

  let content: string;
  try {
    content = readFileSync(file, 'utf-8');
  } catch { return null; }

  const match = FRONTMATTER_RE.exec(content);
  if (!match) return null;

  let parsed: Record<string, unknown>;
  try {
    const value = parseYaml(match[1] ?? '');
    if (!value || typeof value !== 'object') return null;
    parsed = value as Record<string, unknown>;
  } catch { return null; }

  const rawMilestone = parsed['milestone_branch'];
  const frontmatter = {
    taskId: typeof parsed['task_id'] === 'string' ? parsed['task_id'] : '',
    featureBranch: validBranch(parsed['feature_branch']),
    milestoneBranch: validBranch(rawMilestone),
    milestoneByRepo: stringMap(rawMilestone),
    baseCommitByRepo: readBaseCommits(parsed['base_commit_by_repo']),
    cleaningByRepo: objectMap(parsed['cleaning_by_repo']),
    cleanedByRepo: stringMap(parsed['cleaned_by_repo']),
    migrationPending: typeof parsed['migration_pending'] === 'string' ? parsed['migration_pending'] : null,
  };

  const rows: GitMapRow[] = [];
  let layout: GitMapLayout | null = null;
  let inFence = false;

  for (const line of content.slice(match[0].length).split('\n')) {
    const trimmed = line.trim();
    // Documentation pasted into the file can carry a fenced example table; those rows are prose.
    if (trimmed.startsWith('```')) { inFence = !inFence; continue; }
    if (inFence || !trimmed.startsWith('|')) continue;

    const cells = splitRow(trimmed);
    if (/^:?-{3,}:?$/.test(cells[0] ?? '')) continue;

    if (layout === null) {
      // The first table row must be a header. Anything else means the file has no usable schema.
      layout = matchHeader(cells) ?? 'malformed';
      if (layout === 'malformed') break;
      continue;
    }

    const at = (name: string): string | null => {
      const index = HEADERS[layout as Exclude<GitMapLayout, 'malformed'>].indexOf(name);
      return index === -1 ? null : cell(cells[index]);
    };

    const subWorkspace = at('Sub-workspace');
    const repoPath = at('Repo path');
    if (!subWorkspace || !repoPath) continue;

    // A hand-edited row can be short a trailing column. Read what is there rather than dropping the
    // row: a silently vanished row reads downstream as "repository not affected by this task".
    rows.push({
      subWorkspace,
      repoPath,
      milestone: layout === 'current6' ? validBranch(at('Milestone')) : undefined,
      branch: validBranch(at('Branch')),
      baseRef: validBranch(at('Base ref')),
      worktreePath: validWorktreePath(at('Worktree path')),
    });
  }

  return {
    ...frontmatter,
    layout: layout ?? 'malformed',
    rows: layout === 'malformed' ? [] : rows,
  };
}

/**
 * Why `sub`'s recorded base commit is unusable, or null when it is fine or absent.
 *
 * Two independent failures, and the second needs the repository:
 *   - the value is not a full object name (decided at parse time, without a repo);
 *   - the value is well-formed but names no commit here — a ghost SHA from another repository, or
 *     an object that is a blob or a tree.
 *
 * The second is not optional. Without it a nonexistent SHA reaches `merge-base --is-ancestor`,
 * which simply fails, and the failure is indistinguishable from an honest ancestry mismatch — so a
 * poisoned record reports as `drifted` and the user is told to fix the wrong thing.
 *
 * `repositoryRoot` omitted means only the grammar can be judged; callers that have a repository
 * must pass it.
 */
export function baseCommitIssue(
  map: GitMap,
  sub: string,
  repositoryRoot?: string,
): InvalidObjectName | null {
  const value = map.baseCommitByRepo[sub];
  if (value === undefined) return null;
  if (typeof value !== 'string') return value;
  if (repositoryRoot === undefined) return null;
  try {
    // RT-H6 precedes lifecycle and intent checks. Disable lazy fetching here so a read-only status
    // cannot contact a promisor remote while validating the recorded base commit.
    runGit(['-C', repositoryRoot, 'cat-file', '-e', `${value}^{commit}`], {
      env: { GIT_NO_LAZY_FETCH: '1' },
    });
    return null;
  } catch {
    return { invalid: true, raw: value, reason: 'does not name a commit in this repository' };
  }
}

/**
 * Lifecycle state of `sub`'s row, in the order the contract fixes.
 *
 * Pass `repositoryRoot` wherever one is available: without it the base-commit pre-gate can only
 * check syntax, so a well-formed but nonexistent object name slips through as `realized`.
 */
export function rowStateOf(map: GitMap, sub: string, repositoryRoot?: string): GitMapRowState {
  const base = map.baseCommitByRepo[sub];
  if (baseCommitIssue(map, sub, repositoryRoot) !== null) return 'invalid-base-commit';
  if (map.featureBranch === null) return 'seed';
  if (map.cleaningByRepo[sub] !== undefined) return 'cleaning';
  if (map.cleanedByRepo[sub] !== undefined) return 'cleaned';
  const row = map.rows.find(r => r.subWorkspace === sub);
  if (row === undefined || row.branch === null) return 'pending';
  return base === undefined ? 'realized-unverified' : 'realized';
}

/** Outcome of probing one path: a branch, or the reason there is none to report. */
type BranchProbe = { branch: string; note?: undefined } | { branch: null; note: string };

/**
 * Live branch of the repository rooted at `repositoryRoot`, read through `workingRoot`.
 *
 * Two roots, because they are two different things and collapsing them breaks recovery:
 *
 * - `repositoryRoot` is the sub-workspace's own checkout. Branch metadata, ancestry and
 *   `worktree list` are answered here, and they must still be answerable when a recorded worktree
 *   directory has been deleted — which is precisely when recovery is needed.
 * - `workingRoot` is where HEAD is read: the recorded worktree when it exists, otherwise the
 *   repository itself.
 *
 * `repositoryRoot` must be the repository's own root. Git answers happily for any directory
 * *inside* a repository and reports the enclosing repository's branch — so on a monorepo, where a
 * sub-workspace is a plain directory of the root repo, an unguarded probe hands back the root's
 * branch as if it belonged to that sub-workspace.
 *
 * A `workingRoot` that is a *different* repository is the subtler failure: `--show-toplevel`
 * matching itself is true for any independent clone, and a clone of the same upstream has the same
 * branch name and the same history, so it satisfies both a branch comparison and an ancestry check.
 * Identity is therefore established by shared object store (`--git-common-dir`) plus registered
 * membership in `worktree list`, never by agreement about branches.
 */
function probeBranch(repositoryRoot: string, workingRoot: string = repositoryRoot): BranchProbe {
  let repoCommonDir: string;
  try {
    const top = runGit(['-C', repositoryRoot, 'rev-parse', '--show-toplevel']);
    if (realpathSync(top) !== realpathSync(repositoryRoot)) {
      return { branch: null, note: 'not a separate git repository' };
    }
    repoCommonDir = commonDirOf(repositoryRoot);
  } catch { return { branch: null, note: 'not a git working tree' }; }

  if (workingRoot !== repositoryRoot) {
    if (!isRegisteredWorktree(repositoryRoot, workingRoot, repoCommonDir)) {
      return { branch: null, note: 'worktree path is not a worktree of this repository' };
    }
  }

  let branch: string;
  try {
    branch = runGit(['-C', workingRoot, 'branch', '--show-current']);
  } catch { return { branch: null, note: 'not a git working tree' }; }

  // An empty result is a detached HEAD — mid-rebase, mid-bisect, or checked out at a commit.
  return branch.length > 0 ? { branch } : { branch: null, note: 'detached HEAD' };
}

/**
 * Whether `workingRoot` really is a worktree of `repositoryRoot`.
 *
 * Both conditions are required. A shared `--git-common-dir` proves the two share an object store;
 * membership in `worktree list --porcelain` proves git itself considers this path a live worktree
 * rather than a stale directory that merely points at the right place.
 */
function isRegisteredWorktree(repositoryRoot: string, workingRoot: string, repoCommonDir: string): boolean {
  let workingCommonDir: string;
  try {
    workingCommonDir = commonDirOf(workingRoot);
  } catch { return false; }
  if (workingCommonDir !== repoCommonDir) return false;

  let listed: string;
  try {
    listed = runGit(['-C', repositoryRoot, 'worktree', 'list', '--porcelain']);
  } catch { return false; }

  const target = realpathSync(workingRoot);
  return listed.split('\n')
    .filter(line => line.startsWith('worktree '))
    .some(line => {
      try { return realpathSync(line.slice('worktree '.length)) === target; } catch { return false; }
    });
}

/**
 * Absolute, symlink-resolved common git directory of the repository checked out at `root`.
 *
 * `rev-parse --git-common-dir` answers relative to the repository (`.git`), so it has to be
 * resolved against `root` and not against this process's working directory.
 */
function commonDirOf(root: string): string {
  const reported = runGit(['-C', root, 'rev-parse', '--git-common-dir']);
  return realpathSync(isAbsolute(reported) ? reported : join(root, reported));
}

/**
 * Compare the branch each sub-workspace repository is actually on against what git-map.md records.
 *
 * `workspaceRoot` must be `detectConfig().workspaceRoot` — the directory holding `.specify/` — and
 * NOT `getRepoRoot()`. `subWorkspaces[].path` is defined relative to the workspace root, and the two
 * anchors diverge on nested-git or submodule layouts while looking identical on a flat project.
 *
 * When a row carries a `Worktree path`, probe there: that path is the replacement working root, and
 * the repository's main checkout legitimately stays on its old branch.
 *
 * The branch expected of a repository comes from its own row's `Branch` cell, never from the
 * map-wide `feature_branch`. Rows cover only the repositories a task touches, and they are appended
 * one at a time as each repository succeeds — so a repository with no row, or with a row still
 * holding `-`, simply has no branch yet. Comparing either against the map-wide value manufactures
 * drift for repositories that are behaving correctly.
 */
export function probeSubWorkspaces(
  workspaceRoot: string,
  subWorkspaces: SubWorkspace[],
  gitMap: GitMap | null,
  /**
   * Effective milestone per sub-workspace, already resolved by the contract's precedence
   * (spec map, then the row's column, then a scalar for the artifact host).
   *
   * Passed in rather than derived here: this module has no route to `spec.md`, and giving it one
   * would duplicate the precedence rule. Without it, a user editing the spec would keep seeing the
   * old milestone reported as matched, contradicting "the spec wins".
   */
  effectiveMilestones: Record<string, string> = Object.create(null) as Record<string, string>,
): SubWorkspaceBranchInfo[] {
  if (subWorkspaces.length === 0) return [];

  const rowsByName = new Map((gitMap?.rows ?? []).map(row => [row.subWorkspace, row]));
  const results: SubWorkspaceBranchInfo[] = [];

  for (const sub of subWorkspaces) {
    const row = rowsByName.get(sub.name);
    const worktreePath = row?.worktreePath ?? null;
    const expectedBranch = row?.branch ?? null;

    // Branch metadata always comes from the repository itself. A recorded worktree that no longer
    // exists is a normal, recoverable state — not a reason to lose the ability to read the branch.
    const repositoryRoot = join(workspaceRoot, sub.path);
    const recordedWorktree = worktreePath === null ? null : join(workspaceRoot, worktreePath);
    const worktreeMissing = recordedWorktree !== null && !existsSync(recordedWorktree);
    const workingRoot = worktreeMissing || recordedWorktree === null ? repositoryRoot : recordedWorktree;

    const probe = probeBranch(repositoryRoot, workingRoot);

    let state: SubWorkspaceBranchState;
    if (probe.branch === null) state = 'unknown';
    else if (expectedBranch === null) state = 'not-created';
    else state = probe.branch === expectedBranch ? 'matched' : 'drifted';

    const milestone = effectiveMilestones[sub.name] ?? row?.milestone ?? null;
    const note = worktreeMissing ? 'recorded worktree is missing' : probe.note;
    results.push({
      name: sub.name,
      path: sub.path,
      expectedBranch,
      actualBranch: probe.branch,
      worktreePath,
      state,
      baseRef: row?.baseRef ?? null,
      milestone,
      milestoneState: milestoneStateOf(gitMap, sub.name, milestone, repositoryRoot),
      ...(note ? { note } : {}),
    });
  }

  // Rows that outlived their config entry: report them so the drift is visible, but never probe —
  // there is no configured path left to trust.
  const configured = new Set(subWorkspaces.map(sub => sub.name));
  for (const row of gitMap?.rows ?? []) {
    if (configured.has(row.subWorkspace)) continue;
    results.push({
      name: row.subWorkspace,
      path: row.repoPath,
      expectedBranch: row.branch,
      actualBranch: null,
      worktreePath: row.worktreePath,
      state: 'unknown',
      baseRef: row.baseRef,
      milestone: row.milestone ?? null,
      milestoneState: 'unknown',
      note: 'not in config',
    });
  }

  return results;
}

/**
 * Milestone agreement for one repository, evaluated top-down.
 *
 * The order is the contract's, and it is the same order the branch guard uses, so `status` and the
 * guard can never disagree. In particular drift is decided *before* ancestry: the spec outranks the
 * recorded row, so a milestone the user has since changed is drift even if the old base is still a
 * perfectly good ancestor.
 */
export function milestoneStateOf(
  gitMap: GitMap | null,
  sub: string,
  effectiveMilestone: string | null,
  repositoryRoot: string,
): MilestoneState {
  if (gitMap === null) return 'unknown';

  // Pre-gate, ahead of every lifecycle and intent question, and repository-aware: a well-formed
  // object name that is a ghost, a blob or a tree only fails later at `merge-base`, where the
  // failure is indistinguishable from real drift.
  const state = rowStateOf(gitMap, sub, repositoryRoot);
  if (state === 'invalid-base-commit') return 'invalid';
  if (state === 'seed' || state === 'pending' || state === 'cleaning' || state === 'cleaned') return 'unknown';

  const row = gitMap.rows.find(r => r.subWorkspace === sub);
  const recorded = row?.milestone ?? null;
  if (effectiveMilestone !== null && recorded !== null && effectiveMilestone !== recorded) return 'drifted';

  if (state === 'realized-unverified') return 'unverified';

  const baseCommit = gitMap.baseCommitByRepo[sub];
  const branch = row?.branch;
  if (typeof baseCommit !== 'string' || branch === null || branch === undefined) return 'unknown';
  return isAncestor(repositoryRoot, baseCommit, branch) ? 'matched' : 'drifted';
}

/** Whether `branch` contains `commit`. A repository we cannot read answers false, never throws. */
function isAncestor(repositoryRoot: string, commit: string, branch: string): boolean {
  try {
    runGit(['-C', repositoryRoot, 'merge-base', '--is-ancestor', commit, branch]);
    return true;
  } catch { return false; }
}
