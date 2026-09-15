import { afterAll, describe, expect, it } from 'bun:test';
import { execFileSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, realpathSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { readGitMap, probeSubWorkspaces } from '../src/utils/git-map';
import type { SubWorkspace } from '../src/utils/types';

const roots: string[] = [];

afterAll(() => {
  for (const root of roots) rmSync(root, { recursive: true, force: true });
});

function makeWorkspace(): string {
  const root = realpathSync.native(mkdtempSync(join(tmpdir(), 'tdk-git-map-')));
  roots.push(root);
  return root;
}

/** Initialise a git repo at `<root>/<relPath>` already checked out on `branch`. */
function makeRepo(root: string, relPath: string, branch: string): string {
  const dir = join(root, relPath);
  mkdirSync(dir, { recursive: true });
  execFileSync('git', ['init', '-q', '-b', branch], { cwd: dir });
  execFileSync('git', ['config', 'user.email', 'sample@example.test'], { cwd: dir });
  execFileSync('git', ['config', 'user.name', 'Sample'], { cwd: dir });
  writeFileSync(join(dir, 'README.md'), '# sample\n');
  execFileSync('git', ['add', '.'], { cwd: dir });
  execFileSync('git', ['commit', '-qm', 'init'], { cwd: dir });
  return dir;
}

function writeGitMap(featureDir: string, body: string): void {
  mkdirSync(featureDir, { recursive: true });
  writeFileSync(join(featureDir, 'git-map.md'), body);
}

const REALIZED_MAP = `---
task_id: sample-001
feature_branch: feature/sample-001
milestone_branch: epic-1
created: 2026-08-24
---

# Git Map

| Sub-workspace | Repo path | Branch | Base ref | Worktree path |
|---|---|---|---|---|
| api | apps/api | feature/sample-001 | origin/main | - |
| web | apps/web | feature/sample-001 | origin/develop | - |
`;

const SEED_MAP = `---
task_id: sample-001
created: 2026-08-24
---

# Git Map

| Sub-workspace | Repo path | Branch | Base ref | Worktree path |
|---|---|---|---|---|
| api | apps/api | - | origin/develop | - |
`;

describe('readGitMap', () => {
  it('returns null when git-map.md is absent', () => {
    expect(readGitMap(makeWorkspace())).toBeNull();
  });

  it('parses a realized map and skips the header and separator rows', () => {
    const featureDir = join(makeWorkspace(), 'feature');
    writeGitMap(featureDir, REALIZED_MAP);

    const map = readGitMap(featureDir)!;
    expect(map.taskId).toBe('sample-001');
    expect(map.featureBranch).toBe('feature/sample-001');
    expect(map.milestoneBranch).toBe('epic-1');
    expect(map.rows.map(r => r.subWorkspace)).toEqual(['api', 'web']);
    expect(map.rows[1]!.baseRef).toBe('origin/develop');
    expect(map.rows[0]!.worktreePath).toBeNull();
  });

  it('reports a seed map as having no feature branch', () => {
    const featureDir = join(makeWorkspace(), 'feature');
    writeGitMap(featureDir, SEED_MAP);

    const map = readGitMap(featureDir)!;
    expect(map.featureBranch).toBeNull();
    expect(map.rows[0]!.branch).toBeNull();
    expect(map.rows[0]!.baseRef).toBe('origin/develop');
  });

  it('degrades to null on a malformed file instead of throwing', () => {
    const featureDir = join(makeWorkspace(), 'feature');
    writeGitMap(featureDir, 'no frontmatter here\n');
    expect(readGitMap(featureDir)).toBeNull();
  });

  it('rejects branch values outside the allowlist', () => {
    const featureDir = join(makeWorkspace(), 'feature');
    writeGitMap(featureDir, REALIZED_MAP.replace('feature/sample-001\nmilestone', 'bad branch!\nmilestone'));
    expect(readGitMap(featureDir)!.featureBranch).toBeNull();
  });
});

describe('probeSubWorkspaces', () => {
  it('returns an empty array for a single-repo project without running git', () => {
    expect(probeSubWorkspaces('/nonexistent-on-purpose', [], null)).toEqual([]);
  });

  it('classifies matched and drifted against the recorded feature branch', () => {
    const root = makeWorkspace();
    makeRepo(root, 'apps/api', 'feature/sample-001');
    makeRepo(root, 'apps/web', 'develop');
    const featureDir = join(root, 'feature');
    writeGitMap(featureDir, REALIZED_MAP);

    const subs: SubWorkspace[] = [
      { name: 'api', path: 'apps/api' },
      { name: 'web', path: 'apps/web' },
    ];
    const [api, web] = probeSubWorkspaces(root, subs, readGitMap(featureDir));

    expect(api!.state).toBe('matched');
    expect(api!.actualBranch).toBe('feature/sample-001');
    expect(web!.state).toBe('drifted');
    expect(web!.actualBranch).toBe('develop');
    expect(web!.expectedBranch).toBe('feature/sample-001');
    expect(web!.baseRef).toBe('origin/develop');
  });

  it('reports not-created when the map is still a seed', () => {
    const root = makeWorkspace();
    makeRepo(root, 'apps/api', 'develop');
    const featureDir = join(root, 'feature');
    writeGitMap(featureDir, SEED_MAP);

    const [api] = probeSubWorkspaces(root, [{ name: 'api', path: 'apps/api' }], readGitMap(featureDir));
    expect(api!.state).toBe('not-created');
    expect(api!.expectedBranch).toBeNull();
    expect(api!.actualBranch).toBe('develop');
    expect(api!.baseRef).toBe('origin/develop');
  });

  it('reports not-created when no git-map.md exists at all', () => {
    const root = makeWorkspace();
    makeRepo(root, 'apps/api', 'develop');

    const [api] = probeSubWorkspaces(root, [{ name: 'api', path: 'apps/api' }], null);
    expect(api!.state).toBe('not-created');
    expect(api!.expectedBranch).toBeNull();
  });

  it('probes at the worktree path when the row overrides the working root', () => {
    // The main checkout deliberately stays on its old branch; only the worktree carries the
    // feature branch. Probing the main checkout here would report a false drift.
    //
    // The worktree must be a REAL worktree of apps/web. This used to be two independent
    // repositories that merely agreed about the branch name, which is exactly the shape the
    // identity gate now rejects.
    const root = makeWorkspace();
    const web = makeRepo(root, 'apps/web', 'develop');
    const worktree = join(root, '_worktrees/web/feature-sample-001');
    execFileSync('git', ['worktree', 'add', '-q', '-b', 'feature/sample-001', worktree], { cwd: web });

    const featureDir = join(root, 'feature');
    writeGitMap(
      featureDir,
      REALIZED_MAP.replace(
        '| web | apps/web | feature/sample-001 | origin/develop | - |',
        '| web | apps/web | feature/sample-001 | origin/develop | _worktrees/web/feature-sample-001 |',
      ),
    );

    const [entry] = probeSubWorkspaces(root, [{ name: 'web', path: 'apps/web' }], readGitMap(featureDir));
    expect(entry!.state).toBe('matched');
    expect(entry!.actualBranch).toBe('feature/sample-001');
    expect(entry!.worktreePath).toBe('_worktrees/web/feature-sample-001');
  });

  it('refuses a Worktree path that is an independent repository, however alike', () => {
    // Same branch name, same history: a clone of the same upstream satisfies both a branch
    // comparison and an ancestry check, so neither can establish identity. Accepting it would
    // dispatch the phase's writes into the clone while the real repository receives nothing.
    const root = makeWorkspace();
    const web = makeRepo(root, 'apps/web', 'develop');
    const impostor = join(root, '_worktrees/web/feature-sample-001');
    mkdirSync(join(root, '_worktrees/web'), { recursive: true });
    execFileSync('git', ['clone', '-q', web, impostor]);
    execFileSync('git', ['checkout', '-q', '-b', 'feature/sample-001'], { cwd: impostor });

    // Identical tip commit, identical branch name.
    const tip = (dir: string): string =>
      execFileSync('git', ['rev-parse', 'HEAD'], { cwd: dir, encoding: 'utf-8' }).trim();
    expect(tip(impostor)).toBe(tip(web));

    const featureDir = join(root, 'feature');
    writeGitMap(
      featureDir,
      REALIZED_MAP.replace(
        '| web | apps/web | feature/sample-001 | origin/develop | - |',
        '| web | apps/web | feature/sample-001 | origin/develop | _worktrees/web/feature-sample-001 |',
      ),
    );

    const [entry] = probeSubWorkspaces(root, [{ name: 'web', path: 'apps/web' }], readGitMap(featureDir));
    expect(entry!.state).not.toBe('matched');
    expect(entry!.note).toBe('worktree path is not a worktree of this repository');
  });

  it('reads branch metadata from the repository when the recorded worktree is gone', () => {
    // Recovery is needed exactly when the worktree directory has been deleted. Reading branch
    // metadata at the missing path would make that case unrecoverable.
    const root = makeWorkspace();
    const web = makeRepo(root, 'apps/web', 'develop');
    const worktree = join(root, '_worktrees/web/feature-sample-001');
    execFileSync('git', ['worktree', 'add', '-q', '-b', 'feature/sample-001', worktree], { cwd: web });
    rmSync(worktree, { recursive: true, force: true });

    const featureDir = join(root, 'feature');
    writeGitMap(
      featureDir,
      REALIZED_MAP.replace(
        '| web | apps/web | feature/sample-001 | origin/develop | - |',
        '| web | apps/web | feature/sample-001 | origin/develop | _worktrees/web/feature-sample-001 |',
      ),
    );

    const [entry] = probeSubWorkspaces(root, [{ name: 'web', path: 'apps/web' }], readGitMap(featureDir));
    expect(entry!.note).toBe('recorded worktree is missing');
    // The repository is still readable, which is what makes re-attach possible.
    expect(entry!.actualBranch).toBe('develop');
    expect(execFileSync('git', ['branch', '--list', 'feature/sample-001'], { cwd: web, encoding: 'utf-8' }).trim())
      .toContain('feature/sample-001');
  });

  it('reports unknown for a map row that is no longer in the config', () => {
    const root = makeWorkspace();
    makeRepo(root, 'apps/api', 'feature/sample-001');
    const featureDir = join(root, 'feature');
    writeGitMap(featureDir, REALIZED_MAP);

    const results = probeSubWorkspaces(root, [{ name: 'api', path: 'apps/api' }], readGitMap(featureDir));
    expect(results).toHaveLength(2);

    const orphan = results[1]!;
    expect(orphan.name).toBe('web');
    expect(orphan.state).toBe('unknown');
    expect(orphan.note).toBe('not in config');
    expect(orphan.actualBranch).toBeNull();
  });

  it('reports unknown when the configured path is not a git working tree', () => {
    const root = makeWorkspace();
    mkdirSync(join(root, 'apps/api'), { recursive: true });

    const [api] = probeSubWorkspaces(root, [{ name: 'api', path: 'apps/api' }], null);
    expect(api!.state).toBe('unknown');
    expect(api!.actualBranch).toBeNull();
  });

  it('reports a plain directory of the root repo as having no branch of its own', () => {
    // Monorepo layout: git answers for any directory inside a repository and would hand back the
    // root's branch, which would flag every sub-workspace as drifted against the recorded branch.
    const root = makeWorkspace();
    execFileSync('git', ['init', '-q', '-b', 'epic-1'], { cwd: root });
    mkdirSync(join(root, 'apps/api'), { recursive: true });
    const featureDir = join(root, 'feature');
    writeGitMap(featureDir, REALIZED_MAP);

    const [api] = probeSubWorkspaces(root, [{ name: 'api', path: 'apps/api' }], readGitMap(featureDir));
    expect(api!.state).toBe('unknown');
    expect(api!.actualBranch).toBeNull();
    expect(api!.note).toBe('not a separate git repository');
  });

  it('reports not-created for a configured sub-workspace the task never touched', () => {
    // git-map.md rows cover only affected repositories; an untouched one has no branch to expect.
    const root = makeWorkspace();
    makeRepo(root, 'apps/api', 'feature/sample-001');
    makeRepo(root, 'apps/jobs', 'main');
    const featureDir = join(root, 'feature');
    writeGitMap(featureDir, REALIZED_MAP);

    const subs: SubWorkspace[] = [
      { name: 'api', path: 'apps/api' },
      { name: 'jobs', path: 'apps/jobs' },
    ];
    const [, jobs] = probeSubWorkspaces(root, subs, readGitMap(featureDir));
    expect(jobs!.state).toBe('not-created');
    expect(jobs!.expectedBranch).toBeNull();
    expect(jobs!.actualBranch).toBe('main');
  });

  it('reports not-created for a row whose branch has not been created yet', () => {
    // Rows are appended one per repository as each succeeds, so a realized map can still carry
    // rows holding `-`. Those repositories are pending, not drifted.
    const root = makeWorkspace();
    makeRepo(root, 'apps/api', 'feature/sample-001');
    makeRepo(root, 'apps/web', 'develop');
    const featureDir = join(root, 'feature');
    writeGitMap(featureDir, REALIZED_MAP.replace(
      '| web | apps/web | feature/sample-001 | origin/develop | - |',
      '| web | apps/web | - | origin/develop | - |',
    ));

    const subs: SubWorkspace[] = [
      { name: 'api', path: 'apps/api' },
      { name: 'web', path: 'apps/web' },
    ];
    const [api, web] = probeSubWorkspaces(root, subs, readGitMap(featureDir));
    expect(api!.state).toBe('matched');
    expect(web!.state).toBe('not-created');
    expect(web!.actualBranch).toBe('develop');
  });

  it('names a detached HEAD instead of calling it a missing working tree', () => {
    const root = makeWorkspace();
    const dir = makeRepo(root, 'apps/api', 'feature/sample-001');
    const sha = execFileSync('git', ['-C', dir, 'rev-parse', 'HEAD'], { encoding: 'utf-8' }).trim();
    execFileSync('git', ['-C', dir, 'checkout', '-q', '--detach', sha]);
    const featureDir = join(root, 'feature');
    writeGitMap(featureDir, REALIZED_MAP);

    const [api] = probeSubWorkspaces(root, [{ name: 'api', path: 'apps/api' }], readGitMap(featureDir));
    expect(api!.state).toBe('unknown');
    expect(api!.note).toBe('detached HEAD');
  });

  it('refuses a Worktree path that escapes the workspace', () => {
    // git-map.md is committed, so this cell is attacker-influenceable. An unchecked traversal
    // probes an unrelated repository and reports its branch as this sub-workspace's.
    const root = makeWorkspace();
    makeRepo(root, 'apps/web', 'develop');
    const outside = makeWorkspace();
    execFileSync('git', ['init', '-q', '-b', 'attacker-branch'], { cwd: outside });
    const featureDir = join(root, 'feature');
    writeGitMap(featureDir, REALIZED_MAP.replace(
      '| web | apps/web | feature/sample-001 | origin/develop | - |',
      `| web | apps/web | feature/sample-001 | origin/develop | ../..${outside} |`,
    ));

    expect(readGitMap(featureDir)!.rows[1]!.worktreePath).toBeNull();
    const [web] = probeSubWorkspaces(root, [{ name: 'web', path: 'apps/web' }], readGitMap(featureDir));
    expect(web!.worktreePath).toBeNull();
    expect(web!.actualBranch).toBe('develop');
  });

  it('keeps a row that is short a trailing column instead of dropping it', () => {
    const featureDir = join(makeWorkspace(), 'feature');
    writeGitMap(featureDir, REALIZED_MAP.replace(
      '| api | apps/api | feature/sample-001 | origin/main | - |',
      '| api | apps/api | feature/sample-001 | origin/main |',
    ));
    const map = readGitMap(featureDir)!;
    expect(map.rows.map(r => r.subWorkspace)).toEqual(['api', 'web']);
    expect(map.rows[0]!.worktreePath).toBeNull();
  });

  it('ignores example tables inside fenced code blocks', () => {
    const featureDir = join(makeWorkspace(), 'feature');
    writeGitMap(featureDir, REALIZED_MAP + [
      '',
      'Example:',
      '',
      '```markdown',
      '| ghost | apps/ghost | feature/sample-001 | origin/main | - |',
      '```',
      '',
    ].join('\n'));
    expect(readGitMap(featureDir)!.rows.map(r => r.subWorkspace)).toEqual(['api', 'web']);
  });

  it('resolves paths against the workspace root, not the enclosing git repo', () => {
    // A nested layout where the workspace root sits below the outer git repo: joining the wrong
    // anchor silently probes a path that does not exist, and every repo reports unknown.
    const outer = makeWorkspace();
    execFileSync('git', ['init', '-q', '-b', 'outer-main'], { cwd: outer });
    const workspaceRoot = join(outer, 'nested/workspace');
    mkdirSync(workspaceRoot, { recursive: true });
    makeRepo(workspaceRoot, 'apps/api', 'feature/sample-001');
    const featureDir = join(workspaceRoot, 'feature');
    writeGitMap(featureDir, REALIZED_MAP);

    const subs: SubWorkspace[] = [{ name: 'api', path: 'apps/api' }];
    expect(probeSubWorkspaces(workspaceRoot, subs, readGitMap(featureDir))[0]!.state).toBe('matched');
    expect(probeSubWorkspaces(outer, subs, readGitMap(featureDir))[0]!.state).toBe('unknown');
  });
});
