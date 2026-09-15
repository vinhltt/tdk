// Locks the milestone contract defined in
// plugins/tdk-utils/skills/tdk-branch-preflight/references/git-map-contract.md.
//
// Two kinds of assertion live here:
//   - behavioural rules that can be decided from data alone (milestone precedence, row-state
//     classification, object-name grammar, the reset precondition, name uniqueness). These run the
//     rule as the contract states it and are green now.
//   - ref-kind resolution against a real repository, which needs the fixture from phase 04.
//
// The reference implementations below are the contract, executable. Phase 08 replaces each one with
// the shipped reader and deletes the local copy; until then they exist so the contract cannot be
// changed without a test noticing, and so phase 06/07 have an agreed oracle to build against.

import { afterAll, describe, expect, it } from 'bun:test';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { cleanupPolyrepoFixtures, createPolyrepo, revParse } from './fixtures/polyrepo';

const CONTRACT = resolve(
  import.meta.dir,
  '../../../plugins/tdk-utils/skills/tdk-branch-preflight/references/git-map-contract.md',
);

afterAll(cleanupPolyrepoFixtures);

// --- contract, as executable rules ------------------------------------------------------------

type MilestoneSpec = string | Record<string, string> | undefined;

/** Milestone resolution precedence (contract: "Milestone resolution"). */
function resolveMilestone(input: {
  spec: MilestoneSpec;
  rowMilestone?: string;
  subName: string;
  isArtifactHost: boolean;
}): string | null {
  const { spec, rowMilestone, subName, isArtifactHost } = input;
  if (spec !== undefined && typeof spec === 'object' && spec[subName] !== undefined) return spec[subName];
  if (rowMilestone !== undefined && rowMilestone !== '' && rowMilestone !== '-') return rowMilestone;
  if (typeof spec === 'string' && isArtifactHost) return spec;
  return null;
}

/** Object-name grammar (contract: "Object name validation"). */
function isValidObjectName(value: unknown): value is string {
  return typeof value === 'string' && (/^[0-9a-f]{40}$/.test(value) || /^[0-9a-f]{64}$/.test(value));
}

type RowState =
  | 'invalid-base-commit'
  | 'seed'
  | 'cleaning'
  | 'cleaned'
  | 'pending'
  | 'realized'
  | 'realized-unverified';

/** Branch-ref allowlist as the reader applies it — `-` and empty are not usable refs. */
function isUsableBranch(value: string | undefined): boolean {
  if (value === undefined || value === '' || value === '-') return false;
  if (value.includes('..')) return false;
  return /^[A-Za-z0-9._/-]+$/.test(value);
}

/** Row-state classification (contract: "Row states"), in the order the contract fixes. */
function classifyRow(input: {
  featureBranch?: string;
  branch?: string;
  subName: string;
  baseCommitByRepo?: Record<string, unknown>;
  cleaningByRepo?: Record<string, unknown>;
  cleanedByRepo?: Record<string, unknown>;
}): RowState {
  const { featureBranch, branch, subName, baseCommitByRepo, cleaningByRepo, cleanedByRepo } = input;

  // Pre-gate: runs before classification, independent of Branch and of lifecycle state.
  const hasBaseKey = baseCommitByRepo !== undefined && subName in baseCommitByRepo;
  if (hasBaseKey && !isValidObjectName(baseCommitByRepo[subName])) return 'invalid-base-commit';

  if (featureBranch === undefined) return 'seed';
  if (cleaningByRepo?.[subName] !== undefined) return 'cleaning';
  if (cleanedByRepo?.[subName] !== undefined) return 'cleaned';
  if (!isUsableBranch(branch)) return 'pending';
  return hasBaseKey ? 'realized' : 'realized-unverified';
}

/** Reset precondition for the task-level scalar (contract: "Reset operation"). */
function mayReleaseFeatureBranch(rowStates: RowState[]): boolean {
  return rowStates.every(s => s === 'seed' || s === 'pending' || s === 'cleaned');
}

