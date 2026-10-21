import { afterEach, describe, expect, it } from 'bun:test';
import { chmodSync, existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { archiveFeature, renderArchivedFrontmatter } from '../src/commands/feature/archive';

const ARCHIVE_CLI = resolve(import.meta.dir, '../src/commands/feature/archive.ts');
const UPDATE_CLI = resolve(import.meta.dir, '../src/commands/util/update-phase-status.ts');
const FRONTMATTER_CLI = resolve(import.meta.dir, '../src/commands/util/update-phase-frontmatter-status.ts');

type Row = 'todo' | 'in_progress' | 'done' | 'blocked' | 'cancelled' | 'skipped';

function planMd(rows: Row[], extra = '', rootStatus = 'done'): string {
  const table = rows
    .map((status, i) => `| 0${i + 1} | [phase-0${i + 1}-x](phase-0${i + 1}-x.md) | ${status} | — | — |`)
    .join('\n');
  return `---\ntitle: sample\nstatus: ${rootStatus}\n${extra}---\n\n# Plan\n\n## Phases\n\n| # | File | Status | Blocks | BlockedBy |\n|---|------|--------|--------|-----------|\n${table}\n`;
}

function specMd(extra = '', status = 'done'): string {
  return `---\ntitle: sample\nstatus: ${status}\n${extra}---\n\n# Spec\n`;
}

let roots: string[] = [];

function makeRepo(): string {
  const root = mkdtempSync(join(tmpdir(), 'feature-archive-'));
  roots.push(root);
  return root;
}

function addFeature(root: string, id: string, plan: string, spec: string, folder = 'feature'): string {
  const dir = join(root, '.specify', folder, id);
  mkdirSync(dir, { recursive: true });
  writeFileSync(join(dir, 'plan.md'), plan);
  writeFileSync(join(dir, 'spec.md'), spec);
  return dir;
}

async function run(script: string, args: string[], root: string) {
  const proc = Bun.spawn(['bun', script, ...args], {
    cwd: root,
    stdout: 'pipe',
    stderr: 'pipe',
    env: { ...process.env, CLAUDE_PROJECT_DIR: root },
  });
  const [stdout, stderr, exitCode] = await Promise.all([
    new Response(proc.stdout).text(),
    new Response(proc.stderr).text(),
    proc.exited,
  ]);
  return { stdout, stderr, exitCode };
}

const input = (root: string, featureId: string) =>
  ({ featureId, repoRoot: root, specsRoot: '.specify', defaultFolder: 'feature' });

afterEach(() => {
  for (const root of roots) rmSync(root, { recursive: true, force: true });
  roots = [];
});

describe('feature archive', () => {
  it('archives a done feature: both files archived, dir moved, old path gone', async () => {
    const root = makeRepo();
    const dir = addFeature(root, 'sample-1', planMd(['done', 'skipped']), specMd());
    writeFileSync(join(dir, 'notes.txt'), 'untracked note');

    const { stdout, exitCode } = await run(ARCHIVE_CLI, ['sample-1'], root);
    expect(exitCode).toBe(0);
    const out = JSON.parse(stdout);
    expect(out).toMatchObject({
      ok: true,
      from: '.specify/feature/sample-1',
      to: '.specify/archive/feature/sample-1',
      archived_from: 'done',
      references: { plans: [], children: [] },
    });

    const target = join(root, '.specify', 'archive', 'feature', 'sample-1');
    expect(existsSync(dir)).toBe(false);
    for (const file of ['plan.md', 'spec.md']) {
      const text = readFileSync(join(target, file), 'utf-8');
      expect(text).toContain('status: archived\narchived_from: done\n');
    }
    expect(readFileSync(join(target, 'notes.txt'), 'utf-8')).toBe('untracked note');
  });

  it('archives a cancelled feature with archived_from cancelled', async () => {
    const root = makeRepo();
    addFeature(root, 'sample-2', planMd(['cancelled', 'skipped'], '', 'cancelled'), specMd('', 'cancelled'));

    const { stdout, exitCode } = await run(ARCHIVE_CLI, ['sample-2'], root);
    expect(exitCode).toBe(0);
    expect(JSON.parse(stdout).archived_from).toBe('cancelled');
    const plan = readFileSync(join(root, '.specify/archive/feature/sample-2/plan.md'), 'utf-8');
    expect(plan).toContain('status: archived\narchived_from: cancelled\n');
  });

  it('supports a non-default folder id', async () => {
    const root = makeRepo();
    addFeature(root, 'sample-3', planMd(['done']), specMd(), 'hotfix');

    const { stdout, exitCode } = await run(ARCHIVE_CLI, ['hotfix/sample-3'], root);
    expect(exitCode).toBe(0);
    expect(JSON.parse(stdout).to).toBe('.specify/archive/hotfix/sample-3');
  });

  for (const rows of [['todo'], ['in_progress', 'done'], ['blocked'], ['done', 'todo']] as Row[][]) {
    it(`rejects ${rows.join('+')} features and leaves bytes and location unchanged`, async () => {
      const root = makeRepo();
      const plan = planMd(rows, '', 'planned');
      const spec = specMd('', 'planned');
      const dir = addFeature(root, 'sample-4', plan, spec);

      const { exitCode, stderr } = await run(ARCHIVE_CLI, ['sample-4'], root);
      expect(exitCode).not.toBe(0);
      expect(stderr).toContain('only done or cancelled');
      expect(readFileSync(join(dir, 'plan.md'), 'utf-8')).toBe(plan);
      expect(readFileSync(join(dir, 'spec.md'), 'utf-8')).toBe(spec);
      expect(existsSync(join(root, '.specify', 'archive'))).toBe(false);
    });
  }

  it('rejects a draft feature without plan.md and an unparseable Phases section', async () => {
    const root = makeRepo();
    const noPlan = join(root, '.specify/feature/sample-5');
    mkdirSync(noPlan, { recursive: true });
    writeFileSync(join(noPlan, 'spec.md'), specMd('', 'draft'));
    const first = await run(ARCHIVE_CLI, ['sample-5'], root);
    expect(first.exitCode).not.toBe(0);
    expect(first.stderr).toContain('plan.md not found');

    const broken = '---\nstatus: done\n---\n\n# Plan\n\n## Phases\n\n| # | File | Status |\n|---|---|---|\n| 01 | [a](a.md) | wat |\n';
    const dir = addFeature(root, 'sample-6', broken, specMd());
    const second = await run(ARCHIVE_CLI, ['sample-6'], root);
    expect(second.exitCode).not.toBe(0);
    expect(second.stderr).toContain('not parseable');
    expect(readFileSync(join(dir, 'plan.md'), 'utf-8')).toBe(broken);
  });

  it('rejects an already archived feature and ids under archive/', async () => {
    const root = makeRepo();
    addFeature(root, 'sample-7', planMd(['done'], '', 'archived'), specMd('', 'archived'));
    const stored = await run(ARCHIVE_CLI, ['sample-7'], root);
    expect(stored.exitCode).not.toBe(0);
    expect(stored.stderr).toContain('already archived');

    addFeature(root, 'sample-8', planMd(['done']), specMd(), 'archive');
    const under = await run(ARCHIVE_CLI, ['archive/sample-8'], root);
    expect(under.exitCode).not.toBe(0);
    expect(under.stderr).toContain('already under archive/');
  });

  it('rejects when the archive target exists and writes nothing', async () => {
    const root = makeRepo();
    const plan = planMd(['done']);
    const spec = specMd();
    const dir = addFeature(root, 'sample-9', plan, spec);
    mkdirSync(join(root, '.specify/archive/feature/sample-9'), { recursive: true });

    const { exitCode, stderr } = await run(ARCHIVE_CLI, ['sample-9'], root);
    expect(exitCode).not.toBe(0);
    expect(stderr).toContain('already exists');
    expect(readFileSync(join(dir, 'plan.md'), 'utf-8')).toBe(plan);
    expect(readFileSync(join(dir, 'spec.md'), 'utf-8')).toBe(spec);
  });

  it('restores both files byte-for-byte when the move fails', () => {
    const root = makeRepo();
    const plan = planMd(['done']);
    const spec = `﻿${specMd().replace(/\n/g, '\r\n')}`;
    const dir = addFeature(root, 'sample-10', plan, spec);

    const result = archiveFeature(input(root, 'sample-10'), () => { throw new Error('disk gone'); });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error).toContain('disk gone');
    expect(readFileSync(join(dir, 'plan.md'), 'utf-8')).toBe(plan);
    expect(readFileSync(join(dir, 'spec.md'), 'utf-8')).toBe(spec);
    expect(existsSync(join(root, '.specify', 'archive'))).toBe(false);
  });

  // Root bypasses directory permissions, so the restore cannot be made to fail there.
  it.skipIf(process.getuid?.() === 0)('names the files it could not restore when the restore also fails', () => {
    const root = makeRepo();
    const dir = addFeature(root, 'sample-13', planMd(['done']), specMd());
    try {
      const result = archiveFeature(input(root, 'sample-13'), () => {
        chmodSync(dir, 0o500);
        throw new Error('disk gone');
      });
      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.error).toContain('disk gone');
        expect(result.error).toContain(`restore failed for ${join(dir, 'plan.md')}, ${join(dir, 'spec.md')}`);
      }
    } finally {
      chmodSync(dir, 0o700);
    }
  });

  it('rejects a status: line it cannot rewrite before touching disk', () => {
    const root = makeRepo();
    const plan = planMd(['done']);
    const spec = specMd('', 'done extra');
    const dir = addFeature(root, 'sample-14', plan, spec);
    const result = archiveFeature(input(root, 'sample-14'), () => { throw new Error('move must not run'); });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error).toContain(`cannot rewrite the status: line of ${join(dir, 'spec.md')}`);
    expect(readFileSync(join(dir, 'plan.md'), 'utf-8')).toBe(plan);
    expect(readFileSync(join(dir, 'spec.md'), 'utf-8')).toBe(spec);
  });

  it('reports incoming references before the move without blocking', async () => {
    const root = makeRepo();
    addFeature(root, 'sample-11', planMd(['done'], 'task_id: sample-task-11\n'), specMd());
    addFeature(root, 'other-a', planMd(['todo'], 'task_id: other-a\nblockedBy: [sample-task-11]\n', 'planned'), specMd());
    addFeature(root, 'other-b', planMd(['todo'], 'task_id: other-b\nblocks:\n  - sample-11\n', 'planned'), specMd());
    addFeature(root, 'child-c', planMd(['todo'], '', 'planned'), specMd('parent_spec: sample-11\n'));
    addFeature(root, 'child-d', planMd(['todo'], '', 'planned'), specMd('parent_spec: feature/sample-11\n'));
    addFeature(root, 'unrelated', planMd(['todo'], 'blockedBy: [nothing]\n', 'planned'), specMd('parent_spec: other-a\n'));

    const { stdout, stderr, exitCode } = await run(ARCHIVE_CLI, ['sample-11'], root);
    expect(exitCode).toBe(0);
    expect(stderr).toContain('WARNING');
    const { references } = JSON.parse(stdout);
    expect(references.plans.map((p: { plan: string; field: string; matched: string }) => [p.plan, p.field, p.matched]).sort())
      .toEqual([['other-a', 'blockedBy', 'sample-task-11'], ['other-b', 'blocks', 'sample-11']]);
    expect(references.children.map((c: { child: string }) => c.child).sort())
      .toEqual(['feature/child-c', 'feature/child-d']);
  });

  it('leaves the git index untouched in a git repo with tracked and ignored files', async () => {
    const root = makeRepo();
    const dir = addFeature(root, 'sample-12', planMd(['done']), specMd());
    const git = (...args: string[]) => Bun.spawnSync(
      ['git', '-c', 'user.name=t', '-c', 'user.email=t@example.com', ...args], { cwd: root },
    );
    git('init', '-q');
    writeFileSync(join(root, '.gitignore'), 'untracked.txt\n');
    git('add', '.gitignore', '.specify/feature/sample-12/plan.md', '.specify/feature/sample-12/spec.md');
    git('commit', '-q', '-m', 'init');
    writeFileSync(join(dir, 'untracked.txt'), 'x');
    const indexBefore = readFileSync(join(root, '.git', 'index'));

    const { exitCode } = await run(ARCHIVE_CLI, ['sample-12'], root);
    expect(exitCode).toBe(0);
    expect(Buffer.compare(readFileSync(join(root, '.git', 'index')), indexBefore)).toBe(0);
    const target = join(root, '.specify/archive/feature/sample-12');
    expect(existsSync(join(target, 'untracked.txt'))).toBe(true);
    expect(existsSync(dir)).toBe(false);
  });

  it('makes update-phase-status and update-phase-frontmatter-status refuse the archived plan', async () => {
    const root = makeRepo();
    addFeature(root, 'sample-13', planMd(['done']), specMd());
    expect((await run(ARCHIVE_CLI, ['sample-13'], root)).exitCode).toBe(0);

    const plan = join(root, '.specify/archive/feature/sample-13/plan.md');
    const before = readFileSync(plan, 'utf-8');
    const { exitCode, stderr } = await run(UPDATE_CLI, [plan, '1', 'todo'], root);
    expect(exitCode).not.toBe(0);
    expect(stderr).toContain('archived');
    expect(readFileSync(plan, 'utf-8')).toBe(before);

    const phase = join(root, '.specify/archive/feature/sample-13/phase-01-x.md');
    writeFileSync(phase, '---\nphase: 1\nstatus: done\n---\n');
    const frontmatter = await run(FRONTMATTER_CLI, [phase, 'todo'], root);
    expect(frontmatter.exitCode).toBe(1);
    expect(frontmatter.stderr).toContain('✗ plan is archived');
    expect(readFileSync(phase, 'utf-8')).toBe('---\nphase: 1\nstatus: done\n---\n');
  });
});

describe('renderArchivedFrontmatter', () => {
  it('preserves BOM and CRLF, inserts archived_from after status', () => {
    const out = renderArchivedFrontmatter('﻿---\r\nstatus: done # note\r\nx: 1\r\n---\r\nbody\r\n', 'done');
    expect(out).toBe('﻿---\r\nstatus: archived # note\r\narchived_from: done\r\nx: 1\r\n---\r\nbody\r\n');
  });

  it('overwrites an existing archived_from instead of duplicating it', () => {
    const out = renderArchivedFrontmatter('---\nstatus: cancelled\narchived_from: done\n---\n', 'cancelled');
    expect(out).toBe('---\nstatus: archived\narchived_from: cancelled\n---\n');
  });
});
