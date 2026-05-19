import { describe, it, expect } from 'bun:test';
import { join } from 'node:path';

const CLI = join(import.meta.dir, '../src/commands/util/parse-phases-table.ts');
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

describe('parse-phases-table CLI', () => {
  it('no args → exit 1 + usage on stderr', async () => {
    const { exitCode, stderr } = await runCli([]);
    expect(exitCode).toBe(1);
    expect(stderr).toContain('Usage:');
  });

  it('valid plan → exit 0 + human-readable output', async () => {
    const { exitCode, stdout } = await runCli([join(FIXTURES, 'plan-canonical.md')]);
    expect(exitCode).toBe(0);
    expect(stdout).toContain('Phase 01: done');
    expect(stdout).toContain('Phase 02: in_progress');
    expect(stdout).toContain('Phase 03: todo');
  });

  it('valid plan --json → exit 0 + valid JSON with phases array', async () => {
    const { exitCode, stdout } = await runCli([join(FIXTURES, 'plan-canonical.md'), '--json']);
    expect(exitCode).toBe(0);
    const result = JSON.parse(stdout);
    expect(result.phases).toHaveLength(3);
    expect(result.errors).toHaveLength(0);
    expect(result.phases[0].status).toBe('done');
  });

  it('missing file → exit 1 + error on stderr', async () => {
    const { exitCode, stderr } = await runCli(['/tmp/nonexistent-plan-xyz.md']);
    expect(exitCode).toBe(1);
    expect(stderr).toContain('cannot read');
  });

  it('plan without ## Phases section → exit 1 + error', async () => {
    const { exitCode, stderr } = await runCli([join(FIXTURES, 'plan-missing-phases-section.md')]);
    expect(exitCode).toBe(1);
    expect(stderr).toContain('## Phases section not found');
  });

  it('plan with parse errors → exit 1 + errors in output', async () => {
    const { exitCode, stderr } = await runCli([join(FIXTURES, 'plan-invalid-status-vocab.md')]);
    expect(exitCode).toBe(1);
    expect(stderr).toContain('error line');
  });
});