/** Sub-workspace name uniqueness (contract: "Sub-workspace name uniqueness"). */
function findDuplicateNames(subs: { name: string; path: string }[]): Record<string, string[]> {
  const byName: Record<string, string[]> = {};
  for (const sub of subs) (byName[sub.name] ??= []).push(sub.path);
  return Object.fromEntries(Object.entries(byName).filter(([, paths]) => paths.length > 1));
}

// --- tests ------------------------------------------------------------------------------------

describe('milestone resolution precedence', () => {
  const rowMilestone = 'epic-from-row';

  it('1: the spec map wins over everything else', () => {
    expect(resolveMilestone({
      spec: { api: 'epic-1' }, rowMilestone, subName: 'api', isArtifactHost: true,
    })).toBe('epic-1');
  });

  it('2: the row column is used when the spec map has no key for that repo', () => {
    expect(resolveMilestone({
      spec: { web: 'epic-2' }, rowMilestone, subName: 'api', isArtifactHost: false,
    })).toBe(rowMilestone);
  });

  it('3: a scalar applies to the artifact host only', () => {
    expect(resolveMilestone({ spec: 'epic-1', subName: 'host', isArtifactHost: true })).toBe('epic-1');
    // The legacy scalar must not leak onto child repositories — that was the old model.
    expect(resolveMilestone({ spec: 'epic-1', subName: 'api', isArtifactHost: false })).toBeNull();
  });

  it('4: nothing to resolve means missing, not a guess', () => {
    expect(resolveMilestone({ spec: undefined, subName: 'api', isArtifactHost: false })).toBeNull();
    expect(resolveMilestone({
      spec: { web: 'epic-2' }, rowMilestone: '-', subName: 'api', isArtifactHost: false,
    })).toBeNull();
  });
});

describe('object name validation', () => {
  const sha1 = '9f2c1b7ad4e60835c1f0a27b6d95e3814cc07a12';

  it('accepts full sha1 and sha256 object names', () => {
    expect(isValidObjectName(sha1)).toBe(true);
    expect(isValidObjectName('a'.repeat(64))).toBe(true);
  });

  it('rejects HEAD, revision expressions and abbreviated names', () => {
    // HEAD is the one that matters: it passes the branch-ref allowlist, and it makes
    // `merge-base --is-ancestor HEAD <branch>` pass unconditionally.
    for (const bad of ['HEAD', '@', 'epic-1', `${sha1}~1`, `${sha1}^`, ':/fix', sha1.slice(0, 12), '']) {
      expect(isValidObjectName(bad)).toBe(false);
    }
  });

  it('is stricter than the branch-ref allowlist, which is why it is a separate validator', () => {
    expect(isUsableBranch('HEAD')).toBe(true);
    expect(isValidObjectName('HEAD')).toBe(false);
  });
});

