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
