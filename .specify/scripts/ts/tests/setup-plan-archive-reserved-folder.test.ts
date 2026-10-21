import { afterEach, describe, expect, it } from 'bun:test';
import { existsSync, mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';

const CLI = resolve(import.meta.dir, '../src/commands/util/setup-plan.ts');

async function runCli(taskId: string, repo: string): Promise<{ stderr: string; exitCode: number }> {
  const proc = Bun.spawn(['bun', CLI, taskId], {
    cwd: repo,
    stdout: 'pipe',
    stderr: 'pipe',
    env: { ...process.env, CLAUDE_PROJECT_DIR: repo },
  });
  const [stderr, exitCode] = await Promise.all([new Response(proc.stderr).text(), proc.exited]);
  return { stderr, exitCode };
}

describe('setup-plan reserved archive folder', () => {
  let repo: string;

  afterEach(() => {
    if (repo) rmSync(repo, { recursive: true, force: true });
  });

  it('exits 1 and writes no plan for an archive-prefixed id', async () => {
    repo = mkdtempSync(join(tmpdir(), 'setup-plan-archive-'));
    const archived = join(repo, '.specify', 'archive', 'specs', 'sample-1');
    mkdirSync(archived, { recursive: true });
    writeFileSync(join(archived, 'spec.md'), '# spec\n', 'utf-8');

    const { exitCode, stderr } = await runCli('archive/specs/sample-1', repo);

    expect(exitCode).toBe(1);
    expect(stderr).toContain('reserved');
    expect(stderr).toContain('--allow-archived is for read-only consumers of archived specs');
    expect(existsSync(join(archived, 'plan.md'))).toBe(false);
  });

  it('still plans a non-archive prefixed id', async () => {
    repo = mkdtempSync(join(tmpdir(), 'setup-plan-archive-'));
    const { exitCode } = await runCli('specs/sample-1', repo);
    expect(exitCode).toBe(0);
    expect(existsSync(join(repo, '.specify', 'specs', 'sample-1'))).toBe(true);
  });
});