describe('row state classification', () => {
  const sha = '9f2c1b7ad4e60835c1f0a27b6d95e3814cc07a12';
  const base = { subName: 'api', featureBranch: 'feature/sample-001' };

  it('no feature_branch is a seed, whatever the rows say', () => {
    expect(classifyRow({ subName: 'api', branch: '-' })).toBe('seed');
    expect(classifyRow({ subName: 'api', branch: 'feature/sample-001' })).toBe('seed');
  });

  it('an unusable Branch is pending, not only the literal dash', () => {
    for (const branch of ['-', '', 'has space', '../escape']) {
      expect(classifyRow({ ...base, branch })).toBe('pending');
    }
  });

  it('a usable Branch with a valid base commit is realized', () => {
    expect(classifyRow({ ...base, branch: 'feature/sample-001', baseCommitByRepo: { api: sha } }))
      .toBe('realized');
  });

  it('a usable Branch with the base key absent is realized-unverified', () => {
    expect(classifyRow({ ...base, branch: 'feature/sample-001', baseCommitByRepo: { web: sha } }))
      .toBe('realized-unverified');
  });

  it('cleaning outranks a partial cleaned result', () => {
    // A half-done cleanup writes both: the worktree really is gone, the branch is not.
    // Reading "has cleaned_by_repo" first would report that failure as finished.
    expect(classifyRow({
      ...base,
      branch: 'feature/sample-001',
      baseCommitByRepo: { api: sha },
      cleaningByRepo: { api: { intent: 'worktree+branch', worktree_path: '_worktrees/api/x' } },
      cleanedByRepo: { api: 'worktree' },
    })).toBe('cleaning');
  });

  it('cleaned requires the cleaning intent to be gone', () => {
    expect(classifyRow({
      ...base, branch: 'feature/sample-001', baseCommitByRepo: { api: sha },
      cleanedByRepo: { api: 'worktree+branch' },
    })).toBe('cleaned');
  });

  it('an invalid base commit blocks, independently of Branch and lifecycle state', () => {
    // Every one of these would otherwise classify as something benign.
    expect(classifyRow({ ...base, branch: '-', baseCommitByRepo: { api: 'HEAD' } }))
      .toBe('invalid-base-commit');
    expect(classifyRow({ subName: 'api', branch: '-', baseCommitByRepo: { api: 'HEAD' } }))
      .toBe('invalid-base-commit');
    expect(classifyRow({
      ...base, branch: 'feature/sample-001', baseCommitByRepo: { api: 'HEAD' },
      cleanedByRepo: { api: 'worktree+branch' },
    })).toBe('invalid-base-commit');
  });

  it('classifies every combination as exactly one state', () => {
    const states = new Set<RowState>();
    for (const featureBranch of [undefined, 'feature/sample-001']) {
      for (const branch of ['-', 'feature/sample-001']) {
        for (const baseCommitByRepo of [undefined, { api: sha }, { api: 'HEAD' }]) {
          for (const cleaningByRepo of [undefined, { api: { intent: 'worktree' } }]) {
            for (const cleanedByRepo of [undefined, { api: 'worktree' }]) {
              states.add(classifyRow({
                subName: 'api', featureBranch, branch, baseCommitByRepo, cleaningByRepo, cleanedByRepo,
              }));
            }
          }
        }
      }
    }
    expect([...states].sort()).toEqual([
      'cleaned', 'cleaning', 'invalid-base-commit', 'pending', 'realized', 'realized-unverified', 'seed',
    ]);
  });
});

describe('reset precondition for the task-level feature_branch', () => {
  it('releases the scalar only when no realized row remains', () => {
    expect(mayReleaseFeatureBranch(['seed', 'pending', 'cleaned'])).toBe(true);
    expect(mayReleaseFeatureBranch(['cleaned', 'realized'])).toBe(false);
    expect(mayReleaseFeatureBranch(['cleaned', 'realized-unverified'])).toBe(false);
  });
});

describe('sub-workspace name uniqueness', () => {
  it('reports the conflicting paths rather than silently picking one', () => {
    const dupes = findDuplicateNames([
      { name: 'api', path: 'apps/api-v1' },
      { name: 'api', path: 'apps/api-v2' },
      { name: 'web', path: 'apps/web' },
    ]);
    expect(Object.keys(dupes)).toEqual(['api']);
    expect(dupes['api']).toEqual(['apps/api-v1', 'apps/api-v2']);
  });

  it('accepts distinct names', () => {
    expect(findDuplicateNames([
      { name: 'api', path: 'apps/api' },
      { name: 'web', path: 'apps/web' },
    ])).toEqual({});
  });
});

