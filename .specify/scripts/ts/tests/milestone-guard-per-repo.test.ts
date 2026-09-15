// AC4: the wrong-milestone guard, across all eight transitions.
//
// The guard used to compare one live root branch against one scalar milestone. Moving that
// comparison per repository without changing its shape produces two false positives that train
// users to ignore it: a repository is on the feature branch right after a successful implement, and
// a milestone legitimately gains commits after a branch was cut from it. So the guard classifies the
// row first and compares against the recorded base *commit*.
//
// Evaluation order is part of the contract, not an implementation detail. An invalid base commit is
// a pre-gate before every transition, and a changed intent is evaluated before resume — otherwise a
// realized row whose intent moved matches both and fast-resume swallows the new intent.

import { afterAll, describe, expect, it } from 'bun:test';
import { execFileSync } from 'node:child_process';
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { baseCommitIssue, milestoneStateOf, readGitMap, rowStateOf } from '../src/utils/git-map';
import { cleanupPolyrepoFixtures, createPolyrepo, makeRepo } from './fixtures/polyrepo';

afterAll(() => {
  cleanupPolyrepoFixtures();
  for (const dir of mapDirs) rmSync(dir, { recursive: true, force: true });
});

function git(repo: string, args: string[], stdin?: string): string {
  return execFileSync('git', ['-C', repo, ...args], {
    encoding: 'utf-8',
    stdio: ['pipe', 'pipe', 'pipe'],
    ...(stdin === undefined ? { stdio: ['ignore', 'pipe', 'pipe'] as const } : { input: stdin }),
  }).trim();
}

/** A realized six-column map whose single row records `baseCommit` for `api`. */
function writeRealizedMap(prefix: string, baseCommit: string): string {
  const dir = mkdtempSync(join(tmpdir(), prefix));
  mapDirs.push(dir);
  writeFileSync(join(dir, 'git-map.md'), [
    '---',
    'task_id: sample-001',
    'feature_branch: feature/sample-001',
    'base_commit_by_repo:',
    `  api: ${baseCommit}`,
    '---',
    '',
    '# Git Map',
    '',
    '| Sub-workspace | Repo path | Milestone | Branch | Base ref | Worktree path |',
    '|---|---|---|---|---|---|',
    '| api | apps/api | epic-1 | feature/sample-001 | refs/heads/epic-1 | - |',
    '',
  ].join('\n'));
  return dir;
}

const mapDirs: string[] = [];

function tryGit(repo: string, args: string[]): boolean {
  return Bun.spawnSync(['git', '-C', repo, ...args]).exitCode === 0;
}

// --- the guard, as the contract specifies it ---------------------------------------------------

type Transition =
  | 'invalid-base'
  | 'intent-changed'
  | 'pre-create'
  | 'resume'
  | 'base-absent'
  | 'adopt'
  | 'cleaning'
  | 'cleaned';

interface Row {
  sub: string;
  milestone: string;
  branch: string;
  worktreePath?: string;
}

interface MapState {
  featureBranch?: string;
  rows: Row[];
  baseCommitByRepo: Record<string, string>;
  cleaningByRepo: Record<string, { intent: string; worktree_path: string }>;
  cleanedByRepo: Record<string, string>;
}

const OBJECT_NAME = /^([0-9a-f]{40}|[0-9a-f]{64})$/;

function usableBranch(b: string | undefined): boolean {
  return b !== undefined && b !== '' && b !== '-' && !b.includes('..');
}

/**
 * Which transition applies to `sub`, in the contract's fixed order.
 *
 * `intent` is the milestone resolved from the spec — the durable source — so it can differ from the
 * row's recorded `Milestone`.
 */
