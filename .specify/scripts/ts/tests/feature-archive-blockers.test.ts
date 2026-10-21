import { afterEach, describe, expect, it } from 'bun:test';
import { createHash } from 'node:crypto';
import { chmodSync, existsSync, mkdirSync, mkdtempSync, readdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { archiveFeature, checkArchiveFeature, type ArchiveInput } from '../src/commands/feature/archive';

const ARCHIVE_CLI = resolve(import.meta.dir, '../src/commands/feature/archive.ts');
const SCAN_CLI = resolve(import.meta.dir, '../src/commands/util/scan-cross-plan-deps.ts');
const BASE = '0123456789abcdef0123456789abcdef01234567';

let roots: string[] = [];

function makeRepo(): string {
  const root = mkdtempSync(join(tmpdir(), 'feature-archive-blockers-'));
  roots.push(root);
  return root;
}

function planMd(extra = '', rootStatus = 'done', rows = ['done']): string {
  const table = rows.map((s, i) => `| 0${i + 1} | [phase-0${i + 1}-x](phase-0${i + 1}-x.md) | ${s} | — | — |`).join('\n');
  return `---\ntitle: sample\nstatus: ${rootStatus}\n${extra}---\n\n# Plan\n\n## Phases\n\n| # | File | Status | Blocks | BlockedBy |\n|---|------|--------|--------|-----------|\n${table}\n`;
}

const specMd = (status = 'done') => `---\ntitle: sample\nstatus: ${status}\n---\n\n# Spec\n`;

function addFeature(root: string, id: string, plan = planMd(), spec = specMd()): string {
  const dir = join(root, '.specify', 'feature', id);
  mkdirSync(dir, { recursive: true });
  writeFileSync(join(dir, 'plan.md'), plan);
  writeFileSync(join(dir, 'spec.md'), spec);
  return dir;
}

function gitMapMd(front: string): string {
  return `---\ntask_id: sample-1\nfeature_branch: feat/sample-1\n${front}---\n\n`
    + '| Sub-workspace | Repo path | Milestone | Branch | Base ref | Worktree path |\n'
    + '|---|---|---|---|---|---|\n'
    + '| app | app | - | feat/sample-1 | main | _worktrees/sample/wt1 |\n';
}

const input = (root: string, extra: Partial<ArchiveInput> = {}): ArchiveInput =>
  ({ featureId: 'sample-1', repoRoot: root, specsRoot: '.specify', defaultFolder: 'feature', ...extra });

const cleanGit = () => '';

async function run(script: string, args: string[], root: string) {
  const proc = Bun.spawn(['bun', script, ...args], {
    cwd: root, stdout: 'pipe', stderr: 'pipe', env: { ...process.env, CLAUDE_PROJECT_DIR: root },
  });
  const [stdout, stderr, exitCode] = await Promise.all([
    new Response(proc.stdout).text(), new Response(proc.stderr).text(), proc.exited,
  ]);
  return { stdout, stderr, exitCode };
}

function treeHash(dir: string): string {
  const hash = createHash('sha256');
  const walk = (d: string) => {
    for (const entry of readdirSync(d, { withFileTypes: true }).sort((a, b) => a.name.localeCompare(b.name))) {
      const full = join(d, entry.name);
      hash.update(full);
      if (entry.isDirectory()) walk(full);
      else hash.update(readFileSync(full));
    }
  };
  walk(dir);
  return hash.digest('hex');
}

function initGit(root: string): void {
  const git = (...args: string[]) => Bun.spawnSync(
    ['git', '-c', 'user.name=t', '-c', 'user.email=t@example.com', ...args], { cwd: root },
  );
  git('init', '-q');
  git('add', '-A');
  git('commit', '-q', '-m', 'init');
}

afterEach(() => {
  for (const root of roots) rmSync(root, { recursive: true, force: true });
  roots = [];
});

describe('archive blockers', () => {
  it('reports no blockers for an archivable feature and warns when git is unavailable', () => {
    const root = makeRepo();
    addFeature(root, 'sample-1');
    const check = checkArchiveFeature(input(root));
    expect(check).toMatchObject({
      ok: true, from: '.specify/feature/sample-1', to: '.specify/archive/feature/sample-1',
      archived_from: 'done', blockers: [],
    });
    expect(check.warnings?.[0]).toContain('dirty-path check skipped');
  });

  for (const [label, front] of [
    ['realized', `base_commit_by_repo:\n  app: ${BASE}\n`],
    ['realized-unverified', ''],
    ['cleaning', `base_commit_by_repo:\n  app: ${BASE}\ncleaning_by_repo:\n  app:\n    started: x\n`],
  ] as const) {
    it(`blocks on a ${label} git-map row whose worktree exists`, () => {
      const root = makeRepo();
      const dir = addFeature(root, 'sample-1');
      writeFileSync(join(dir, 'git-map.md'), gitMapMd(front));
      mkdirSync(join(root, '_worktrees/sample/wt1'), { recursive: true });
      const { blockers } = checkArchiveFeature(input(root, { git: cleanGit }));
      expect(blockers).toHaveLength(1);
      expect(blockers[0]).toContain(`(git-map state: ${label})`);
      expect(blockers[0]).toContain('/tdk-repo-worktree cleanup sample-1');
    });
  }

  it('ignores git-map rows whose worktree is gone or already cleaned', () => {
    const root = makeRepo();
    const dir = addFeature(root, 'sample-1');
    writeFileSync(join(dir, 'git-map.md'), gitMapMd(`base_commit_by_repo:\n  app: ${BASE}\n`));
    expect(checkArchiveFeature(input(root, { git: cleanGit })).blockers).toEqual([]);

    writeFileSync(join(dir, 'git-map.md'), gitMapMd(`cleaned_by_repo:\n  app: ${BASE}\n`));
    mkdirSync(join(root, '_worktrees/sample/wt1'), { recursive: true });
    expect(checkArchiveFeature(input(root, { git: cleanGit })).blockers).toEqual([]);
  });

  it('resolves the worktree path from the workspace root, not the repo root', () => {
    const root = makeRepo();
    const workspace = makeRepo();
    const dir = addFeature(root, 'sample-1');
    writeFileSync(join(dir, 'git-map.md'), gitMapMd(`base_commit_by_repo:\n  app: ${BASE}\n`));
    mkdirSync(join(workspace, '_worktrees/sample/wt1'), { recursive: true });
    expect(checkArchiveFeature(input(root, { git: cleanGit })).blockers).toEqual([]);
    const { blockers } = checkArchiveFeature(input(root, { git: cleanGit, workspaceRoot: workspace }));
    expect(blockers).toHaveLength(1);
    expect(blockers[0]).toContain('live worktree');
  });

  it('blocks on dirty paths, scoped to the feature dir and excluding close-out.md and sessions.jsonl', () => {
    const root = makeRepo();
    const dir = addFeature(root, 'sample-1');
    const calls: string[][] = [];
    const dirty = (args: string[]) => { calls.push(args); return args.includes('status') ? ' M plan.md\n?? notes.txt\n' : ''; };
    const { blockers } = checkArchiveFeature(input(root, { git: dirty }));
    expect(blockers).toHaveLength(1);
    expect(blockers[0]).toContain('plan.md, notes.txt');
    expect(blockers[0]).toContain('commit or discard');
    const status = calls.find((c) => c.includes('status'));
    expect(status).toEqual([
      '--no-optional-locks', '-C', dir, 'status', '--porcelain', '--', '.',
      ':(exclude)close-out.md', ':(exclude)sessions.jsonl',
    ]);
    expect(blockers[0]).toContain('(close-out.md and sessions.jsonl ignored)');
  });

  it('treats only "not a git repository" as a warning, not a blocker', () => {
    const root = makeRepo();
    addFeature(root, 'sample-1');
    const notRepo = () => {
      throw Object.assign(new Error('Command failed'), { stderr: 'fatal: not a git repository (or any of the parent directories): .git\n' });
    };
    const check = checkArchiveFeature(input(root, { git: notRepo }));
    expect(check.blockers).toEqual([]);
    expect(check.warnings).toEqual(['dirty-path check skipped: not a git working tree']);
  });

  it('fails closed on a git error other than "not a git repository"', () => {
    const dubious = Object.assign(new Error('Command failed'), {
      stderr: "fatal: detected dubious ownership in repository at '/mnt/c/sample'\n",
    });
    for (const failingArg of ['rev-parse', 'status']) {
      const root = makeRepo();
      addFeature(root, 'sample-1');
      const git = (args: string[]) => { if (args.includes(failingArg)) throw dubious; return 'true\n'; };
      const check = checkArchiveFeature(input(root, { git }));
      expect(check.ok).toBe(false);
      expect(check.warnings).toBeUndefined();
      expect(check.blockers).toHaveLength(1);
      expect(check.blockers[0]).toContain('detected dubious ownership');
      expect(check.blockers[0]).toContain('safe.directory');
      expect(check.facts).toBeUndefined();
    }
  });

  it('blocks on a nested *.lock file', () => {
    const root = makeRepo();
    const dir = addFeature(root, 'sample-1');
    mkdirSync(join(dir, 'sub'), { recursive: true });
    writeFileSync(join(dir, 'sub', 'run.lock'), '');
    const { blockers } = checkArchiveFeature(input(root, { git: cleanGit }));
    expect(blockers).toHaveLength(1);
    expect(blockers[0]).toContain('sub/run.lock');
    expect(blockers[0]).toContain('no TDK run is active');
  });

  it.skipIf(process.getuid?.() === 0)('blocks instead of crashing when the feature dir cannot be scanned for locks', () => {
    const root = makeRepo();
    const dir = addFeature(root, 'sample-1');
    mkdirSync(join(dir, 'sealed'), { recursive: true });
    chmodSync(join(dir, 'sealed'), 0o000);
    try {
      const { blockers } = checkArchiveFeature(input(root, { git: cleanGit }));
      expect(blockers).toHaveLength(1);
      expect(blockers[0]).toContain('cannot scan');
      expect(blockers[0]).toContain('EACCES');
      expect(blockers[0]).toContain('permissions');
    } finally {
      chmodSync(join(dir, 'sealed'), 0o755);
    }
  });

  it('adds a fix line when spec.md or plan.md has no status: key', () => {
    const root = makeRepo();
    const dir = addFeature(root, 'sample-1', planMd(), '---\ntitle: sample\n---\n\n# Spec\n');
    const { blockers } = checkArchiveFeature(input(root, { git: cleanGit }));
    expect(blockers).toHaveLength(1);
    expect(blockers[0]).toContain("spec.md has no frontmatter 'status:' key");
    expect(blockers[0]).toContain(`add \`status:\` to spec.md, then run \`update-phase-status.ts --reconcile-root ${join(dir, 'plan.md')}\``);
    expect(readFileSync(join(dir, 'spec.md'), 'utf-8')).toBe('---\ntitle: sample\n---\n\n# Spec\n');

    writeFileSync(join(dir, 'plan.md'), '---\ntitle: sample\n---\n\n# Plan\n');
    const both = checkArchiveFeature(input(root, { git: cleanGit })).blockers;
    expect(both).toHaveLength(2);
    expect(both[0]).toContain("plan.md has no frontmatter 'status:' key");
  });

  for (const state of ['planned', 'applying', 'failed']) {
    it(`blocks on a ${state} artifact migration manifest`, () => {
      const root = makeRepo();
      const dir = addFeature(root, 'sample-1');
      const txn = join(dir, '.tdk-tmp', 'migrate-artifacts', '20260101-000000');
      mkdirSync(txn, { recursive: true });
      writeFileSync(join(txn, 'manifest.json'), JSON.stringify({ state }));
      const { blockers } = checkArchiveFeature(input(root, { git: cleanGit }));
      expect(blockers).toHaveLength(1);
      expect(blockers[0]).toContain('unfinished artifact migration');
      expect(blockers[0]).toContain('/tdk-plan sample-1 --migrate-artifacts');
    });
  }

  it('blocks on an unreadable migration manifest and on a red-team session dir', () => {
    const root = makeRepo();
    const dir = addFeature(root, 'sample-1');
    const txn = join(dir, '.tdk-tmp', 'migrate-artifacts', '20260101-000000');
    mkdirSync(txn, { recursive: true });
    writeFileSync(join(txn, 'manifest.json'), '{ not json');
    mkdirSync(join(dir, '.tdk-tmp', 'red-team', '260101-000000'), { recursive: true });
    const { blockers } = checkArchiveFeature(input(root, { git: cleanGit }));
    expect(blockers).toHaveLength(2);
    expect(blockers[0]).toContain('manifest unreadable');
    expect(blockers[1]).toContain('260101-000000');
    expect(blockers[1]).toContain('/tdk-plan sample-1 --red-team');
  });

  it('reports the existing hard errors as blockers too', () => {
    const root = makeRepo();
    addFeature(root, 'sample-1', planMd('', 'planned', ['todo']), specMd('planned'));
    mkdirSync(join(root, '.specify/archive/feature/sample-1'), { recursive: true });
    const { blockers, ok, archived_from } = checkArchiveFeature(input(root, { git: cleanGit }));
    expect(ok).toBe(false);
    expect(archived_from).toBeNull();
    expect(blockers.some((b) => b.includes('archive target already exists'))).toBe(true);
    expect(blockers.some((b) => b.includes('only done or cancelled'))).toBe(true);

    const missing = checkArchiveFeature(input(root, { featureId: 'sample-404', git: cleanGit }));
    expect(missing.blockers[0]).toContain('feature dir not found');
    expect(missing.blockers[0]).toContain('/tdk-archive --ingest sample-404');
    expect(missing.from).toBeNull();
  });

  it('does not block on a dirty close-out.md alone (real git)', async () => {
    const root = makeRepo();
    const dir = addFeature(root, 'sample-1');
    initGit(root);
    writeFileSync(join(dir, 'close-out.md'), '# Close-out\n');
    const { stdout, exitCode } = await run(ARCHIVE_CLI, ['sample-1', '--check'], root);
    expect(exitCode).toBe(0);
    const out = JSON.parse(stdout);
    expect(out).toMatchObject({ ok: true, blockers: [], archived_from: 'done' });
    expect(out.warnings).toBeUndefined();
  });

  it('does not block on an untracked or modified root sessions.jsonl (real git)', async () => {
    const root = makeRepo();
    const dir = addFeature(root, 'sample-1');
    writeFileSync(join(dir, 'sessions.jsonl'), '{"v":1,"session":"a"}\n');
    initGit(root);
    writeFileSync(join(dir, 'sessions.jsonl'), '{"v":1,"session":"a"}\n{"v":1,"session":"b"}\n');
    const modified = await run(ARCHIVE_CLI, ['sample-1', '--check'], root);
    expect(modified.exitCode).toBe(0);
    expect(JSON.parse(modified.stdout)).toMatchObject({ ok: true, blockers: [] });

    const fresh = makeRepo();
    const freshDir = addFeature(fresh, 'sample-1');
    initGit(fresh);
    writeFileSync(join(freshDir, 'sessions.jsonl'), '{"v":1,"session":"a"}\n');
    const untracked = await run(ARCHIVE_CLI, ['sample-1', '--check'], fresh);
    expect(untracked.exitCode).toBe(0);
    expect(JSON.parse(untracked.stdout)).toMatchObject({ ok: true, blockers: [] });
  });

  it('still blocks on a sessions.jsonl below the feature dir root (real git)', async () => {
    const root = makeRepo();
    const dir = addFeature(root, 'sample-1');
    initGit(root);
    mkdirSync(join(dir, 'phases'), { recursive: true });
    writeFileSync(join(dir, 'phases', 'sessions.jsonl'), 'x\n');
    const { stdout, exitCode } = await run(ARCHIVE_CLI, ['sample-1', '--check'], root);
    expect(exitCode).toBe(1);
    expect(JSON.parse(stdout).blockers[0]).toContain('sample-1/phases/');
  });

  it('--check exits 1 on a dirty non-close-out file and leaves the tree byte-identical', async () => {
    const root = makeRepo();
    const dir = addFeature(root, 'sample-1');
    initGit(root);
    writeFileSync(join(dir, 'notes.txt'), 'dirty');
    const before = treeHash(root);
    const { stdout, stderr, exitCode } = await run(ARCHIVE_CLI, ['sample-1', '--check'], root);
    expect(exitCode).toBe(1);
    const out = JSON.parse(stdout);
    expect(out.ok).toBe(false);
    expect(out.blockers).toHaveLength(1);
    expect(out.blockers[0]).toContain('notes.txt');
    expect(stderr).toContain('✗ uncommitted changes');
    expect(treeHash(root)).toBe(before);
    expect(existsSync(dir)).toBe(true);
  });

  it('--check on an archivable feature writes nothing and prints the full shape', async () => {
    const root = makeRepo();
    addFeature(root, 'sample-1');
    initGit(root);
    const before = treeHash(root);
    const { stdout, exitCode } = await run(ARCHIVE_CLI, ['sample-1', '--check'], root);
    expect(exitCode).toBe(0);
    expect(JSON.parse(stdout)).toEqual({
      ok: true, from: '.specify/feature/sample-1', to: '.specify/archive/feature/sample-1',
      archived_from: 'done', references: { plans: [], children: [] }, blockers: [],
    });
    expect(treeHash(root)).toBe(before);
  });

  it('apply re-runs the checks: a blocker added after --check stops the move', () => {
    const root = makeRepo();
    const dir = addFeature(root, 'sample-1');
    expect(checkArchiveFeature(input(root, { git: cleanGit })).ok).toBe(true);
    writeFileSync(join(dir, 'run.lock'), '');
    mkdirSync(join(dir, '.tdk-tmp', 'red-team', '260101-000000'), { recursive: true });
    const plan = readFileSync(join(dir, 'plan.md'), 'utf-8');

    const result = archiveFeature(input(root, { git: cleanGit }), () => { throw new Error('move must not run'); });
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error).toContain('2 blockers');
      expect(result.error).toContain('run.lock');
      expect(result.error).toContain('red-team');
    }
    expect(existsSync(dir)).toBe(true);
    expect(readFileSync(join(dir, 'plan.md'), 'utf-8')).toBe(plan);
    expect(existsSync(join(root, '.specify', 'archive'))).toBe(false);
  });

  it('moves committed migration evidence, other .tdk-tmp content and sessions.jsonl byte-unchanged', async () => {
    const root = makeRepo();
    const dir = addFeature(root, 'sample-1');
    const manifest = JSON.stringify({ state: 'committed', featureDir: dir });
    const txn = join(dir, '.tdk-tmp', 'migrate-artifacts', '20260101-000000');
    mkdirSync(txn, { recursive: true });
    writeFileSync(join(txn, 'manifest.json'), manifest);
    mkdirSync(join(dir, '.tdk-tmp', 'other'), { recursive: true });
    writeFileSync(join(dir, '.tdk-tmp', 'other', 'keep.txt'), 'keep');
    const sessions = '{"a":1}\n{"b":2}\n';
    writeFileSync(join(dir, 'sessions.jsonl'), sessions);
    initGit(root);

    const { exitCode } = await run(ARCHIVE_CLI, ['sample-1'], root);
    expect(exitCode).toBe(0);
    const target = join(root, '.specify/archive/feature/sample-1');
    expect(readFileSync(join(target, '.tdk-tmp/migrate-artifacts/20260101-000000/manifest.json'), 'utf-8')).toBe(manifest);
    expect(readFileSync(join(target, '.tdk-tmp/other/keep.txt'), 'utf-8')).toBe('keep');
    expect(readFileSync(join(target, 'sessions.jsonl'), 'utf-8')).toBe(sessions);
  });

  it('keeps scan-cross-plan-deps skipping archived plans; refs to them surface as dangling', async () => {
    const root = makeRepo();
    addFeature(root, 'sample-1', planMd('task_id: sample-a\nblockedBy: [ghost-ref]\n'));
    addFeature(root, 'sample-2', planMd('task_id: sample-b\nblockedBy: [sample-a]\n', 'planned', ['todo']), specMd('planned'));
    expect((await run(ARCHIVE_CLI, ['sample-1'], root)).exitCode).toBe(0);

    const { stdout, exitCode } = await run(SCAN_CLI, ['--current', 'sample-c'], root);
    expect(exitCode).toBe(0);
    const out = JSON.parse(stdout);
    expect(out.plans_found).toBe(1);
    const details = out.findings.map((f: { detail: string }) => f.detail);
    expect(details.some((d: string) => d.includes('sample-a') && d.includes('not found'))).toBe(true);
    expect(details.some((d: string) => d.includes('ghost-ref'))).toBe(false);
  });
});
