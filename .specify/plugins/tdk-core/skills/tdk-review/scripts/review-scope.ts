// `review-scope`: the deterministic diff scope for /tdk-review. The skill prose consumes this JSON and never
// restates the git-map, identity or fallback rules. Every git call is read-only and goes through runGit.
// Bundled (build.ts) so the installed skill carries its own copy; the shared sources below are included at build time.

import { existsSync, lstatSync, readFileSync, realpathSync, type Stats } from 'node:fs';
import { dirname, isAbsolute, join, posix, relative, resolve } from 'node:path';
import { parseArgs } from 'node:util';
import { writeAgentJson } from '../../../../../scripts/ts/src/utils/agent-output';
import { parseConfig } from '../../../../../scripts/ts/src/utils/config';
import { isWithin } from '../../../../../scripts/ts/src/utils/path-within';
import { runGit } from '../../../../../scripts/ts/src/utils/git-env';
import { baseCommitIssue, commonDirOf, isRegisteredWorktree, readGitMap, rowStateOf, type GitMap } from '../../../../../scripts/ts/src/utils/git-map';
import { extractPhaseRoutingInput } from '../../../../../scripts/ts/src/utils/phase-delegates';
import { parsePhasesTable } from '../../../../../scripts/ts/src/commands/util/phases-table-parser';

/** Per-file ceiling. Larger or binary files enter the diff as `--stat` only and are listed in `truncated`. */
const PER_FILE_LINE_CAP = 2000;
const MAX_TEXT_BYTES = 1024 * 1024;
const MAX_BUFFER = 512 * 1024 * 1024;

export interface TruncatedFile { path: string; reason: 'binary' | 'oversize' | 'directory' | 'unreadable' }
export interface ReviewRepo {
  subWorkspace: string | null;
  repoPath: string;
  workingRoot: string;
  baseCommit: string;
  includesUncommitted: true;
  source: 'git-map' | 'fallback';
  files: string[];
  diff: string;
  diffLines: number;
  truncated: TruncatedFile[];
}
/** `subWorkspace` is the row name, or the Related Code Files path when that path could not be placed in any repository. */
export interface NotReviewed { subWorkspace: string; state: string; reason: string }
export interface ReviewScope {
  ok: true;
  repos: ReviewRepo[];
  notReviewed: NotReviewed[];
  phases: { reviewed: number[]; skipped: { number: number; status: string }[] };
  /** `git status` snapshot per repo key, taken with `porcelainArgs`. Includes the repo holding the feature dir. */
  porcelain: Record<string, string[]>;
  porcelainArgs: string[];
  warnings: string[];
  /** True only when nothing was skipped AND no repo has a changed file. Skipped rows are never "empty". */
  empty: boolean;
}

export class ReviewScopeError extends Error {
  constructor(readonly code: string, message: string, readonly details: Record<string, unknown> = {}) { super(message); }
}

export interface ReviewScopeOptions { projectRoot: string; featureDir: string; phase?: number }
const PORCELAIN_ARGS = ['status', '--porcelain=v1', '-z', '--untracked-files=all'];

/** `GIT_OPTIONAL_LOCKS=0` stops git from rewriting `.git/index` during a read; `quotePath=false` keeps non-ASCII paths literal. */
const git = (cwd: string, args: string[]): string =>
  runGit(['-C', cwd, '-c', 'core.quotePath=false', ...args], { raw: true, maxBuffer: MAX_BUFFER, env: { GIT_OPTIONAL_LOCKS: '0' } });

/** Repo-relative pathspecs. `.` stays bare; everything else is literal so plan-authored text cannot glob. */
const literal = (path: string): string => (path === '.' ? '.' : `:(literal)${path}`);

