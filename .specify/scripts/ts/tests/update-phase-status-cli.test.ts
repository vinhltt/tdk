import { describe, it, expect, afterEach } from 'bun:test';
import { join } from 'node:path';
import { mkdtempSync, readFileSync, writeFileSync, rmSync, cpSync } from 'node:fs';
import { tmpdir } from 'node:os';

const CLI = join(import.meta.dir, '../src/commands/util/update-phase-status.ts');
const FIXTURES = join(import.meta.dir, 'fixtures');

let tmpDir: string;

function makeTmp(): string {
  tmpDir = mkdtempSync(join(tmpdir(), 'update-phase-status-'));
  return tmpDir;
}

afterEach(() => {
  if (tmpDir) rmSync(tmpDir, { recursive: true, force: true });
});

async function runCli(args: string[]): Promise<{ stdout: string; stderr: string; exitCode: number }> {
  const proc = Bun.spawn(['bun', CLI, ...args], { stdout: 'pipe', stderr: 'pipe' });
  const [stdout, stderr] = await Promise.all([
    new Response(proc.stdout).text(),
    new Response(proc.stderr).text(),
  ]);
  const exitCode = await proc.exited;
  return { stdout, stderr, exitCode };
}

describe('update-phase-status CLI', () => {
  it('no args → exit 1 + usage', async () => {
    const { exitCode, stderr } = await runCli([]);
    expect(exitCode).toBe(1);
    expect(stderr).toContain('Usage:');
  });

  it('valid update → exit 0 + file changed + success message', async () => {
    const dir = makeTmp();
    const planPath = join(dir, 'plan.md');
    cpSync(join(FIXTURES, 'plan-canonical.md'), planPath);

    const { exitCode, stdout } = await runCli([planPath, '3', 'done']);
    expect(exitCode).toBe(0);
    expect(stdout).toContain('✓ phase 03 → done');

    const updated = readFileSync(planPath, 'utf-8');
    expect(updated).toContain('| done |');
    expect(updated).not.toContain('| todo |');
  });

  it('idempotent → exit 0 + file unchanged + already message', async () => {
    const dir = makeTmp();
    const planPath = join(dir, 'plan.md');
    cpSync(join(FIXTURES, 'plan-canonical.md'), planPath);
    const before = readFileSync(planPath, 'utf-8');

    const { exitCode, stdout } = await runCli([planPath, '1', 'done']);
    expect(exitCode).toBe(0);
    expect(stdout).toContain('already done');

    const after = readFileSync(planPath, 'utf-8');
    expect(after).toBe(before);
  });

  it('invalid phase number → exit 1', async () => {
    const dir = makeTmp();
    const planPath = join(dir, 'plan.md');
    cpSync(join(FIXTURES, 'plan-canonical.md'), planPath);

    const { exitCode, stderr } = await runCli([planPath, 'abc', 'done']);
    expect(exitCode).toBe(1);
    expect(stderr).toContain('invalid phase number');
  });

  it('invalid status → exit 1', async () => {
    const dir = makeTmp();
    const planPath = join(dir, 'plan.md');
    cpSync(join(FIXTURES, 'plan-canonical.md'), planPath);

    const { exitCode, stderr } = await runCli([planPath, '1', 'finished']);
    expect(exitCode).toBe(1);
    expect(stderr).toContain('invalid status');
  });

  it('missing file → exit 1', async () => {
    const { exitCode, stderr } = await runCli(['/tmp/nonexistent-xyz.md', '1', 'done']);
    expect(exitCode).toBe(1);
    expect(stderr).toContain('cannot read');
  });

  it('plan without ## Phases → exit 1', async () => {
    const dir = makeTmp();
    const planPath = join(dir, 'plan.md');
    cpSync(join(FIXTURES, 'plan-missing-phases-section.md'), planPath);

    const { exitCode, stderr } = await runCli([planPath, '1', 'done']);
    expect(exitCode).toBe(1);
    expect(stderr).toContain('## Phases section not found');
  });

  it('legacy-vocab plan → exit 1 + stderr Legacy format + file unchanged', async () => {
    const dir = makeTmp();
    const planPath = join(dir, 'plan.md');
    const legacyMd = `# Legacy Plan

## Phases

| # | File | Status | Blocks | BlockedBy |
|---|------|--------|--------|-----------|
| 01 | [phase-01-setup](phase-01-setup.md) | pending | — | — |
| 02 | [phase-02-db](phase-02-db.md) | in_progress | — | 01 |
`;
    writeFileSync(planPath, legacyMd, 'utf-8');

    const { exitCode, stderr } = await runCli([planPath, '2', 'done']);
    expect(exitCode).toBe(1);
    expect(stderr).toContain('Legacy format detected');

    const after = readFileSync(planPath, 'utf-8');
    expect(after).toBe(legacyMd);
  });
});

function writeFeature(root: string, rows: string[], spec: string | null = 'Draft'): { planPath: string; specPath: string } {
  const dir = makeTmp();
  const planPath = join(dir, 'plan.md');
  const specPath = join(dir, 'spec.md');
  const table = rows.map((status, index) => `| 0${index + 1} | [phase-0${index + 1}-sample](phase-0${index + 1}-sample.md) | ${status} | — | — |`);
  writeFileSync(planPath, ['---', 'title: "Sample plan"', `status: ${root}`, '---', '', '## Phases', '',
    '| # | File | Status | Blocks | BlockedBy |', '|---|------|--------|--------|-----------|', ...table, ''].join('\n'));
  if (spec !== null) writeFileSync(specPath, `---\nfeature: sample\nstatus: ${spec}\n---\n# Spec\n`);
  return { planPath, specPath };
}

