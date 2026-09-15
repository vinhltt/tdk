// AC8: the reader looks columns up by name, and refuses anything it does not recognise.
//
// Reading the table positionally is what makes a layout change silently destructive. The target
// six-column set inserts `Milestone` BEFORE `Branch`, so a positional read of it yields
// branch = the milestone and baseRef = the feature branch. Both values pass the branch allowlist,
// so nothing downstream can tell the row apart from a correct one.
//
// There is deliberately no "header looked wrong, fall back to five columns" path: that fallback is
// exactly how a six-column file gets misread.

import { afterAll, describe, expect, it } from 'bun:test';
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { readGitMap, rowStateOf } from '../src/utils/git-map';

const dirs: string[] = [];
afterAll(() => { for (const dir of dirs) rmSync(dir, { recursive: true, force: true }); });

function writeMap(body: string, frontmatter = 'task_id: sample-001\n'): string {
  const dir = mkdtempSync(join(tmpdir(), 'tdk-layout-'));
  dirs.push(dir);
  mkdirSync(dir, { recursive: true });
  writeFileSync(join(dir, 'git-map.md'), `---\n${frontmatter}---\n\n# Git Map\n\n${body}\n`);
  return dir;
}

const CURRENT6 = [
  '| Sub-workspace | Repo path | Milestone | Branch | Base ref | Worktree path |',
  '|---|---|---|---|---|---|',
  '| api | apps/api | epic-1 | feature/sample-001 | refs/remotes/origin/epic-1 | - |',
].join('\n');

const LEGACY5 = [
  '| Sub-workspace | Repo path | Branch | Base ref | Worktree path |',
  '|---|---|---|---|---|',
  '| api | apps/api | feature/sample-001 | origin/develop | - |',
].join('\n');

describe('recognised layouts', () => {
  it('reads the six-column set by name', () => {
    const map = readGitMap(writeMap(CURRENT6))!;

    expect(map.layout).toBe('current6');
    expect(map.rows).toHaveLength(1);
    expect(map.rows[0]).toMatchObject({
      subWorkspace: 'api',
      repoPath: 'apps/api',
      milestone: 'epic-1',
      branch: 'feature/sample-001',
      baseRef: 'refs/remotes/origin/epic-1',
      worktreePath: null,
    });
  });

  it('reads the legacy five-column set without inventing a milestone', () => {
    const map = readGitMap(writeMap(LEGACY5))!;

    expect(map.layout).toBe('legacy5');
    // The decisive assertion: baseRef is the base ref, not the milestone that a positional read of
    // the six-column set would have put there.
    expect(map.rows[0]).toMatchObject({
      branch: 'feature/sample-001',
      baseRef: 'origin/develop',
      milestone: undefined,
    });
  });

  it('does not confuse the two sets: the same row text means different things', () => {
    const six = readGitMap(writeMap(CURRENT6))!.rows[0]!;
    const five = readGitMap(writeMap(LEGACY5))!.rows[0]!;

    expect(six.branch).toBe('feature/sample-001');
    expect(five.branch).toBe('feature/sample-001');
    expect(six.milestone).toBe('epic-1');
    expect(five.milestone).toBeUndefined();
  });
});