/** One repo's tracked diff against `base` plus untracked file content rendered as new-file diffs. */
function diffRepo(workingRoot: string, base: string, specs: string[] | undefined): Pick<ReviewRepo, 'files' | 'diff' | 'diffLines' | 'truncated'> {
  const pathspec = specs ? specs.map(literal) : ['.'];
  const common = ['--no-ext-diff', '--no-textconv', '--no-color', '--no-renames', '--src-prefix=a/', '--dst-prefix=b/'];
  const truncated: TruncatedFile[] = [];
  const files: string[] = [];

  // `-z --numstat` is `<added>\t<deleted>\t<path>\0`; binary files report `-`.
  const stats = git(workingRoot, ['diff', ...common, '-z', '--numstat', base, '--', ...pathspec]).split('\0').filter(Boolean);
  const stat: string[] = [];
  for (const entry of stats) {
    const [added, deleted, ...rest] = entry.split('\t');
    const path = rest.join('\t');
    files.push(path);
    if (added === '-') truncated.push({ path, reason: 'binary' });
    else if (Number(added) + Number(deleted) > PER_FILE_LINE_CAP) truncated.push({ path, reason: 'oversize' });
    else continue;
    stat.push(path);
  }
  const exclusions = stat.map((path) => `:(exclude,literal)${path}`);
  let diff = git(workingRoot, ['diff', ...common, base, '--', ...pathspec, ...exclusions]);
  if (stat.length > 0) diff += git(workingRoot, ['diff', '--no-ext-diff', '--no-color', '--stat', base, '--', ...stat.map(literal)]);

  // Implement output is mostly new, untracked files; without their content the review would pass unread code.
  const untracked = git(workingRoot, ['ls-files', '--others', '--exclude-standard', '-z', '--', ...pathspec]).split('\0').filter(Boolean).sort();
  for (const path of untracked) {
    files.push(path);
    const absolute = join(workingRoot, path);
    let reason: TruncatedFile['reason'] | null = null;
    try {
      const info: Stats = lstatSync(absolute);
      if (info.isDirectory()) { truncated.push({ path, reason: 'directory' }); continue; }
      if (!info.isSymbolicLink()) {
        if (info.size > MAX_TEXT_BYTES) reason = 'oversize';
        else {
          const bytes = readFileSync(absolute);
          const text = bytes.toString('utf-8');
          if (bytes.subarray(0, 8000).includes(0)) reason = 'binary';
          else if (text.split('\n').length - (text.endsWith('\n') ? 1 : 0) > PER_FILE_LINE_CAP) reason = 'oversize';
        }
      }
    } catch { truncated.push({ path, reason: 'unreadable' }); continue; }
    if (reason) truncated.push({ path, reason });
    let out: string;
    try {
      out = git(workingRoot, ['diff', '--no-index', ...common, ...(reason ? ['--stat'] : []), '--', '/dev/null', path]);
    } catch (error) {
      // `--no-index` exits 1 when the files differ, but also when git failed. Only non-empty stdout proves content was read.
      out = error instanceof Error && 'status' in error && error.status === 1 && 'stdout' in error && typeof error.stdout === 'string' ? error.stdout : '';
    }
    if (out !== '') diff += out;
    else if (!reason) truncated.push({ path, reason: 'unreadable' });
  }
  return { files, diff, diffLines: diff === '' ? 0 : diff.split('\n').length - (diff.endsWith('\n') ? 1 : 0), truncated };
}

