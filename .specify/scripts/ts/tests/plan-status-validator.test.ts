import { describe, it, expect } from 'bun:test';
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