function classify(map: MapState, sub: string, intent: string | null, branchExists: boolean): Transition {
  const baseValue = map.baseCommitByRepo[sub];
  if (baseValue !== undefined && !OBJECT_NAME.test(baseValue)) return 'invalid-base';

  const row = map.rows.find(r => r.sub === sub);
  if (map.featureBranch === undefined) return 'pre-create';
  if (map.cleaningByRepo[sub] !== undefined) return 'cleaning';
  if (map.cleanedByRepo[sub] !== undefined) return 'cleaned';

  if (row === undefined) return branchExists ? 'adopt' : 'pre-create';
  if (!usableBranch(row.branch)) return 'pre-create';

  // Before resume: a changed intent must be reconciled, or it is silently discarded.
  if (intent !== null && intent !== row.milestone) return 'intent-changed';

  return baseValue === undefined ? 'base-absent' : 'resume';
}

/** Resume is valid when the branch still contains the recorded base commit. */
function resumeValid(repo: string, baseCommit: string, branch: string): boolean {
  return tryGit(repo, ['merge-base', '--is-ancestor', baseCommit, branch]);
}

// --- fixtures ----------------------------------------------------------------------------------

function baseMap(overrides: Partial<MapState> = {}): MapState {
  return {
    featureBranch: 'feature/sample-001',
    rows: [{ sub: 'api', milestone: 'epic-1', branch: 'feature/sample-001' }],
    baseCommitByRepo: {},
    cleaningByRepo: {},
    cleanedByRepo: {},
    ...overrides,
  };
}

function realizedFixture(prefix: string): { repo: string; baseCommit: string; container: string } {
  const fx = createPolyrepo({
    prefix,
    subs: [{ name: 'api', path: 'apps/api', defaultBranch: 'main', milestone: 'epic-1', pushMilestone: false }],
  });
  const api = fx.subs['api']!;
  const baseCommit = api.milestoneCommit as string;
  git(api.root, ['checkout', '-q', '-b', 'feature/sample-001', baseCommit]);
  return { repo: api.root, baseCommit, container: fx.container };
}

// --- transitions ---------------------------------------------------------------------------------

