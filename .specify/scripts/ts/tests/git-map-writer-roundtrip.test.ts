// AC8, writer half: every writer's output survives a read unchanged.
//
// There are five writers of git-map.md, and the list has been wrong before — `/tdk-plan` Step 3e
// was missing from it, which is how a phase append came to erase an implement run. All five are
// represented here, in both header sets, plus the three frontmatter maps.
//
// The writers are prompt-driven skills, so what is executed here is a reference emitter that
// produces the documented format. It proves the format round-trips; the skills are held to it by
// the contract test and by the workflow smoke in this phase.

import { afterAll, describe, expect, it } from 'bun:test';
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { readGitMap, rowStateOf, type GitMap, type GitMapRow } from '../src/utils/git-map';

const dirs: string[] = [];
afterAll(() => { for (const dir of dirs) rmSync(dir, { recursive: true, force: true }); });

const SHA_API = '9f2c1b7ad4e60835c1f0a27b6d95e3814cc07a12';
const SHA_WEB = '3ab41d09e7c5286fb0a1d4e83729cf60518bd94e';

interface WriteInput {
  layout: 'current6' | 'legacy5';
  taskId: string;
  featureBranch?: string;
  rows: { sub: string; path: string; milestone?: string; branch?: string; baseRef?: string; worktree?: string }[];
  baseCommitByRepo?: Record<string, string>;
  cleaningByRepo?: Record<string, { intent: string; worktree_path: string }>;
  cleanedByRepo?: Record<string, string>;
}

const HEADERS = {
  current6: ['Sub-workspace', 'Repo path', 'Milestone', 'Branch', 'Base ref', 'Worktree path'],
  legacy5: ['Sub-workspace', 'Repo path', 'Branch', 'Base ref', 'Worktree path'],
};

/** Emit git-map.md in the documented format. `-` is the empty-cell marker. */
function writeMap(input: WriteInput): string {
  const dir = mkdtempSync(join(tmpdir(), 'tdk-roundtrip-'));
  dirs.push(dir);

  const fm: string[] = [`task_id: ${input.taskId}`];
  if (input.featureBranch !== undefined) fm.push(`feature_branch: ${input.featureBranch}`);
  if (input.baseCommitByRepo !== undefined) {
    fm.push('base_commit_by_repo:');
    for (const [k, v] of Object.entries(input.baseCommitByRepo)) fm.push(`  ${k}: ${v}`);
  }
  if (input.cleaningByRepo !== undefined) {
    fm.push('cleaning_by_repo:');
    for (const [k, v] of Object.entries(input.cleaningByRepo)) {
      fm.push(`  ${k}:`, `    intent: ${v.intent}`, `    worktree_path: ${v.worktree_path}`);
    }
  }
  if (input.cleanedByRepo !== undefined) {
    fm.push('cleaned_by_repo:');
    for (const [k, v] of Object.entries(input.cleanedByRepo)) fm.push(`  ${k}: ${v}`);
  }

  const header = HEADERS[input.layout];
  const lines = [
    `| ${header.join(' | ')} |`,
    `|${header.map(() => '---').join('|')}|`,
    ...input.rows.map(r => {
      const cells = input.layout === 'current6'
        ? [r.sub, r.path, r.milestone ?? '-', r.branch ?? '-', r.baseRef ?? '-', r.worktree ?? '-']
        : [r.sub, r.path, r.branch ?? '-', r.baseRef ?? '-', r.worktree ?? '-'];
      return `| ${cells.join(' | ')} |`;
    }),
  ];

  mkdirSync(dir, { recursive: true });
  writeFileSync(join(dir, 'git-map.md'), `---\n${fm.join('\n')}\n---\n\n# Git Map\n\n${lines.join('\n')}\n`);
  return dir;
}

function readBack(dir: string): GitMap {
  const map = readGitMap(dir);
  expect(map).not.toBeNull();
  return map as GitMap;
}

function row(map: GitMap, sub: string): GitMapRow {
  const found = map.rows.find(r => r.subWorkspace === sub);
  expect(found).toBeDefined();
  return found as GitMapRow;
}