/** Plan-authored path -> normalized workspace-relative path, or null when its text could leave the project. */
function normalizeRelated(raw: string): string | null {
  const path = posix.normalize(raw.replace(/\\/g, '/').replace(/^\.\//, '')).replace(/\/$/, '');
  return path === '' || path === '..' || path.startsWith('../') || isAbsolute(path) || /^[A-Za-z]:/.test(path) ? null : path;
}

function stateReason(map: GitMap, sub: string, repositoryRoot: string, state: string): string {
  if (state === 'invalid-base-commit') return baseCommitIssue(map, sub, repositoryRoot)?.reason ?? 'invalid base commit';
  if (state === 'realized-unverified') return 'row has no recorded base commit, so there is nothing to diff against';
  if (state === 'pending') return 'repository has no branch yet';
  if (state === 'cleaned' || state === 'cleaning') return `row is ${state}`;
  return `row state is ${state}`;
}

export function computeReviewScope(options: ReviewScopeOptions): ReviewScope {
  const projectRoot = resolve(options.projectRoot);
  const featureDir = resolve(options.featureDir);
  const warnings: string[] = [];
  const notReviewed: NotReviewed[] = [];

  let planMarkdown: string;
  try { planMarkdown = readFileSync(join(featureDir, 'plan.md'), 'utf-8'); }
  catch { throw new ReviewScopeError('invalid_plan', `Cannot read ${join(featureDir, 'plan.md')}`); }
  const parsed = parsePhasesTable(planMarkdown);
  if (parsed.errors.length > 0) throw new ReviewScopeError('invalid_plan', parsed.errors.map((e) => `Line ${e.line}: ${e.message}`).join('; '));

  const { config, error: configError } = parseConfig(join(projectRoot, '.specify', '.specify.json'));
  if (!config) throw new ReviewScopeError('invalid_config', configError ?? 'Cannot read .specify.json');
  const subs = config.subWorkspaces ?? [];

  // Preconditions: never review a tree that /tdk-implement is still changing.
  const inProgress = parsed.phases.filter((row) => row.status === 'in_progress').map((row) => row.number);
  const target = options.phase === undefined ? undefined : parsed.phases.find((row) => row.number === options.phase);
  if (options.phase !== undefined && !target) throw new ReviewScopeError('phase_not_found', `Plan has no phase ${options.phase}`, { phase: options.phase });
  const blocking = target ? (target.status === 'in_progress' ? [target.number] : []) : inProgress;
  if (blocking.length > 0) throw new ReviewScopeError('phase_in_progress', `Phase ${blocking.join(', ')} is in_progress; finish /tdk-implement first`, { phases: blocking });
  if (target && target.status !== 'done') throw new ReviewScopeError('phase_not_done', `Phase ${target.number} is ${target.status}; --phase requires a done phase`, { phase: target.number, status: target.status });
  const reviewedRows = parsed.phases.filter((row) => (target ? row.number === target.number : row.status === 'done'));
  const phases = {
    reviewed: reviewedRows.map((row) => row.number),
    skipped: parsed.phases.filter((row) => !reviewedRows.includes(row)).map((row) => ({ number: row.number, status: row.status })),
  };

  const canonicalFeature = realpathSync(featureDir);
  const related = new Set<string>();
  for (const row of reviewedRows) {
    const file = resolve(featureDir, row.file);
    let markdown: string;
    try {
      if (!isWithin(canonicalFeature, realpathSync(file))) throw new Error('outside feature dir');
      markdown = readFileSync(file, 'utf-8');
    } catch { warnings.push(`phase ${row.number}: cannot read ${row.file}`); continue; }
    for (const raw of extractPhaseRoutingInput(markdown).paths) {
      const path = normalizeRelated(raw);
      if (path === null) notReviewed.push({ subWorkspace: raw, state: 'unsafe_path', reason: `phase ${row.number}: Related Code Files entry leaves the project` });
      else related.add(path);
    }
  }

  const map = readGitMap(featureDir);
  // A seed-only or malformed map records no realized repository, so it contributes no rows: the fallback covers the paths.
  const usable = map !== null && map.layout !== 'malformed' && map.featureBranch !== null ? map : null;
  const repos: ReviewRepo[] = [];
  const claimed = new Set<string>();
  const handled = new Set<string>();
  const projectReal = realpathSync(projectRoot);

  if (usable) for (const row of usable.rows) {
    const sub = subs.find((candidate) => candidate.name === row.subWorkspace);
    if (!sub) { notReviewed.push({ subWorkspace: row.subWorkspace, state: 'not_in_config', reason: 'row has no matching subWorkspaces entry' }); continue; }
    const prefix = posix.normalize(sub.path.replace(/\\/g, '/')).replace(/\/$/, '');
    if (prefix === '.') continue; // artifact host or root: the fallback below owns it
    const owned = [...related].filter((path) => path === prefix || path.startsWith(`${prefix}/`));
    // `--phase` narrows to that phase's files; a repository the phase never touches is not part of this review.
    if (target && owned.length === 0) continue;
    const repositoryRoot = join(projectRoot, sub.path);
    if (!existsSync(repositoryRoot)) { owned.forEach((path) => claimed.add(path)); notReviewed.push({ subWorkspace: sub.name, state: 'missing_repository', reason: `${sub.path} does not exist` }); continue; }
    const repoReal = realpathSync(repositoryRoot);
    if (!isWithin(projectReal, repoReal) || repoReal === projectReal) {
      owned.forEach((path) => claimed.add(path));
      notReviewed.push({ subWorkspace: sub.name, state: 'identity_failed', reason: 'repository root escapes or equals the workspace' });
      continue;
    }

    // Repository identity gate (git-map-contract.md): the directory must be its own toplevel.
    let top: string | null = null;
    try { top = realpathSync(runGit(['-C', repositoryRoot, 'rev-parse', '--show-toplevel'])); } catch { /* not a working tree: reported below */ }
    if (top !== null && top !== repoReal) continue; // plain monorepo directory: the fallback diffs its paths against HEAD
    owned.forEach((path) => claimed.add(path));
    handled.add(repoReal);

    const state = rowStateOf(usable, sub.name, repositoryRoot);
    if (state !== 'realized') { notReviewed.push({ subWorkspace: sub.name, state, reason: stateReason(usable, sub.name, repositoryRoot, state) }); continue; }
    if (top === null) { notReviewed.push({ subWorkspace: sub.name, state: 'identity_failed', reason: 'not a git working tree' }); continue; }
    const baseCommit = usable.baseCommitByRepo[sub.name];
    if (typeof baseCommit !== 'string') { notReviewed.push({ subWorkspace: sub.name, state: 'invalid-base-commit', reason: 'no usable base commit' }); continue; }

    const recorded = row.worktreePath === null ? null : join(projectRoot, row.worktreePath);
    const workingRoot = recorded !== null && existsSync(recorded) ? recorded : repositoryRoot;
    if (workingRoot !== repositoryRoot) {
      let registered = false;
      try { registered = isRegisteredWorktree(repositoryRoot, workingRoot, commonDirOf(repositoryRoot)); } catch { /* treated as unregistered */ }
      if (!registered) { notReviewed.push({ subWorkspace: sub.name, state: 'identity_failed', reason: 'worktree path is not a worktree of this repository' }); continue; }
    }

    const specs = target ? owned.map((path) => (path === prefix ? '.' : path.slice(prefix.length + 1))) : undefined;
    repos.push({
      subWorkspace: sub.name, repoPath: row.repoPath, workingRoot, baseCommit,
      includesUncommitted: true, source: 'git-map', ...diffRepo(workingRoot, baseCommit, specs),
    });
  }

  // Everything no row claimed: monolith, root, artifact-host and plain-monorepo paths, diffed against HEAD.
  const groups = new Map<string, string[]>();
  for (const path of related) {
    if (claimed.has(path)) continue;
    const absolute = join(projectRoot, path);
    // A directory entry is its own repository candidate; a file entry belongs to the repository of its parent.
    let start = dirname(absolute);
    try { if (lstatSync(absolute).isDirectory()) start = absolute; } catch { /* a deleted file: its parent still names the repository */ }
    while (!existsSync(start) && start !== dirname(start)) start = dirname(start);
    const realStart = realpathSync(start);
    if (!isWithin(projectReal, realStart)) {
      notReviewed.push({ subWorkspace: path, state: 'outside_project', reason: 'path resolves outside the project through a symlink' });
      continue;
    }
    let top: string;
    try { top = realpathSync(runGit(['-C', realStart, 'rev-parse', '--show-toplevel'])); }
    catch { notReviewed.push({ subWorkspace: path, state: 'no_repository', reason: 'path is not inside a git repository' }); continue; }
    if (handled.has(top)) continue; // already diffed through its git-map row, reached here by another spelling
    const spec = relative(top, join(realStart, relative(start, absolute))).replace(/\\/g, '/') || '.';
    groups.set(top, [...(groups.get(top) ?? []), spec]);
  }
  for (const [top, specs] of groups) {
    let base: string;
    try { base = runGit(['-C', top, 'rev-parse', '--verify', 'HEAD^{commit}']); }
    catch { notReviewed.push({ subWorkspace: relative(projectReal, top) || '.', state: 'no_head', reason: 'repository has no commit to diff against' }); continue; }
    repos.push({ subWorkspace: null, repoPath: relative(projectReal, top).replace(/\\/g, '/') || '.', workingRoot: top, baseCommit: base, includesUncommitted: true, source: 'fallback', ...diffRepo(top, base, specs) });
  }

  // The orchestrator replays exactly `git -C <key's repo> <porcelainArgs>` before and after; `-uall` lists files inside new directories.
  const porcelain: Record<string, string[]> = {};
  for (const repo of repos) porcelain[repo.repoPath] = git(repo.workingRoot, PORCELAIN_ARGS).split('\0').filter(Boolean);
  // D7: the host repo holds plan.md, phases and reviews/. Snapshot it even when every code repo is mapped separately.
  try {
    const hostTop = realpathSync(runGit(['-C', canonicalFeature, 'rev-parse', '--show-toplevel']));
    const key = relative(projectReal, hostTop).replace(/\\/g, '/') || '.';
    if (!Object.hasOwn(porcelain, key)) porcelain[key] = git(hostTop, PORCELAIN_ARGS).split('\0').filter(Boolean);
  } catch { warnings.push('feature dir is not inside a git repository; reviewer writes there cannot be detected'); }
  return { ok: true, repos, notReviewed, phases, porcelain, porcelainArgs: PORCELAIN_ARGS, warnings, empty: notReviewed.length === 0 && repos.every((repo) => repo.files.length === 0) };
}

/** Runs the CLI: `--project-root`, `--feature-dir`, optional `--phase`. Exit 1 = refusal or bad arguments, 2 = unexpected failure. */
function main(argv: string[]): void {
  let values: { 'project-root'?: string; 'feature-dir'?: string; phase?: string };
  try {
    values = parseArgs({
      args: argv,
      options: { 'project-root': { type: 'string' }, 'feature-dir': { type: 'string' }, phase: { type: 'string' } },
      allowPositionals: false,
      strict: true,
    }).values;
  } catch { values = {}; }
  const projectRoot = values['project-root'];
  const featureDir = values['feature-dir'];
  if (!projectRoot || !featureDir) {
    writeAgentJson({ ok: false, error: 'invalid_arguments' });
    process.exitCode = 1;
    return;
  }
  try {
    if (values.phase !== undefined && !/^\d+$/.test(values.phase)) throw new ReviewScopeError('invalid_phase', `Invalid --phase: ${values.phase}`);
    writeAgentJson(computeReviewScope({ projectRoot, featureDir, phase: values.phase === undefined ? undefined : Number(values.phase) }));
  } catch (error) {
    if (error instanceof ReviewScopeError) {
      writeAgentJson({ ok: false, error: error.code, message: error.message, ...error.details });
      process.exitCode = 1;
    } else {
      writeAgentJson({ ok: false, error: 'scope_failed', message: error instanceof Error ? error.message : String(error) });
      process.exitCode = 2;
    }
  }
}

if (import.meta.main) main(process.argv.slice(2));