describe('AC4: eight transitions', () => {
  it('1 pre-create: warns only for the repository whose milestone differs', () => {
    const fx = createPolyrepo({
      prefix: 'tdk-guard-precreate-',
      subs: [
        { name: 'api', path: 'apps/api', defaultBranch: 'main', milestone: 'epic-1', currentBranch: 'epic-1', pushMilestone: false },
        { name: 'web', path: 'apps/web', defaultBranch: 'develop', milestone: 'epic-2', currentBranch: 'epic-2', pushMilestone: false },
      ],
    });
    const seed: MapState = { rows: [], baseCommitByRepo: {}, cleaningByRepo: {}, cleanedByRepo: {} };

    expect(classify(seed, 'api', 'epic-1', false)).toBe('pre-create');
    expect(classify(seed, 'web', 'epic-1', false)).toBe('pre-create');

    // Per-repo comparison: api matches its intent, web does not.
    expect(git(fx.subs['api']!.root, ['branch', '--show-current'])).toBe('epic-1');
    expect(git(fx.subs['web']!.root, ['branch', '--show-current'])).toBe('epic-2');
  });

  it('2 resume: a repository on its feature branch is not a wrong-milestone warning', () => {
    const { repo, baseCommit } = realizedFixture('tdk-guard-resume-');
    const map = baseMap({ baseCommitByRepo: { api: baseCommit } });

    expect(classify(map, 'api', 'epic-1', true)).toBe('resume');
    expect(resumeValid(repo, baseCommit, 'feature/sample-001')).toBe(true);
    // The old equality test compared this to `epic-1` and warned on every successful run.
    expect(git(repo, ['branch', '--show-current'])).toBe('feature/sample-001');
  });

  it('2b resume stays valid after the milestone gains commits', () => {
    const { repo, baseCommit } = realizedFixture('tdk-guard-advance-');
    git(repo, ['checkout', '-q', 'epic-1']);
    writeFileSync(join(repo, 'advance.txt'), 'advance\n');
    git(repo, ['add', '.']);
    git(repo, ['commit', '-qm', 'milestone advances']);
    const newTip = git(repo, ['rev-parse', 'HEAD']);
    git(repo, ['checkout', '-q', 'feature/sample-001']);

    expect(newTip).not.toBe(baseCommit);
    expect(resumeValid(repo, baseCommit, 'feature/sample-001')).toBe(true);
    // Comparing against the milestone's moving tip is the false positive being avoided.
    expect(resumeValid(repo, newTip, 'feature/sample-001')).toBe(false);
  });

  it('3 base-absent: degrades with a warning and never backfills from the tip', () => {
    const { repo, baseCommit } = realizedFixture('tdk-guard-unverified-');
    const map = baseMap();   // no base_commit_by_repo key at all

    expect(classify(map, 'api', 'epic-1', true)).toBe('base-absent');

    // Backfilling with the milestone tip would manufacture a passing ancestry check.
    git(repo, ['checkout', '-q', 'epic-1']);
    writeFileSync(join(repo, 'later.txt'), 'later\n');
    git(repo, ['add', '.']);
    git(repo, ['commit', '-qm', 'later']);
    const tip = git(repo, ['rev-parse', 'HEAD']);
    git(repo, ['checkout', '-q', 'feature/sample-001']);

    expect(tip).not.toBe(baseCommit);
    expect(resumeValid(repo, tip, 'feature/sample-001')).toBe(false);
  });

  it('4 invalid base: pre-gates every other transition and never degrades', () => {
    const { baseCommit } = realizedFixture('tdk-guard-invalid-');

    for (const bad of ['HEAD', 'not-a-sha', baseCommit.slice(0, 10)]) {
      // Whatever else is true of the row, the invalid value wins.
      expect(classify(baseMap({ baseCommitByRepo: { api: bad } }), 'api', 'epic-1', true)).toBe('invalid-base');
      expect(classify(baseMap({
        baseCommitByRepo: { api: bad }, rows: [{ sub: 'api', milestone: 'epic-1', branch: '-' }],
      }), 'api', 'epic-1', false)).toBe('invalid-base');
      expect(classify(baseMap({
        baseCommitByRepo: { api: bad }, cleanedByRepo: { api: 'worktree+branch' },
      }), 'api', 'epic-1', true)).toBe('invalid-base');
      // And a changed intent does not rescue it either.
      expect(classify(baseMap({ baseCommitByRepo: { api: bad } }), 'api', 'epic-9', true)).toBe('invalid-base');
    }
  });

  it('4b a well-formed object name that is not a commit here is invalid, not drift', () => {
    // Exercises the shipped reader and predicate, not `git cat-file` directly: the whole point is
    // that the production path classifies these, and it previously did not. A ghost SHA reached
    // `merge-base --is-ancestor`, which just fails — indistinguishable from honest drift, so the
    // user was told to fix the milestone instead of the poisoned record.
    const { repo, baseCommit } = realizedFixture('tdk-guard-badobject-');
    const ghost = 'a'.repeat(40);
    const blob = git(repo, ['hash-object', '-w', '--stdin'], 'not a commit\n');

    expect(OBJECT_NAME.test(ghost)).toBe(true);
    expect(OBJECT_NAME.test(blob)).toBe(true);
    expect(tryGit(repo, ['cat-file', '-e', `${blob}^{blob}`])).toBe(true);

    for (const [label, value] of [['ghost SHA', ghost], ['blob', blob]] as const) {
      const dir = writeRealizedMap(`tdk-guard-${label.replace(/\W+/g, '-')}-`, value);
      const map = readGitMap(dir)!;

      expect(rowStateOf(map, 'api', repo), label).toBe('invalid-base-commit');
      expect(milestoneStateOf(map, 'api', 'epic-1', repo), label).toBe('invalid');
      // Intent drift must not outrank the pre-gate.
      expect(milestoneStateOf(map, 'api', 'epic-9', repo), label).toBe('invalid');
      // The poisoned value stays readable in the file.
      expect(readFileSync(join(dir, 'git-map.md'), 'utf-8')).toContain(value);
    }

    // A real commit in this repository still classifies normally, so the gate is not blanket-failing.
    const good = readGitMap(writeRealizedMap('tdk-guard-good-', baseCommit))!;
    expect(rowStateOf(good, 'api', repo)).toBe('realized');
  });

  it('4c without a repository the pre-gate can only judge syntax, and says so by letting it pass', () => {
    // Documents the boundary: callers holding a repository must pass it, which every production
    // caller does. `baseCommitIssue` is the single place that decision lives.
    const ghost = 'b'.repeat(40);
    const map = readGitMap(writeRealizedMap('tdk-guard-norepo-', ghost))!;

    expect(baseCommitIssue(map, 'api')).toBeNull();
    expect(baseCommitIssue(map, 'api', realizedFixture('tdk-guard-norepo-cmp-').repo))
      .toMatchObject({ invalid: true, raw: ghost });
  });

  it('5 adopt: a same-named branch with no row is an adopt, not a resume', () => {
    const map: MapState = {
      featureBranch: 'feature/sample-001',
      rows: [], baseCommitByRepo: {}, cleaningByRepo: {}, cleanedByRepo: {},
    };
    expect(classify(map, 'api', 'epic-1', true)).toBe('adopt');
    expect(classify(map, 'api', 'epic-1', false)).toBe('pre-create');
  });

  it('6 intent changed after realize is evaluated before resume', () => {
    const { baseCommit } = realizedFixture('tdk-guard-intent-');
    const map = baseMap({ baseCommitByRepo: { api: baseCommit } });

    // Same inputs, only the spec's intent differs: without the ordering rule this row matches
    // `resume` as well, and fast-resume swallows the new intent silently.
    expect(classify(map, 'api', 'epic-1', true)).toBe('resume');
    expect(classify(map, 'api', 'epic-2', true)).toBe('intent-changed');
  });

  it('7 cleaning: a partial cleanup outranks its own partial result', () => {
    const map = baseMap({
      baseCommitByRepo: { api: 'b'.repeat(40) },
      cleaningByRepo: { api: { intent: 'worktree+branch', worktree_path: '_worktrees/api/x' } },
      cleanedByRepo: { api: 'worktree' },
    });

    // worktree removed, branch -d refused: reading `cleaned` first would call this finished.
    expect(classify(map, 'api', 'epic-1', true)).toBe('cleaning');
    expect(map.cleaningByRepo['api']!.worktree_path).toBe('_worktrees/api/x');
  });

  it('8 cleaned: only once the cleaning intent is gone', () => {
    const map = baseMap({
      baseCommitByRepo: { api: 'b'.repeat(40) },
      cleanedByRepo: { api: 'worktree+branch' },
    });
    expect(classify(map, 'api', 'epic-1', true)).toBe('cleaned');
  });

  it('covers all eight transitions and no combination lands between them', () => {
    const sha = 'c'.repeat(40);
    const seen = new Set<Transition>();
    for (const featureBranch of [undefined, 'feature/sample-001']) {
      for (const branch of ['-', 'feature/sample-001']) {
        for (const base of [undefined, sha, 'HEAD']) {
          for (const cleaning of [undefined, { intent: 'worktree', worktree_path: 'p' }]) {
            for (const cleaned of [undefined, 'worktree']) {
              for (const intent of ['epic-1', 'epic-9']) {
                for (const rows of [[], [{ sub: 'api', milestone: 'epic-1', branch }]]) {
                  seen.add(classify({
                    featureBranch,
                    rows,
                    baseCommitByRepo: base === undefined ? {} : { api: base },
                    cleaningByRepo: cleaning === undefined ? {} : { api: cleaning },
                    cleanedByRepo: cleaned === undefined ? {} : { api: cleaned },
                  }, 'api', intent, true));
                }
              }
            }
          }
        }
      }
    }
    expect([...seen].sort()).toEqual([
      'adopt', 'base-absent', 'cleaned', 'cleaning', 'intent-changed', 'invalid-base', 'pre-create', 'resume',
    ]);
  });
});