describe('writer 1: /tdk-plan seed', () => {
  it('round-trips a seed with no feature_branch', () => {
    const map = readBack(writeMap({
      layout: 'current6',
      taskId: 'sample-001',
      rows: [
        { sub: 'api', path: 'apps/api', milestone: 'epic-1', baseRef: 'refs/remotes/origin/main' },
        { sub: 'web', path: 'apps/web', milestone: 'epic-2', baseRef: 'refs/heads/epic-2' },
      ],
    }));

    expect(map.layout).toBe('current6');
    expect(map.featureBranch).toBeNull();
    expect(rowStateOf(map, 'api')).toBe('seed');
    expect(row(map, 'api').baseRef).toBe('refs/remotes/origin/main');
    expect(row(map, 'web').milestone).toBe('epic-2');
    // Two repositories, two different base refs — the per-repo property the seed exists to record.
    expect(row(map, 'api').baseRef).not.toBe(row(map, 'web').baseRef);
  });
});

describe('writer 2: /tdk-plan reseed over a realized map', () => {
  it('preserves realized rows, feature_branch and all three maps', () => {
    const dir = writeMap({
      layout: 'current6',
      taskId: 'sample-001',
      featureBranch: 'feature/sample-001',
      rows: [{ sub: 'api', path: 'apps/api', milestone: 'epic-1', branch: 'feature/sample-001', baseRef: 'refs/heads/epic-1' }],
      baseCommitByRepo: { api: SHA_API },
      cleanedByRepo: { web: 'worktree+branch' },
    });
    const before = readFileSync(join(dir, 'git-map.md'), 'utf-8');
    const map = readBack(dir);

    expect(map.featureBranch).toBe('feature/sample-001');
    expect(map.baseCommitByRepo['api']).toBe(SHA_API);
    expect(map.cleanedByRepo['web']).toBe('worktree+branch');
    expect(rowStateOf(map, 'api')).toBe('realized');
    // Reading must not be a rewrite.
    expect(readFileSync(join(dir, 'git-map.md'), 'utf-8')).toBe(before);
  });
});

describe('writer 3: preflight realized write', () => {
  it('round-trips a realized row with its base commit', () => {
    const map = readBack(writeMap({
      layout: 'current6',
      taskId: 'sample-001',
      featureBranch: 'feature/sample-001',
      rows: [
        { sub: 'api', path: 'apps/api', milestone: 'epic-1', branch: 'feature/sample-001', baseRef: 'refs/remotes/origin/epic-1' },
        { sub: 'web', path: 'apps/web', milestone: 'epic-2', branch: 'feature/sample-001', baseRef: 'refs/heads/epic-2' },
      ],
      baseCommitByRepo: { api: SHA_API, web: SHA_WEB },
    }));

    expect(rowStateOf(map, 'api')).toBe('realized');
    expect(rowStateOf(map, 'web')).toBe('realized');
    expect(map.baseCommitByRepo['api']).toBe(SHA_API);
    expect(map.baseCommitByRepo['web']).toBe(SHA_WEB);
    // Kind is carried by the ref namespace, and both namespaces survive verbatim.
    expect(row(map, 'api').baseRef).toBe('refs/remotes/origin/epic-1');
    expect(row(map, 'web').baseRef).toBe('refs/heads/epic-2');
  });
});

describe('writer 4: tdk-repo-worktree create, standalone and delegated', () => {
  it('round-trips a worktree path', () => {
    const map = readBack(writeMap({
      layout: 'current6',
      taskId: 'sample-001',
      featureBranch: 'feature/sample-001',
      rows: [{
        sub: 'web', path: 'apps/web', milestone: 'epic-2',
        branch: 'feature/sample-001', baseRef: 'refs/heads/epic-2',
        worktree: '_worktrees/web/feature-sample-001',
      }],
      baseCommitByRepo: { web: SHA_WEB },
    }));

    expect(row(map, 'web').worktreePath).toBe('_worktrees/web/feature-sample-001');
    expect(rowStateOf(map, 'web')).toBe('realized');
  });
});

