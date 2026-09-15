// Per-repository base resolution, exercised against the real Step 3e fetch block.
//
// The wave-1 oracle (`Base ref`, per-repository attribution, and fetch outcomes) is still here and
// still has to pass now that the remote is resolved dynamically. On top of it this file carries the
// AC3 oracle: the `(Base ref, Base commit, kind)` triple defined by the Base resolution table in
// git-map-contract.md, resolved from each repository's OWN milestone.
//
// The bash under test is EXTRACTED FROM `tdk-plan/SKILL.md`, not retyped here: a copy would keep
// passing after someone edited the skill. The surrounding tier table is prose in the contract, so it is
// implemented here as an executable reference and phase 08 adds an end-to-end smoke over the real skill.

import { afterAll, describe, expect, it } from 'bun:test';
import { execFileSync } from 'node:child_process';
import { readFileSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import {
  breakRemote,
  cleanupPolyrepoFixtures,
  createPolyrepo,
  revParse,
  type PolyrepoFixture,
} from './fixtures/polyrepo';

const TDK_PLAN_SKILL = resolve(
  import.meta.dir,
  '../../../plugins/tdk-core/skills/tdk-plan/SKILL.md',
);

afterAll(cleanupPolyrepoFixtures);

/** Pull the Step 3e fetch block out of the skill so the test cannot drift from it. */
function extractFetchBlock(): string {
  const source = readFileSync(TDK_PLAN_SKILL, 'utf-8');
  const blocks = source.match(/```bash\n([\s\S]*?)```/g) ?? [];
  const match = blocks.find(b => b.includes('RUN_FETCH') && b.includes('AFFECTED_SUBS'));
  if (match === undefined) {
    throw new Error('Step 3e fetch block not found in tdk-plan/SKILL.md — did the fence change?');
  }
  return match.replace(/^```bash\n/, '').replace(/```$/, '');
}

interface RepoOutcome {
  sub: string;
  remote: string;
  rc: number;
  head: string;
  err: string;
}

/**
 * Run the extracted block over `subPaths` and report each repository's own result.
 *
 * `PROJECT_DIR`, `AFFECTED_SUBS`, and the aligned `AFFECTED_MILESTONES` placeholder are the block's
 * inputs; everything else runs exactly as the skill specifies it.
 */
function runStep3e(
  fx: PolyrepoFixture,
  subPaths: string[],
  gitArgsLog?: string,
  milestones: string[] = [],
  pathPrefix?: string,
): RepoOutcome[] {
  const block = extractFetchBlock()
    .replace(
      /^\s*AFFECTED_SUBS=\(\.\.\.\).*$/m,
      `AFFECTED_SUBS=(${subPaths.map(p => JSON.stringify(p)).join(' ')})`,
    )
    .replace(
      /^\s*AFFECTED_MILESTONES=\(\.\.\.\).*$/m,
      `AFFECTED_MILESTONES=(${subPaths.map((_, index) => JSON.stringify(milestones[index] ?? '')).join(' ')})`,
    );
  expect(block).toContain('AFFECTED_SUBS=("');
  expect(block).toContain('AFFECTED_MILESTONES=(');
  const reader = `
for f in "$FETCH_TMP"/*.sub; do
  KEY=$(basename "$f" .sub)
  printf '%s\\t%s\\t%s\\t%s\\t%s\\n' \\
    "$(cat "$f")" \\
    "$(cat "$FETCH_TMP/$KEY.remote")" \\
    "$(cat "$FETCH_TMP/$KEY.rc" 2>/dev/null || echo MISSING)" \\
    "$(cat "$FETCH_TMP/$KEY.head" 2>/dev/null)" \\
    "$(head -1 "$FETCH_TMP/$KEY.err" 2>/dev/null)"
done
`;
  const gitLogger = gitArgsLog === undefined
    ? ''
    : `git() { printf '%q ' "$@" >> ${JSON.stringify(gitArgsLog)}; printf '\\n' >> ${JSON.stringify(gitArgsLog)}; command git "$@"; }\n`;
  const script = `PROJECT_DIR=${JSON.stringify(fx.host)}\n${gitLogger}${block}\n${reader}`;
  const out = execFileSync('bash', ['-c', script], {
    encoding: 'utf-8',
    stdio: ['ignore', 'pipe', 'pipe'],
    env: {
      ...process.env,
      PATH: pathPrefix === undefined ? process.env['PATH'] : `${pathPrefix}:${process.env['PATH'] ?? ''}`,
      GIT_TERMINAL_PROMPT: '0',
    },
  });

  return out.split('\n').filter(Boolean).map(line => {
    const [sub, remote, rc, head, err] = line.split('\t');
    return { sub: sub ?? '', remote: remote ?? '', rc: Number(rc), head: head ?? '', err: err ?? '' };
  });
}

function makeFetchLogShim(fx: PolyrepoFixture, log: string, suffix: string): string {
  const realGit = execFileSync('bash', ['-c', 'command -v git'], { encoding: 'utf-8' }).trim();
  const shimDir = join(fx.container, `shim-${suffix}`);
  execFileSync('mkdir', ['-p', shimDir]);
  writeFileSync(join(shimDir, 'git'), [
    '#!/usr/bin/env bash',
    'for a in "$@"; do',
    `  if [ "$a" = "fetch" ]; then printf '%s\\n' "$*" >> ${JSON.stringify(log)}; break; fi`,
    'done',
    `exec ${JSON.stringify(realGit)} "$@"`,
    '',
  ].join('\n'));
  execFileSync('chmod', ['+x', join(shimDir, 'git')]);
  return shimDir;
}

/** The fetch outcome table from tdk-plan Step 3e, as the skill states it. */
function seedFromOutcome(
  outcome: RepoOutcome,
  mainBranch: string,
  milestone = '',
): { baseRef: string; note: string } {
  if (outcome.rc === 95 || outcome.rc === 96) {
    return { baseRef: '', note: outcome.err };
  }
  if (outcome.rc === 97) {
    return { baseRef: milestone === '' ? '' : `refs/heads/${milestone}`, note: 'local-only milestone' };
  }
  if (outcome.rc === 98) {
    return { baseRef: `refs/heads/${mainBranch}`, note: 'no remote; seeded local mainBranch' };
  }
  if (outcome.rc === 0 && outcome.head !== '') return { baseRef: outcome.head, note: '' };
  const remote = outcome.remote;
  if (outcome.rc === 0) {
    return { baseRef: `refs/remotes/${remote}/${mainBranch}`, note: `${remote}/HEAD unset; seeded from mainBranch` };
  }
  if (outcome.rc === 99) {
    return {
      baseRef: `refs/remotes/${remote}/${mainBranch}`,
      note: 'no enforceable fetch deadline (timeout unavailable or --kill-after unsupported); skipped fetch, seeded from mainBranch',
    };
  }
  return {
    baseRef: `refs/remotes/${remote}/${mainBranch}`,
    note: `fetch failed: ${outcome.err}; seeded from mainBranch`,
  };
}

/** api defaults to `main`, web to `develop` — two different remote defaults. */
function twoRepoFixture(prefix: string): PolyrepoFixture {
  return createPolyrepo({
    prefix,
    subs: [
      { name: 'api', path: 'apps/api', defaultBranch: 'main' },
      { name: 'web', path: 'apps/web', defaultBranch: 'develop' },
    ],
  });
}

describe('Step 3e seeds each repository from its own default branch', () => {
  it('gives two repositories two different base refs', () => {
    const fx = twoRepoFixture('tdk-seed-two-');
    const outcomes = runStep3e(fx, ['apps/api', 'apps/web']);

    expect(outcomes).toHaveLength(2);
    const byPath = Object.fromEntries(outcomes.map(o => [o.sub, o]));

    expect(byPath['apps/api']!.rc).toBe(0);
    expect(byPath['apps/web']!.rc).toBe(0);
    expect(seedFromOutcome(byPath['apps/api']!, 'main').baseRef).toBe('refs/remotes/origin/main');
    expect(seedFromOutcome(byPath['apps/web']!, 'main').baseRef).toBe('refs/remotes/origin/develop');
  });

  it('attributes a failure to the repository that produced it, never to its neighbour', () => {
    const fx = twoRepoFixture('tdk-seed-attr-');
    breakRemote(fx.subs['web']!);

    const outcomes = runStep3e(fx, ['apps/api', 'apps/web']);
    const byPath = Object.fromEntries(outcomes.map(o => [o.sub, o]));

    // web fails; api must be untouched by it. Keying results by index rather than by a sanitized
    // path is what keeps these two from being conflated.
    expect(byPath['apps/web']!.rc).not.toBe(0);
    expect(seedFromOutcome(byPath['apps/web']!, 'main').note).toContain('fetch failed');
    expect(byPath['apps/api']!.rc).toBe(0);
    expect(seedFromOutcome(byPath['apps/api']!, 'main').baseRef).toBe('refs/remotes/origin/main');
    expect(seedFromOutcome(byPath['apps/api']!, 'main').note).toBe('');
  });

  it('falls back with a note when the remote has no HEAD to resolve', () => {
    // The remote itself must have no usable HEAD. Deleting only the local `origin/HEAD` is not
    // enough — git re-creates it from the remote during the very fetch under test.
    const fx = createPolyrepo({
      prefix: 'tdk-seed-nohead-',
      subs: [{ name: 'api', path: 'apps/api', defaultBranch: 'main', unsetRemoteHead: true }],
    });

    const outcomes = runStep3e(fx, ['apps/api']);
    const seeded = seedFromOutcome(outcomes[0]!, 'main');

    expect(outcomes[0]!.rc).toBe(0);
    expect(seeded.baseRef).toBe('refs/remotes/origin/main');
    expect(seeded.note).toBe('origin/HEAD unset; seeded from mainBranch');
  });

  it('reports a no-remote repository without fetching an empty remote or forming a remote ref', () => {
    const fx = createPolyrepo({
      prefix: 'tdk-seed-noremote-',
      subs: [{ name: 'api', path: 'apps/api', defaultBranch: 'main', withRemote: false }],
    });

    const log = join(fx.container, 'git-calls.log');
    writeFileSync(log, '');
    const shimDir = makeFetchLogShim(fx, log, 'no-remote');
    const outcome = runStep3e(fx, ['apps/api'], log, [], shimDir)[0]!;
    const gitCalls = readFileSync(log, 'utf-8');

    expect(outcome.remote).toBe('');
    expect(outcome.rc).toBe(98);
    expect(outcome.head).toBe('');
    expect(outcome.err).toBe('');
    expect(gitCalls).not.toContain(' fetch ');
    expect(gitCalls).not.toContain('refs/remotes//');
    expect(seedFromOutcome(outcome, 'main')).toEqual({
      baseRef: 'refs/heads/main',
      note: 'no remote; seeded local mainBranch',
    });
  });

  it('fetches the non-first remote selected by a milestone upstream', () => {
    const fx = createPolyrepo({
      prefix: 'tdk-seed-upstream-remote-',
      subs: [{
        name: 'api',
        path: 'apps/api',
        defaultBranch: 'main',
        remoteName: 'team',
        milestone: 'epic-1',
      }],
    });
    const api = fx.subs['api']!;
    execFileSync('git', ['-C', api.root, 'remote', 'add', 'origin', api.remotePath!]);

    const log = join(fx.container, 'git-calls.log');
    writeFileSync(log, '');
    const shimDir = makeFetchLogShim(fx, log, 'upstream');
    const outcome = runStep3e(fx, ['apps/api'], undefined, ['epic-1'], shimDir)[0]!;
    const gitCalls = readFileSync(log, 'utf-8');

    expect(execFileSync('git', ['-C', api.root, 'remote'], { encoding: 'utf-8' }).trim().split('\n')).toEqual([
      'origin',
      'team',
    ]);
    expect(outcome.remote).toBe('team');
    expect(outcome.rc).toBe(0);
    expect(gitCalls).toContain('fetch --quiet team');
    expect(gitCalls).not.toContain('fetch --quiet origin');
  });

  it('does not fetch for a confirmed local-only milestone', () => {
    const fx = createPolyrepo({
      prefix: 'tdk-seed-local-milestone-',
      subs: [{
        name: 'api',
        path: 'apps/api',
        defaultBranch: 'main',
        milestone: 'epic-1',
        pushMilestone: false,
      }],
    });
    const log = join(fx.container, 'git-calls.log');
    writeFileSync(log, '');
    const shimDir = makeFetchLogShim(fx, log, 'local-milestone');

    const outcome = runStep3e(fx, ['apps/api'], log, ['epic-1'], shimDir)[0]!;

    expect(outcome.remote).toBe('');
    expect(outcome.rc).toBe(97);
    expect(seedFromOutcome(outcome, 'main', 'epic-1')).toEqual({
      baseRef: 'refs/heads/epic-1',
      note: 'local-only milestone',
    });
    expect(readFileSync(log, 'utf-8')).not.toContain(' fetch ');
  });

  it('does not fall through when a confirmed milestone is unresolved', () => {
    const fx = createPolyrepo({
      prefix: 'tdk-seed-unresolved-milestone-',
      subs: [{ name: 'api', path: 'apps/api', defaultBranch: 'main' }],
    });
    const log = join(fx.container, 'git-calls.log');
    writeFileSync(log, '');
    const shimDir = makeFetchLogShim(fx, log, 'unresolved-milestone');

    const outcome = runStep3e(fx, ['apps/api'], log, ['missing-epic'], shimDir)[0]!;

    expect(outcome.remote).toBe('');
    expect(outcome.rc).toBe(95);
    expect(outcome.err).toBe('confirmed milestone is unresolved');
    expect(seedFromOutcome(outcome, 'main', 'missing-epic')).toEqual({
      baseRef: '',
      note: 'confirmed milestone is unresolved',
    });
    expect(readFileSync(log, 'utf-8')).not.toContain(' fetch ');
  });

  it('does not dispatch a fetch when several remotes exist without a milestone upstream', () => {
    const fx = createPolyrepo({
      prefix: 'tdk-seed-multi-remote-',
      subs: [{ name: 'api', path: 'apps/api', defaultBranch: 'main', remoteName: 'team' }],
    });
    const api = fx.subs['api']!;
    execFileSync('git', ['-C', api.root, 'remote', 'add', 'origin', api.remotePath!]);
    const log = join(fx.container, 'git-calls.log');
    writeFileSync(log, '');
    const shimDir = makeFetchLogShim(fx, log, 'multiple-remotes');

    const outcome = runStep3e(fx, ['apps/api'], log, [], shimDir)[0]!;
    const gitCalls = readFileSync(log, 'utf-8');

    expect(outcome.remote).toBe('');
    expect(outcome.rc).toBe(96);
    expect(outcome.err).toBe('multiple remotes require confirmation');
    expect(gitCalls).not.toContain(' fetch ');
    expect(seedFromOutcome(outcome, 'main')).toEqual({
      baseRef: '',
      note: 'multiple remotes require confirmation',
    });
  });

  it('fetches each repository exactly once', () => {
    const fx = twoRepoFixture('tdk-seed-count-');
    const log = join(fx.container, 'fetch.log');
    writeFileSync(log, '');

    const realGit = execFileSync('bash', ['-c', 'command -v git'], { encoding: 'utf-8' }).trim();
    const shimDir = join(fx.container, 'shim');
    execFileSync('mkdir', ['-p', shimDir]);
    writeFileSync(join(shimDir, 'git'), [
      '#!/usr/bin/env bash',
      'for a in "$@"; do',
      `  if [ "$a" = "fetch" ]; then echo "fetch" >> ${JSON.stringify(log)}; break; fi`,
      'done',
      `exec ${JSON.stringify(realGit)} "$@"`,
      '',
    ].join('\n'));
    execFileSync('chmod', ['+x', join(shimDir, 'git')]);

    const block = extractFetchBlock()
      .replace(
        /^\s*AFFECTED_SUBS=\(\.\.\.\).*$/m,
        'AFFECTED_SUBS=("apps/api" "apps/web")',
      )
      .replace(
        /^\s*AFFECTED_MILESTONES=\(\.\.\.\).*$/m,
        'AFFECTED_MILESTONES=("" "")',
      );
    execFileSync('bash', ['-c', `PROJECT_DIR=${JSON.stringify(fx.host)}\n${block}`], {
      stdio: 'ignore',
      env: { ...process.env, PATH: `${shimDir}:${process.env['PATH'] ?? ''}`, GIT_TERMINAL_PROMPT: '0' },
    });

    expect(readFileSync(log, 'utf-8').split('\n').filter(Boolean)).toHaveLength(2);
  });
});

describe('fixture supports the shapes AC3 needs in phase 06', () => {
  it('builds a repository whose remote is not named origin', () => {
    const fx = createPolyrepo({
      prefix: 'tdk-fixture-upstream-',
      subs: [{ name: 'api', path: 'apps/api', defaultBranch: 'main', remoteName: 'upstream', milestone: 'epic-1' }],
    });
    const api = fx.subs['api']!;

    expect(api.remoteName).toBe('upstream');
    expect(revParse(api, 'refs/remotes/upstream/epic-1')).toBe(api.milestoneCommit);
    expect(revParse(api, 'refs/remotes/origin/epic-1')).toBeNull();
  });

  it('builds a repository whose milestone exists only locally', () => {
    const fx = createPolyrepo({
      prefix: 'tdk-fixture-local-',
      subs: [{ name: 'api', path: 'apps/api', defaultBranch: 'main', milestone: 'epic-1', pushMilestone: false }],
    });
    const api = fx.subs['api']!;

    expect(revParse(api, 'refs/heads/epic-1')).toBe(api.milestoneCommit);
    expect(revParse(api, 'refs/remotes/origin/epic-1')).toBeNull();
  });

  it('builds a repository with no remote at all', () => {
    const fx = createPolyrepo({
      prefix: 'tdk-fixture-noremote-',
      subs: [{ name: 'api', path: 'apps/api', defaultBranch: 'main', withRemote: false, milestone: 'epic-1' }],
    });
    const api = fx.subs['api']!;

    expect(api.remotePath).toBeNull();
    expect(revParse(api, 'refs/heads/epic-1')).toBe(api.milestoneCommit);
  });

  it('builds a tag that collides with the milestone branch name at a different commit', () => {
    const fx = createPolyrepo({
      prefix: 'tdk-fixture-tag-',
      subs: [{ name: 'api', path: 'apps/api', defaultBranch: 'main', milestone: 'epic-1', extraTag: 'epic-1' }],
    });
    const api = fx.subs['api']!;

    // This is the trap phase 06 must survive: the bare name prefers the tag, so a base ref
    // resolved as `epic-1` lands on a different commit than `refs/heads/epic-1`.
    expect(api.tagCommit).not.toBe(api.milestoneCommit);
    expect(revParse(api, 'epic-1')).toBe(api.tagCommit);
    expect(revParse(api, 'refs/heads/epic-1')).toBe(api.milestoneCommit);
  });

  it('builds two repositories on different milestones, for the phase 07 guard', () => {
    const fx = createPolyrepo({
      prefix: 'tdk-fixture-guard-',
      subs: [
        { name: 'api', path: 'apps/api', defaultBranch: 'main', milestone: 'epic-1', currentBranch: 'epic-1' },
        { name: 'web', path: 'apps/web', defaultBranch: 'develop', milestone: 'epic-2', currentBranch: 'epic-2' },
      ],
    });

    expect(fx.subs['api']!.currentBranch).toBe('epic-1');
    expect(fx.subs['web']!.currentBranch).toBe('epic-2');
    expect(revParse(fx.subs['api']!, 'refs/heads/epic-1')).not.toBeNull();
    expect(revParse(fx.subs['web']!, 'refs/heads/epic-2')).not.toBeNull();
  });

  it('uses only on-disk remotes, so nothing here can reach the network', () => {
    const fx = twoRepoFixture('tdk-fixture-offline-');
    for (const sub of Object.values(fx.subs)) {
      const urls = execFileSync('git', ['-C', sub.root, 'remote', '-v'], { encoding: 'utf-8' });
      expect(urls).not.toMatch(/https?:\/\/|git@|ssh:\/\/|git:\/\//);
      expect(urls).toContain(fx.container);
    }
  });
});

// --- AC3: the (Base ref, Base commit, kind) triple -------------------------------------------

type BaseKind = 'local' | 'remote';
interface BaseTriple { ref: string; commit: string | null; kind: BaseKind; note: string }

function git(repo: string, args: string[]): { out: string; ok: boolean } {
  const r = Bun.spawnSync(['git', '-C', repo, ...args]);
  return { out: r.stdout.toString().trim(), ok: r.exitCode === 0 };
}

/**
 * Base resolution, as the contract's tier table states it.
 *
 * Tier 1 takes the ref **and** the remote from the upstream. Re-joining the upstream's remote with the
 * local branch name is the bug this guards: a local `epic-1` tracking `releases/epic-1` would resolve
 * to an unrelated `refs/remotes/<remote>/epic-1` if one happens to exist.
 */
function resolveBase(repo: string, milestone: string | null, mainBranch: string): BaseTriple {
  if (milestone !== null) {
    const upstream = git(repo, ['rev-parse', '--symbolic-full-name', `${milestone}@{upstream}`]);
    if (upstream.ok && upstream.out !== '') {
      const commit = git(repo, ['rev-parse', `${upstream.out}^{commit}`]);
      return { ref: upstream.out, commit: commit.ok ? commit.out : null, kind: 'remote', note: '' };
    }
    const local = git(repo, ['rev-parse', `refs/heads/${milestone}^{commit}`]);
    if (local.ok) {
      return { ref: `refs/heads/${milestone}`, commit: local.out, kind: 'local', note: 'local-only milestone' };
    }
    // Confirmed but unresolvable: a question for the user, never a silent fall-through to tier 3.
    return { ref: '', commit: null, kind: 'local', note: 'unresolvable milestone: ask' };
  }

  const remote = git(repo, ['remote']).out.split('\n').filter(Boolean)[0] ?? 'origin';
  const head = git(repo, ['symbolic-ref', '--short', `refs/remotes/${remote}/HEAD`]);
  const ref = head.ok && head.out !== ''
    ? `refs/remotes/${head.out}`
    : `refs/remotes/${remote}/${mainBranch}`;
  const commit = git(repo, ['rev-parse', `${ref}^{commit}`]);
  return {
    ref,
    commit: commit.ok ? commit.out : null,
    kind: 'remote',
    note: head.ok && head.out !== '' ? '' : `${remote}/HEAD unset; seeded from mainBranch`,
  };
}

describe('AC3: base commit comes from each repository own milestone', () => {
  it('gives two repositories two different base commits, each from its own milestone', () => {
    const fx = createPolyrepo({
      prefix: 'tdk-ac3-two-',
      subs: [
        { name: 'api', path: 'apps/api', defaultBranch: 'main', milestone: 'epic-1' },
        // web is local-only: no remote at all, so a design that requires a successful fetch stops here.
        { name: 'web', path: 'apps/web', defaultBranch: 'develop', withRemote: false, milestone: 'epic-2' },
      ],
    });
    const api = fx.subs['api']!;
    const web = fx.subs['web']!;

    const apiBase = resolveBase(api.root, 'epic-1', 'main');
    const webBase = resolveBase(web.root, 'epic-2', 'main');

    expect(apiBase.kind).toBe('remote');
    expect(apiBase.commit).toBe(api.milestoneCommit);
    expect(webBase.kind).toBe('local');
    expect(webBase.ref).toBe('refs/heads/epic-2');
    expect(webBase.commit).toBe(web.milestoneCommit);

    // The point of AC3: not merely two different refs, two different commits.
    expect(apiBase.commit).not.toBe(webBase.commit);
  });

  it('a local-only milestone reaches a real branch without any fetch', () => {
    const fx = createPolyrepo({
      prefix: 'tdk-ac3-localonly-',
      subs: [{ name: 'api', path: 'apps/api', defaultBranch: 'main', milestone: 'epic-1', pushMilestone: false }],
    });
    const api = fx.subs['api']!;
    const base = resolveBase(api.root, 'epic-1', 'main');

    expect(base.kind).toBe('local');
    expect(base.commit).toBe(api.milestoneCommit);

    // kind=local must not require the fetch, so the branch can actually be created.
    expect(git(api.root, ['branch', '--', 'feature/sample-001', base.commit as string]).ok).toBe(true);
    expect(git(api.root, ['rev-parse', 'feature/sample-001^{commit}']).out).toBe(api.milestoneCommit);
  });

  it('a tag sharing the milestone name does not become the base', () => {
    const fx = createPolyrepo({
      prefix: 'tdk-ac3-tag-',
      subs: [{ name: 'api', path: 'apps/api', defaultBranch: 'main', milestone: 'epic-1', extraTag: 'epic-1', pushMilestone: false }],
    });
    const api = fx.subs['api']!;
    const base = resolveBase(api.root, 'epic-1', 'main');

    expect(base.ref).toBe('refs/heads/epic-1');
    expect(base.commit).toBe(api.milestoneCommit);
    expect(base.commit).not.toBe(api.tagCommit);
  });

  it('tier 3 applies only when no milestone was ever confirmed', () => {
    const fx = createPolyrepo({
      prefix: 'tdk-ac3-tier3-',
      subs: [{ name: 'api', path: 'apps/api', defaultBranch: 'main' }],
    });
    const api = fx.subs['api']!;

    const noMilestone = resolveBase(api.root, null, 'main');
    expect(noMilestone.kind).toBe('remote');
    expect(noMilestone.ref).toBe('refs/remotes/origin/main');

    // A milestone that WAS confirmed but cannot be resolved must ask, not quietly use the default.
    const unresolvable = resolveBase(api.root, 'epic-does-not-exist', 'main');
    expect(unresolvable.note).toContain('ask');
    expect(unresolvable.commit).toBeNull();
    expect(unresolvable.ref).not.toBe('refs/remotes/origin/main');
  });
});

describe('RT-H8: tier 1 takes both the remote and the branch name from the upstream', () => {
  it('follows an upstream whose name differs from the local branch', () => {
    const fx = createPolyrepo({
      prefix: 'tdk-rth8-',
      subs: [{ name: 'api', path: 'apps/api', defaultBranch: 'main', remoteName: 'team' }],
    });
    const api = fx.subs['api']!;

    // local epic-1 tracks team/releases/epic-1 ...
    git(api.root, ['checkout', '-q', '-b', 'epic-1']);
    Bun.write(`${api.root}/m.txt`, 'milestone\n');
    git(api.root, ['add', '.']);
    git(api.root, ['commit', '-qm', 'milestone commit']);
    const wanted = git(api.root, ['rev-parse', 'HEAD']).out;
    git(api.root, ['push', '-q', 'team', 'refs/heads/epic-1:refs/heads/releases/epic-1']);
    git(api.root, ['branch', '--set-upstream-to=team/releases/epic-1', 'epic-1']);

    // ... while an unrelated team/epic-1 exists at a different commit.
    git(api.root, ['checkout', '-q', '-b', 'decoy', 'main']);
    Bun.write(`${api.root}/d.txt`, 'decoy\n');
    git(api.root, ['add', '.']);
    git(api.root, ['commit', '-qm', 'decoy commit']);
    const decoy = git(api.root, ['rev-parse', 'HEAD']).out;
    git(api.root, ['push', '-q', 'team', 'refs/heads/decoy:refs/heads/epic-1']);
    git(api.root, ['fetch', '-q', 'team']);

    expect(decoy).not.toBe(wanted);

    const base = resolveBase(api.root, 'epic-1', 'main');
    expect(base.ref).toBe('refs/remotes/team/releases/epic-1');
    expect(base.commit).toBe(wanted);
    // Re-joining remote + local name would have produced the decoy's commit.
    expect(base.commit).not.toBe(decoy);
  });

  it('falls to tier 2 rather than guessing a same-named remote ref', () => {
    const fx = createPolyrepo({
      prefix: 'tdk-rth8-noupstream-',
      subs: [{ name: 'api', path: 'apps/api', defaultBranch: 'main', remoteName: 'team' }],
    });
    const api = fx.subs['api']!;

    git(api.root, ['checkout', '-q', '-b', 'epic-1']);
    Bun.write(`${api.root}/m.txt`, 'local milestone\n');
    git(api.root, ['add', '.']);
    git(api.root, ['commit', '-qm', 'local milestone']);
    const localCommit = git(api.root, ['rev-parse', 'HEAD']).out;

    // An unrelated remote branch of the same name exists, but there is no upstream link.
    git(api.root, ['push', '-q', 'team', 'refs/heads/main:refs/heads/epic-1']);
    git(api.root, ['fetch', '-q', 'team']);

    const base = resolveBase(api.root, 'epic-1', 'main');
    expect(base.kind).toBe('local');
    expect(base.ref).toBe('refs/heads/epic-1');
    expect(base.commit).toBe(localCommit);
  });
});

describe('RT-H9: the triple is re-resolved when the prompt changes the intent', () => {
  it('records the base commit of the final milestone, not the first one resolved', () => {
    const fx = createPolyrepo({
      prefix: 'tdk-rth9-',
      subs: [{ name: 'api', path: 'apps/api', defaultBranch: 'main', milestone: 'epic-1', pushMilestone: false }],
    });
    const api = fx.subs['api']!;

    git(api.root, ['checkout', '-q', '-b', 'epic-2', 'main']);
    Bun.write(`${api.root}/e2.txt`, 'epic two\n');
    git(api.root, ['add', '.']);
    git(api.root, ['commit', '-qm', 'epic-2 commit']);
    const epic2 = git(api.root, ['rev-parse', 'HEAD']).out;
    git(api.root, ['checkout', '-q', 'main']);

    const first = resolveBase(api.root, 'epic-1', 'main');   // step 5
    const final = resolveBase(api.root, 'epic-2', 'main');   // prompt changed the intent

    expect(first.commit).toBe(api.milestoneCommit);
    expect(final.commit).toBe(epic2);
    expect(final.commit).not.toBe(first.commit);

    // Keeping the first triple would create the branch from epic-1 while the record says epic-2 —
    // and the ancestry check would still pass on every later resume.
    git(api.root, ['branch', '--', 'feature/sample-001', final.commit as string]);
    expect(Bun.spawnSync(['git', '-C', api.root, 'merge-base', '--is-ancestor', epic2, 'feature/sample-001']).exitCode).toBe(0);
    expect(Bun.spawnSync(['git', '-C', api.root, 'merge-base', '--is-ancestor', api.milestoneCommit as string, 'feature/sample-001']).exitCode).not.toBe(0);
  });
});

describe('RT-C2: the no -b worktree add keeps attaching a branch', () => {
  it('re-attaches the branch with its commits instead of detaching at the base', () => {
    const fx = createPolyrepo({
      prefix: 'tdk-rtc2-',
      subs: [{ name: 'api', path: 'apps/api', defaultBranch: 'main', milestone: 'epic-1', pushMilestone: false }],
    });
    const api = fx.subs['api']!;
    const baseCommit = api.milestoneCommit as string;

    git(api.root, ['checkout', '-q', '-b', 'feature/sample-001', baseCommit]);
    Bun.write(`${api.root}/work.txt`, 'implementation\n');
    git(api.root, ['add', '.']);
    git(api.root, ['commit', '-qm', 'implementation commit']);
    const tip = git(api.root, ['rev-parse', 'HEAD']).out;
    git(api.root, ['checkout', '-q', 'main']);

    const wt = `${fx.container}/wt-api`;
    // The resume form: last argument is the BRANCH. Passing baseCommit here would detach at the base
    // and silently drop the implementation commit.
    expect(git(api.root, ['worktree', 'add', wt, 'feature/sample-001']).ok).toBe(true);

    expect(git(wt, ['branch', '--show-current']).out).toBe('feature/sample-001');
    expect(git(wt, ['rev-parse', 'HEAD']).out).toBe(tip);
    expect(Bun.spawnSync(['git', '-C', wt, 'merge-base', '--is-ancestor', baseCommit, 'HEAD']).exitCode).toBe(0);
  });
});

// --- RT-H1 / D6: reseed is idempotent per repository -------------------------------------------

interface MapRow { sub: string; path: string; milestone: string; branch: string; baseRef: string; worktree: string }
interface GitMap {
  featureBranch?: string;
  baseCommitByRepo: Record<string, string>;
  cleaningByRepo: Record<string, unknown>;
  cleanedByRepo: Record<string, string>;
  rows: MapRow[];
}

/** Row states that a reseed must leave completely alone. */
const FROZEN: ReadonlySet<string> = new Set(['realized', 'realized-unverified', 'cleaning', 'cleaned']);

function rowState(map: GitMap, sub: string): string {
  if (map.featureBranch === undefined) return 'seed';
  if (map.cleaningByRepo[sub] !== undefined) return 'cleaning';
  if (map.cleanedByRepo[sub] !== undefined) return 'cleaned';
  const row = map.rows.find(r => r.sub === sub);
  if (row === undefined || row.branch === '-' || row.branch === '') return 'pending';
  return map.baseCommitByRepo[sub] !== undefined ? 'realized' : 'realized-unverified';
}

/**
 * Step 3e reseed, as the skill's table states it: add what is missing, refresh what has not been
 * realized, and never touch anything else — including `feature_branch`.
 */
function reseed(map: GitMap, incoming: MapRow[]): GitMap {
  const next: GitMap = { ...map, rows: [...map.rows] };
  for (const row of incoming) {
    if (FROZEN.has(rowState(map, row.sub))) continue;
    const at = next.rows.findIndex(r => r.sub === row.sub);
    if (at === -1) next.rows.push(row);
    else next.rows[at] = { ...next.rows[at]!, milestone: row.milestone, baseRef: row.baseRef };
  }
  return next;
}

const SHA_API = '9f2c1b7ad4e60835c1f0a27b6d95e3814cc07a12';

function realizedMap(): GitMap {
  return {
    featureBranch: 'feature/sample-001',
    baseCommitByRepo: { api: SHA_API },
    cleaningByRepo: {},
    cleanedByRepo: { web: 'worktree+branch' },
    rows: [
      { sub: 'api', path: 'apps/api', milestone: 'epic-1', branch: 'feature/sample-001', baseRef: 'refs/remotes/origin/epic-1', worktree: '-' },
      { sub: 'web', path: 'apps/web', milestone: 'epic-2', branch: 'feature/sample-001', baseRef: 'refs/heads/epic-2', worktree: '-' },
    ],
  };
}

describe('RT-H1: reseeding does not undo an implement run', () => {
  it('leaves realized and cleaned rows, feature_branch and every map untouched', () => {
    const before = realizedMap();
    const after = reseed(before, [
      { sub: 'api', path: 'apps/api', milestone: 'epic-9', branch: '-', baseRef: 'refs/remotes/origin/main', worktree: '-' },
      { sub: 'web', path: 'apps/web', milestone: 'epic-9', branch: '-', baseRef: 'refs/remotes/origin/main', worktree: '-' },
    ]);

    // Without the frozen-state rule this sequence (implement -> cleanup -> append -> implement)
    // blanks Branch, drops feature_branch, and offers to recreate what was just cleaned up.
    expect(after.featureBranch).toBe('feature/sample-001');
    expect(after.baseCommitByRepo).toEqual({ api: SHA_API });
    expect(after.cleanedByRepo).toEqual({ web: 'worktree+branch' });
    expect(after.rows).toEqual(before.rows);
  });

  it('still refreshes a repository that has not been realized', () => {
    const before = realizedMap();
    before.rows.push({ sub: 'jobs', path: 'apps/jobs', milestone: 'epic-1', branch: '-', baseRef: 'refs/remotes/origin/main', worktree: '-' });

    const after = reseed(before, [
      { sub: 'jobs', path: 'apps/jobs', milestone: 'epic-3', branch: '-', baseRef: 'refs/remotes/origin/develop', worktree: '-' },
    ]);

    const jobs = after.rows.find(r => r.sub === 'jobs')!;
    expect(jobs.milestone).toBe('epic-3');
    expect(jobs.baseRef).toBe('refs/remotes/origin/develop');
  });

  it('D6: an appended phase seeds a repository that appears for the first time', () => {
    const before = realizedMap();
    const after = reseed(before, [
      { sub: 'api', path: 'apps/api', milestone: 'epic-1', branch: '-', baseRef: 'refs/remotes/origin/main', worktree: '-' },
      { sub: 'infra', path: 'apps/infra', milestone: 'epic-4', branch: '-', baseRef: 'refs/remotes/origin/main', worktree: '-' },
    ]);

    expect(after.rows).toHaveLength(3);
    expect(after.rows.find(r => r.sub === 'infra')?.milestone).toBe('epic-4');
    // Adding one row must not disturb the existing ones.
    expect(after.rows.slice(0, 2)).toEqual(before.rows.slice(0, 2));
  });

  it('is stable when run twice', () => {
    const incoming: MapRow[] = [
      { sub: 'api', path: 'apps/api', milestone: 'epic-9', branch: '-', baseRef: 'refs/remotes/origin/main', worktree: '-' },
      { sub: 'infra', path: 'apps/infra', milestone: 'epic-4', branch: '-', baseRef: 'refs/remotes/origin/main', worktree: '-' },
    ];
    const once = reseed(realizedMap(), incoming);
    expect(reseed(once, incoming)).toEqual(once);
  });
});