describe('ref kind resolution against a real repository', () => {
  it('a fully qualified ref survives a tag of the same name; a bare name does not', () => {
    const fx = createPolyrepo({
      prefix: 'tdk-contract-refkind-',
      subs: [{ name: 'api', path: 'apps/api', defaultBranch: 'main', milestone: 'epic-1', extraTag: 'epic-1' }],
    });
    const api = fx.subs['api']!;

    // This is why the contract forbids storing a bare name: git prefers the tag.
    expect(revParse(api, 'epic-1')).toBe(api.tagCommit);
    expect(revParse(api, 'refs/heads/epic-1')).toBe(api.milestoneCommit);
    expect(api.tagCommit).not.toBe(api.milestoneCommit);
  });

  it('a local-only milestone resolves under refs/heads and has no remote-tracking ref', () => {
    const fx = createPolyrepo({
      prefix: 'tdk-contract-local-',
      subs: [{ name: 'api', path: 'apps/api', defaultBranch: 'main', milestone: 'epic-1', pushMilestone: false }],
    });
    const api = fx.subs['api']!;

    expect(revParse(api, 'refs/heads/epic-1')).toBe(api.milestoneCommit);
    expect(revParse(api, 'refs/remotes/origin/epic-1')).toBeNull();
  });

  it('a non-origin remote resolves under its own namespace', () => {
    const fx = createPolyrepo({
      prefix: 'tdk-contract-upstream-',
      subs: [{ name: 'api', path: 'apps/api', defaultBranch: 'main', remoteName: 'upstream', milestone: 'epic-1' }],
    });
    const api = fx.subs['api']!;

    // Hard-coding `origin` produces null here, which is how a base ref silently goes missing.
    expect(revParse(api, 'refs/remotes/upstream/epic-1')).toBe(api.milestoneCommit);
    expect(revParse(api, 'refs/remotes/origin/epic-1')).toBeNull();
  });
});

describe('resume invariant is stated against the commit, not the ref', () => {
  it('a milestone that advanced does not invalidate a branch built from the old base', () => {
    const fx = createPolyrepo({
      prefix: 'tdk-contract-resume-',
      subs: [{ name: 'api', path: 'apps/api', defaultBranch: 'main', milestone: 'epic-1' }],
    });
    const api = fx.subs['api']!;
    const baseCommit = api.milestoneCommit as string;

    // Branch from the milestone, then let the milestone move on.
    const git = (args: string[]): string =>
      Bun.spawnSync(['git', '-C', api.root, ...args]).stdout.toString().trim();
    git(['checkout', '-q', '-b', 'feature/sample-001', baseCommit]);
    git(['checkout', '-q', 'epic-1']);
    Bun.write(`${api.root}/advance.txt`, 'advance\n');
    git(['add', '.']);
    git(['commit', '-qm', 'milestone advances']);

    const newTip = revParse(api, 'refs/heads/epic-1');
    expect(newTip).not.toBe(baseCommit);

    // Against the recorded base commit: still an ancestor, so resume is fine.
    expect(Bun.spawnSync(['git', '-C', api.root, 'merge-base', '--is-ancestor', baseCommit, 'feature/sample-001']).exitCode)
      .toBe(0);
    // Against the milestone's moving tip: fails, which is the false positive the contract avoids.
    expect(Bun.spawnSync(['git', '-C', api.root, 'merge-base', '--is-ancestor', newTip as string, 'feature/sample-001']).exitCode)
      .not.toBe(0);
  });
});

describe('the contract document states the rules this test encodes', () => {
  const contract = readFileSync(CONTRACT, 'utf-8');

  it('declares exactly the two recognised header sets and forbids positional reads', () => {
    // Parsed as data rather than matched as escaped markdown: the set of columns is the contract,
    // its table formatting is not.
    const declared = [...contract.matchAll(/^\| (?:Target|Legacy), \d+ columns \| `([^`]+)` \|$/gm)]
      .map(m => m[1]!.split('\\|').map(c => c.trim()));

    expect(declared).toEqual([
      ['Sub-workspace', 'Repo path', 'Milestone', 'Branch', 'Base ref', 'Worktree path'],
      ['Sub-workspace', 'Repo path', 'Branch', 'Base ref', 'Worktree path'],
    ]);
    expect(contract).toContain('never by position');
  });

  it('no longer describes the milestone as a property of the root workspace', () => {
    expect(contract).not.toMatch(/compares the root workspace repo against it/);
    expect(contract).toContain('A milestone is a property of a code repository');
  });
});