describe('writer 5: cleanup', () => {
  it('keeps the row and the milestone, and distinguishes intent from result', () => {
    const map = readBack(writeMap({
      layout: 'current6',
      taskId: 'sample-001',
      featureBranch: 'feature/sample-001',
      rows: [{ sub: 'web', path: 'apps/web', milestone: 'epic-2', branch: 'feature/sample-001', baseRef: 'refs/heads/epic-2' }],
      baseCommitByRepo: { web: SHA_WEB },
      cleaningByRepo: { web: { intent: 'worktree+branch', worktree_path: '_worktrees/web/feature-sample-001' } },
      cleanedByRepo: { web: 'worktree' },
    }));

    // Dropping the row would drop the intent; this keeps both, and the half-done cleanup reads as
    // cleaning rather than finished.
    expect(row(map, 'web').milestone).toBe('epic-2');
    expect(rowStateOf(map, 'web')).toBe('cleaning');
    expect(map.cleaningByRepo['web']).toMatchObject({ worktree_path: '_worktrees/web/feature-sample-001' });
    expect(map.cleanedByRepo['web']).toBe('worktree');
  });

  it('reads as cleaned only once the cleaning intent is cleared', () => {
    const map = readBack(writeMap({
      layout: 'current6',
      taskId: 'sample-001',
      featureBranch: 'feature/sample-001',
      rows: [{ sub: 'web', path: 'apps/web', milestone: 'epic-2', branch: 'feature/sample-001', baseRef: 'refs/heads/epic-2' }],
      baseCommitByRepo: { web: SHA_WEB },
      cleanedByRepo: { web: 'worktree+branch' },
    }));

    expect(rowStateOf(map, 'web')).toBe('cleaned');
  });
});

describe('both header sets round-trip', () => {
  it('legacy five-column output reads back with the same values', () => {
    const map = readBack(writeMap({
      layout: 'legacy5',
      taskId: 'sample-001',
      featureBranch: 'feature/sample-001',
      rows: [{
        sub: 'web', path: 'apps/web', branch: 'feature/sample-001',
        baseRef: 'origin/develop', worktree: '_worktrees/web/feature-sample-001',
      }],
    }));

    expect(map.layout).toBe('legacy5');
    expect(row(map, 'web')).toMatchObject({
      branch: 'feature/sample-001',
      baseRef: 'origin/develop',
      worktreePath: '_worktrees/web/feature-sample-001',
      milestone: undefined,
    });
    // A realized legacy map carries no object name, which is precisely realized-unverified.
    expect(rowStateOf(map, 'web')).toBe('realized-unverified');
  });

  it('the same logical row keeps its values in both sets', () => {
    const common = { sub: 'api', path: 'apps/api', branch: 'feature/sample-001', baseRef: 'origin/main' };
    const five = row(readBack(writeMap({
      layout: 'legacy5', taskId: 'sample-001', featureBranch: 'feature/sample-001', rows: [common],
    })), 'api');
    const six = row(readBack(writeMap({
      layout: 'current6', taskId: 'sample-001', featureBranch: 'feature/sample-001',
      rows: [{ ...common, milestone: 'epic-1' }],
    })), 'api');

    expect(six.branch).toBe(five.branch);
    expect(six.baseRef).toBe(five.baseRef);
    expect(six.milestone).toBe('epic-1');
  });
});

describe('the realize to cleanup to replan to implement round trip', () => {
  it('keeps every recorded value across a reseed', () => {
    // The sequence that used to erase an implement run: a phase append re-ran Step 3e, which
    // rewrote the file unconditionally.
    const realized: WriteInput = {
      layout: 'current6',
      taskId: 'sample-001',
      featureBranch: 'feature/sample-001',
      rows: [
        { sub: 'api', path: 'apps/api', milestone: 'epic-1', branch: 'feature/sample-001', baseRef: 'refs/heads/epic-1' },
        { sub: 'web', path: 'apps/web', milestone: 'epic-2', branch: 'feature/sample-001', baseRef: 'refs/heads/epic-2' },
      ],
      baseCommitByRepo: { api: SHA_API, web: SHA_WEB },
      cleanedByRepo: { web: 'worktree+branch' },
    };

    const before = readBack(writeMap(realized));

    // A reseed adds a newly configured repository and touches nothing else.
    const after = readBack(writeMap({
      ...realized,
      rows: [...realized.rows, { sub: 'jobs', path: 'apps/jobs', milestone: 'epic-3', baseRef: 'refs/remotes/origin/main' }],
    }));

    expect(after.featureBranch).toBe('feature/sample-001');
    expect(after.baseCommitByRepo).toEqual(before.baseCommitByRepo);
    expect(after.cleanedByRepo).toEqual(before.cleanedByRepo);
    expect(row(after, 'api')).toEqual(row(before, 'api'));
    expect(row(after, 'web')).toEqual(row(before, 'web'));
    expect(rowStateOf(after, 'web')).toBe('cleaned');
    expect(rowStateOf(after, 'jobs')).toBe('pending');
  });
});