describe('update-phase-status lifecycle sync', () => {
  it('serial transitions move plan root and spec through in_progress to done', async () => {
    const { planPath, specPath } = writeFeature('planned', ['todo', 'todo'], 'planned');

    let out = await runCli([planPath, '1', 'in_progress']);
    expect(out.stdout).toBe('✓ phase 01 → in_progress\n✓ status → in_progress (plan, spec)\n');
    expect(readFileSync(specPath, 'utf-8')).toContain('status: in_progress\n');

    out = await runCli([planPath, '1', 'done']);
    expect(out.stdout).toBe('✓ phase 01 → done\n');
    expect(readFileSync(planPath, 'utf-8')).toContain('status: in_progress\n');

    out = await runCli([planPath, '2', 'done']);
    expect(out.exitCode).toBe(0);
    expect(out.stdout).toBe('✓ phase 02 → done\n✓ status → done (plan, spec)\n');
    expect(readFileSync(planPath, 'utf-8')).toContain('status: done\n');
    expect(readFileSync(specPath, 'utf-8')).toContain('status: done\n');
  });

  it('--reconcile-root moves a done plan with an appended todo row back to in_progress', async () => {
    const { planPath, specPath } = writeFeature('done', ['done', 'todo'], 'done');
    const out = await runCli(['--reconcile-root', planPath]);
    expect(out.exitCode).toBe(0);
    expect(out.stdout).toBe('✓ status → in_progress (plan, spec)\n');
    expect(readFileSync(planPath, 'utf-8')).toContain('status: in_progress\n');
    expect(readFileSync(specPath, 'utf-8')).toContain('status: in_progress\n');
  });

  it('--reconcile-root fixes a legacy finished plan, then is a no-op', async () => {
    const { planPath, specPath } = writeFeature('todo', ['done', 'done'], 'Draft');
    const first = await runCli(['--reconcile-root', planPath]);
    expect(first.stdout).toBe('✓ status → done (plan, spec)\n');
    expect(readFileSync(planPath, 'utf-8')).toContain('status: done\n');
    expect(readFileSync(specPath, 'utf-8')).toContain('status: done\n');

    const planBytes = readFileSync(planPath, 'utf-8'); const specBytes = readFileSync(specPath, 'utf-8');
    const second = await runCli(['--reconcile-root', planPath]);
    expect(second.stdout).toBe('— status already done\n');
    expect(readFileSync(planPath, 'utf-8')).toBe(planBytes);
    expect(readFileSync(specPath, 'utf-8')).toBe(specBytes);
  });

  it('--reconcile-root aligns a drifted spec when the plan root is already correct', async () => {
    const { planPath, specPath } = writeFeature('done', ['done'], 'Draft');
    const out = await runCli(['--reconcile-root', planPath]);
    expect(out.stdout).toBe('✓ status → done (spec)\n');
    expect(readFileSync(specPath, 'utf-8')).toContain('status: done\n');
  });

  it('refuses phase updates and reconcile on an archived plan without writing', async () => {
    const { planPath, specPath } = writeFeature('archived', ['done'], 'archived');
    const planBytes = readFileSync(planPath, 'utf-8'); const specBytes = readFileSync(specPath, 'utf-8');
    for (const args of [[planPath, '1', 'todo'], ['--reconcile-root', planPath]]) {
      const out = await runCli(args);
      expect(out.exitCode).toBe(1);
      expect(out.stderr).toContain('✗ plan is archived');
    }
    expect(readFileSync(planPath, 'utf-8')).toBe(planBytes);
    expect(readFileSync(specPath, 'utf-8')).toBe(specBytes);
  });

  it('warns when spec.md is missing and still writes the plan', async () => {
    const { planPath } = writeFeature('planned', ['todo'], null);
    const out = await runCli([planPath, '1', 'in_progress']);
    expect(out.exitCode).toBe(0);
    expect(out.stderr).toContain('spec.md not found');
    expect(out.stdout).toBe('✓ phase 01 → in_progress\n✓ status → in_progress (plan)\n');
    expect(readFileSync(planPath, 'utf-8')).toContain('status: in_progress\n');
  });

  it('leaves spec untouched when the plan has no root status key', async () => {
    const { planPath, specPath } = writeFeature('done', ['done'], 'Draft');
    writeFileSync(planPath, readFileSync(planPath, 'utf-8').replace('status: done\n', ''));
    const planBytes = readFileSync(planPath, 'utf-8'); const specBytes = readFileSync(specPath, 'utf-8');
    const out = await runCli(['--reconcile-root', planPath]);
    expect(out.exitCode).toBe(0);
    expect(out.stderr).toContain('has no frontmatter status: key');
    expect(out.stdout).toBe('— status already done\n');
    expect(readFileSync(planPath, 'utf-8')).toBe(planBytes);
    expect(readFileSync(specPath, 'utf-8')).toBe(specBytes);
  });

  it('rejects --reconcile-root mixed with positional arguments', async () => {
    const { planPath } = writeFeature('planned', ['todo']);
    expect((await runCli(['--reconcile-root', planPath, '1'])).exitCode).toBe(1);
    expect((await runCli([planPath, '1', '--reconcile-root'])).exitCode).toBe(1);
  });
});