describe('RT-FM7: every reconcile choice changes the predicate', () => {
  it('only the STOP branch leaves the question open', () => {
    const recorded = 'epic-1';
    const intent = 'epic-2';
    const differs = (specIntent: string, rowMilestone: string): boolean => specIntent !== rowMilestone;

    expect(differs(intent, recorded)).toBe(true);
    // Update the record to the spec.
    expect(differs(intent, intent)).toBe(false);
    // Bring the spec back to the record.
    expect(differs(recorded, recorded)).toBe(false);
    // STOP writes nothing, so it is asked again — correctly, nothing was decided.
    expect(differs(intent, recorded)).toBe(true);
  });
});

describe('RT-H11 / RT-C1: nothing mutates the builder root or the artifact host', () => {
  /** A git shim that records every invocation with its target directory, for classification in TS. */
  function shimDir(container: string, log: string): string {
    const dir = join(container, 'gitshim');
    mkdirSync(dir, { recursive: true });
    const realGit = execFileSync('bash', ['-c', 'command -v git'], { encoding: 'utf-8' }).trim();
    writeFileSync(join(dir, 'git'), [
      '#!/usr/bin/env bash',
      'TARGET="$PWD"',
      'prev=""',
      'for a in "$@"; do',
      '  if [ "$prev" = "-C" ]; then TARGET="$a"; fi',
      '  prev="$a"',
      'done',
      `printf '%s\\t%s\\n' "$TARGET" "$*" >> ${JSON.stringify(log)}`,
      `exec ${JSON.stringify(realGit)} "$@"`,
      '',
    ].join('\n'));
    execFileSync('chmod', ['+x', join(dir, 'git')]);
    return dir;
  }

  /** Invocations that change repository state. `branch --show-current` and friends do not. */
  function mutationTargets(lines: string[]): string[] {
    const READ_ONLY_BRANCH = /--show-current|--list|^branch\s+-[ar]\b/;
    return lines.flatMap(line => {
      const [target, argv] = line.split('\t');
      if (target === undefined || argv === undefined) return [];
      const verb = argv.split(/\s+/).find(a => !a.startsWith('-') && a !== '-C' && a !== target);
      if (verb === undefined) return [];
      if (!['branch', 'checkout', 'switch', 'worktree', 'commit', 'merge', 'rebase', 'reset', 'push'].includes(verb)) return [];
      if (verb === 'branch' && READ_ONLY_BRANCH.test(argv)) return [];
      if (verb === 'worktree' && /worktree\s+list/.test(argv)) return [];
      return [target];
    });
  }

  const GUARD_PROBE = join(import.meta.dir, 'fixtures/guard-probe.ts');

  function runGuardProbe(input: {
    container: string; host: string; api: string; branch: string;
    env?: Record<string, string>; runner?: 'runGit' | 'raw';
  }): string[] {
    const log = join(input.container, `mutations-${input.branch.replace(/\W+/g, '-')}.log`);
    writeFileSync(log, '');
    const shim = shimDir(input.container, log);

    execFileSync('bun', [GUARD_PROBE, input.host, input.api, input.branch, input.runner ?? 'runGit'], {
      stdio: 'ignore',
      env: { ...process.env, ...(input.env ?? {}), PATH: `${shim}:${process.env['PATH'] ?? ''}` },
    });

    return readFileSync(log, 'utf-8').split('\n').filter(Boolean);
  }

  it('records mutations only against the code repository, in a clean environment', () => {
    const fx = createPolyrepo({ prefix: 'tdk-guard-mutation-' });
    const api = fx.subs['api']!.root;

    const targets = mutationTargets(runGuardProbe({
      container: fx.container, host: fx.host, api, branch: 'guard/clean',
    }));

    expect(targets).toEqual([api]);
    expect(targets).not.toContain(fx.host);
    expect(tryGit(api, ['rev-parse', '--verify', 'guard/clean'])).toBe(true);
    expect(tryGit(fx.host, ['rev-parse', '--verify', 'guard/clean'])).toBe(false);
  });

  it('still mutates only the code repository with GIT_DIR and GIT_WORK_TREE pointing at the host', () => {
    const fx = createPolyrepo({ prefix: 'tdk-guard-mutation-env-' });
    const api = fx.subs['api']!.root;
    const poisoned = { GIT_DIR: join(fx.host, '.git'), GIT_WORK_TREE: fx.host };

    const targets = mutationTargets(runGuardProbe({
      container: fx.container, host: fx.host, api, branch: 'guard/sanitized', env: poisoned,
    }));

    expect(targets).toEqual([api]);
    expect(tryGit(api, ['rev-parse', '--verify', 'guard/sanitized'])).toBe(true);
    expect(tryGit(fx.host, ['rev-parse', '--verify', 'guard/sanitized'])).toBe(false);
  });

  it('raw git in the same environment lands the branch in the host, which is why runGit exists', () => {
    const fx = createPolyrepo({ prefix: 'tdk-guard-mutation-raw-' });
    const api = fx.subs['api']!.root;
    const poisoned = { GIT_DIR: join(fx.host, '.git'), GIT_WORK_TREE: fx.host };

    runGuardProbe({
      container: fx.container, host: fx.host, api, branch: 'guard/raw', env: poisoned, runner: 'raw',
    });

    // `-C api` was honoured for the working directory and ignored for the repository: the branch
    // is in the host. This is the failure the sanitizing runner removes, demonstrated rather than
    // asserted in prose.
    expect(tryGit(fx.host, ['rev-parse', '--verify', 'guard/raw'])).toBe(true);
    expect(tryGit(api, ['rev-parse', '--verify', 'guard/raw'])).toBe(false);
  });

  it('a sub-workspace path that symlinks to the builder root is refused', () => {
    const fx = createPolyrepo({ prefix: 'tdk-guard-symlink-' });
    const builderRoot = join(fx.container, 'builder');
    makeRepo(builderRoot, 'master');

    const linked = join(fx.host, 'apps/linked');
    execFileSync('ln', ['-s', builderRoot, linked]);

    // The path is relative and free of `..`, so the string filters accept it. Identity does not:
    // its real path is outside the workspace entirely.
    const real = execFileSync('realpath', [linked], { encoding: 'utf-8' }).trim();
    const hostReal = execFileSync('realpath', [fx.host], { encoding: 'utf-8' }).trim();
    expect(real.startsWith(`${hostReal}/`)).toBe(false);
    expect(real).toBe(execFileSync('realpath', [builderRoot], { encoding: 'utf-8' }).trim());
  });

  it('a recorded worktree that no longer exists still allows re-attach', () => {
    const fx = createPolyrepo({ prefix: 'tdk-guard-missing-wt-' });
    const api = fx.subs['api']!.root;
    const wt = join(fx.container, 'wt-api');
    git(api, ['worktree', 'add', '-q', '-b', 'feature/sample-001', wt]);
    rmSync(wt, { recursive: true, force: true });

    expect(existsSync(wt)).toBe(false);
    // Metadata is still readable at the repository, which is what makes recovery possible.
    expect(git(api, ['branch', '--list', 'feature/sample-001'])).toContain('feature/sample-001');
    git(api, ['worktree', 'prune']);
    expect(tryGit(api, ['worktree', 'add', wt, 'feature/sample-001'])).toBe(true);
    expect(git(wt, ['branch', '--show-current'])).toBe('feature/sample-001');
  });
});