describe('unrecognised layouts are malformed, never guessed', () => {
  const cases: Record<string, string> = {
    'reordered headers': [
      '| Sub-workspace | Repo path | Branch | Milestone | Base ref | Worktree path |',
      '|---|---|---|---|---|---|',
      '| api | apps/api | feature/sample-001 | epic-1 | origin/main | - |',
    ].join('\n'),
    'an extra column': [
      '| Sub-workspace | Repo path | Milestone | Branch | Base ref | Worktree path | Cleaned |',
      '|---|---|---|---|---|---|---|',
      '| api | apps/api | epic-1 | feature/sample-001 | origin/main | - | no |',
    ].join('\n'),
    'a missing column': [
      '| Sub-workspace | Repo path | Branch | Base ref |',
      '|---|---|---|---|',
      '| api | apps/api | feature/sample-001 | origin/main |',
    ].join('\n'),
    'a duplicated header': [
      '| Sub-workspace | Repo path | Branch | Branch | Base ref | Worktree path |',
      '|---|---|---|---|---|---|',
      '| api | apps/api | feature/sample-001 | x | origin/main | - |',
    ].join('\n'),
    'a renamed header': [
      '| Sub-workspace | Repo dir | Milestone | Branch | Base ref | Worktree path |',
      '|---|---|---|---|---|---|',
      '| api | apps/api | epic-1 | feature/sample-001 | origin/main | - |',
    ].join('\n'),
    'no header at all': '| api | apps/api | feature/sample-001 | origin/main | - |',
  };

  for (const [name, body] of Object.entries(cases)) {
    it(`treats ${name} as malformed and reads no rows`, () => {
      const map = readGitMap(writeMap(body))!;
      expect(map.layout).toBe('malformed');
      expect(map.rows).toEqual([]);
    });
  }
});

describe('frontmatter maps are a second source, independent of the table', () => {
  const SHA = '9f2c1b7ad4e60835c1f0a27b6d95e3814cc07a12';

  it('a sub-workspace absent from base_commit_by_repo is undefined, not malformed', () => {
    const map = readGitMap(writeMap(CURRENT6, 'task_id: sample-001\nfeature_branch: feature/sample-001\n'))!;

    expect(map.layout).toBe('current6');
    expect(map.baseCommitByRepo['api']).toBeUndefined();
    expect(rowStateOf(map, 'api')).toBe('realized-unverified');
  });

  it('a valid base commit is read through', () => {
    const map = readGitMap(writeMap(
      CURRENT6,
      `task_id: sample-001\nfeature_branch: feature/sample-001\nbase_commit_by_repo:\n  api: ${SHA}\n`,
    ))!;

    expect(map.baseCommitByRepo['api']).toBe(SHA);
    expect(rowStateOf(map, 'api')).toBe('realized');
  });

  it('an invalid base commit is preserved as invalid, never coerced away', () => {
    const map = readGitMap(writeMap(
      CURRENT6,
      'task_id: sample-001\nfeature_branch: feature/sample-001\nbase_commit_by_repo:\n  api: HEAD\n',
    ))!;

    // Coercing to undefined would demote the row to realized-unverified and resume against a value
    // that makes the ancestry check pass unconditionally.
    expect(map.baseCommitByRepo['api']).toMatchObject({ invalid: true, raw: 'HEAD' });
    expect(rowStateOf(map, 'api')).toBe('invalid-base-commit');
  });

  it('cleaning outranks a partial cleaned result', () => {
    const map = readGitMap(writeMap(
      CURRENT6,
      [
        'task_id: sample-001',
        'feature_branch: feature/sample-001',
        'cleaning_by_repo:',
        '  api:',
        '    intent: worktree+branch',
        '    worktree_path: _worktrees/api/feature-sample-001',
        'cleaned_by_repo:',
        '  api: worktree',
        '',
      ].join('\n'),
    ))!;

    expect(rowStateOf(map, 'api')).toBe('cleaning');
    expect(map.cleanedByRepo['api']).toBe('worktree');
  });

  it('reads the milestone map form and the legacy scalar differently', () => {
    const asMap = readGitMap(writeMap(CURRENT6, 'task_id: sample-001\nmilestone_branch:\n  api: epic-1\n'))!;
    const asScalar = readGitMap(writeMap(CURRENT6, 'task_id: sample-001\nmilestone_branch: epic-1\n'))!;

    expect(asMap.milestoneByRepo).toEqual({ api: 'epic-1' });
    expect(asMap.milestoneBranch).toBeNull();
    expect(asScalar.milestoneBranch).toBe('epic-1');
    expect(asScalar.milestoneByRepo).toEqual({});
  });

  it('surfaces an interrupted migration rather than ignoring it', () => {
    const map = readGitMap(writeMap(CURRENT6, 'task_id: sample-001\nmigration_pending: mig-2026-09-15\n'))!;
    expect(map.migrationPending).toBe('mig-2026-09-15');
  });
});
