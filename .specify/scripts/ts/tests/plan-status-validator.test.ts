import { afterAll, describe, it, expect } from 'bun:test';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const CLI = join(import.meta.dir, '../src/commands/util/plan-status-validator.ts');
const FIXTURES = join(import.meta.dir, 'fixtures');

async function runCli(args: string[]): Promise<{ stdout: string; stderr: string; exitCode: number }> {
  const proc = Bun.spawn(['bun', CLI, ...args], { stdout: 'pipe', stderr: 'pipe' });
  const [stdout, stderr] = await Promise.all([
    new Response(proc.stdout).text(),
    new Response(proc.stderr).text(),
  ]);
  const exitCode = await proc.exited;
  return { stdout, stderr, exitCode };
}

describe('plan-status-validator CLI', () => {
  it('no args -> exit 2 + usage', async () => {
    const { exitCode, stderr } = await runCli([]);
    expect(exitCode).toBe(2);
    expect(stderr).toContain('Usage:');
  });

  it('valid plan --json -> exit 0 + ok true', async () => {
    const { exitCode, stdout } = await runCli([join(FIXTURES, 'plan-canonical.md'), '--json']);
    expect(exitCode).toBe(0);
    const result = JSON.parse(stdout);
    expect(result.ok).toBe(true);
    expect(result.errors).toHaveLength(0);
    expect(result.invalidStatuses).toHaveLength(0);
    expect(stdout).toBe(`${JSON.stringify(result)}\n`);
  });

  it('not-started status -> exit 1 + parser error and invalid status', async () => {
    const { exitCode, stdout } = await runCli([join(FIXTURES, 'plan-not-started-status.md'), '--json']);
    expect(exitCode).toBe(1);
    const result = JSON.parse(stdout);
    expect(result.ok).toBe(false);
    expect(result.errors[0].message).toContain("unknown status 'not-started'");
    expect(result.invalidStatuses[0]).toMatchObject({
      phaseNumber: 1,
      raw: 'not-started',
    });
    expect(result.invalidStatuses[0].expected).toContain('todo');
    expect(stdout).toBe(`${JSON.stringify(result)}\n`);
  });

  it('pending legacy alias -> exit 1 even though parser accepts it', async () => {
    const { exitCode, stdout } = await runCli([join(FIXTURES, 'plan-pending-status.md'), '--json']);
    expect(exitCode).toBe(1);
    const result = JSON.parse(stdout);
    expect(result.ok).toBe(false);
    expect(result.errors).toHaveLength(0);
    expect(result.invalidStatuses[0]).toMatchObject({
      phaseNumber: 1,
      raw: 'pending',
    });
    expect(stdout).toBe(`${JSON.stringify(result)}\n`);
  });
});

describe('plan-status-validator lifecycle drift', () => {
  const dirs: string[] = [];
  afterAll(() => {
    for (const dir of dirs) rmSync(dir, { recursive: true, force: true });
  });

  function writeFeature(rootStatus: string | null, specStatus: string | null, rows: string[]): string {
    const dir = mkdtempSync(join(tmpdir(), 'tdk-validator-lifecycle-'));
    dirs.push(dir);
    const fm = (status: string | null) => (status === null ? '' : `---\nstatus: ${status}\n---\n\n`);
    writeFileSync(join(dir, 'spec.md'), `${fm(specStatus)}# Sample\n`);
    const body = rows.map((status, i) => `| 0${i + 1} | [phase-0${i + 1}-sample](phase-0${i + 1}-sample.md) | ${status} | — | — |`);
    writeFileSync(join(dir, 'plan.md'), [
      `${fm(rootStatus)}# Plan`, '', '## Phases', '',
      '| # | File | Status | Blocks | BlockedBy |', '|---|------|--------|--------|-----------|', ...body, '',
    ].join('\n'));
    return join(dir, 'plan.md');
  }

  it('reports mismatch for a stale root without changing ok or the exit code', async () => {
    const plan = writeFeature('planned', 'planned', ['done', 'done']);
    const { exitCode, stdout } = await runCli([plan, '--json']);
    const result = JSON.parse(stdout);
    expect(exitCode).toBe(0);
    expect(result.ok).toBe(true);
    expect(result.lifecycle).toEqual({ plan: 'planned', spec: 'planned', derived: 'done', mismatch: true });
    expect(stdout).toBe(`${JSON.stringify(result)}\n`);
  });

  it('reports no mismatch when plan and spec already match, and ignores absent keys', async () => {
    const matching = JSON.parse((await runCli([writeFeature('done', 'done', ['done']), '--json'])).stdout);
    expect(matching.lifecycle).toEqual({ plan: 'done', spec: 'done', derived: 'done', mismatch: false });

    const bare = JSON.parse((await runCli([writeFeature(null, null, ['todo']), '--json'])).stdout);
    expect(bare.lifecycle).toEqual({ plan: null, spec: null, derived: 'planned', mismatch: false });
  });

  it('treats legacy spellings by their normalized value and flags a drifted spec mirror', async () => {
    const legacy = JSON.parse((await runCli([writeFeature('todo', 'planned', ['todo']), '--json'])).stdout);
    expect(legacy.lifecycle.mismatch).toBe(false);

    const specDrift = JSON.parse((await runCli([writeFeature('done', 'draft', ['done']), '--json'])).stdout);
    expect(specDrift.lifecycle).toMatchObject({ plan: 'done', spec: 'draft', derived: 'done', mismatch: true });
  });

  it('leaves derived null and mismatch false when the table has errors, and keeps exit 1', async () => {
    const { exitCode, stdout } = await runCli([join(FIXTURES, 'plan-not-started-status.md'), '--json']);
    const result = JSON.parse(stdout);
    expect(exitCode).toBe(1);
    expect(result.lifecycle).toMatchObject({ derived: null, mismatch: false });
  });

  it('prints a warning line in plain mode on mismatch and stays exit 0', async () => {
    const plan = writeFeature('planned', 'planned', ['done']);
    const { exitCode, stderr } = await runCli([plan]);
    expect(exitCode).toBe(0);
    expect(stderr).toContain('warning: lifecycle mismatch');
    expect(stderr).toContain(`--reconcile-root "${plan}")`);
  });
});
