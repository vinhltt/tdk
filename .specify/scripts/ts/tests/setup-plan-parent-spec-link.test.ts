import { afterEach, describe, expect, it } from 'bun:test';
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';

const CLI = resolve(import.meta.dir, '../src/commands/util/setup-plan.ts');

// Helper: spawn CLI with CLAUDE_PROJECT_DIR pointed at a temp repo root
async function runCli(
  taskId: string,
  tmpDir: string,
): Promise<{ stdout: string; stderr: string; exitCode: number }> {
  const proc = Bun.spawn(['bun', CLI, taskId], {
    stdout: 'pipe',
    stderr: 'pipe',
    env: { ...process.env, CLAUDE_PROJECT_DIR: tmpDir },
  });
  const [stdout, stderr, exitCode] = await Promise.all([
    new Response(proc.stdout).text(),
    new Response(proc.stderr).text(),
    proc.exited,
  ]);
  return { stdout, stderr, exitCode };
}

// Helper: create a spec.md with YAML frontmatter in the default 'feature' folder
function writeSpecWithFrontmatter(tmpDir: string, taskId: string, frontmatter: Record<string, string>): void {
  const specDir = join(tmpDir, '.specify', 'feature', taskId);
  mkdirSync(specDir, { recursive: true });
  const lines = ['---'];
  for (const [key, val] of Object.entries(frontmatter)) {
    lines.push(`${key}: "${val}"`);
  }
  lines.push('---', `# Feature Specification: ${taskId}`);
  writeFileSync(join(specDir, 'spec.md'), lines.join('\n'), 'utf-8');
}

describe('setup-plan parent_spec link-integrity check', () => {
  let tmpDir: string;

  afterEach(() => {
    if (tmpDir) rmSync(tmpDir, { recursive: true, force: true });
  });

  it('valid parent passes — exitCode 0 and no ERROR: parent_spec in stderr', async () => {
    tmpDir = mkdtempSync(join(tmpdir(), 'setup-plan-test-'));

    // Create parent spec in default folder
    const parentDir = join(tmpDir, '.specify', 'feature', 'feat-100');
    mkdirSync(parentDir, { recursive: true });
    writeFileSync(join(parentDir, 'spec.md'), '# Feature Specification: feat-100\n', 'utf-8');

    // Create child spec with parent_spec pointing to feat-100
    writeSpecWithFrontmatter(tmpDir, 'feat-200', { title: 'Child', parent_spec: 'feat-100' });

    const { exitCode, stderr } = await runCli('feat-200', tmpDir);
    expect(exitCode).toBe(0);
    expect(stderr).not.toContain('ERROR: parent_spec');
  });

  it('missing parent STOPs — exitCode 1 and stderr contains ERROR: parent_spec', async () => {
    tmpDir = mkdtempSync(join(tmpdir(), 'setup-plan-test-'));

    // Child points to feat-999 which does not exist
    writeSpecWithFrontmatter(tmpDir, 'feat-200', { title: 'Child', parent_spec: 'feat-999' });

    const { exitCode, stderr } = await runCli('feat-200', tmpDir);
    expect(exitCode).toBe(1);
    expect(stderr).toContain("ERROR: parent_spec 'feat-999' not found");
  });

  it('no parent_spec is a no-op — exitCode 0 and no ERROR: parent_spec in stderr', async () => {
    tmpDir = mkdtempSync(join(tmpdir(), 'setup-plan-test-'));

    // Spec has frontmatter but no parent_spec field
    writeSpecWithFrontmatter(tmpDir, 'feat-200', { title: 'Child' });

    const { exitCode, stderr } = await runCli('feat-200', tmpDir);
    expect(exitCode).toBe(0);
    expect(stderr).not.toContain('ERROR: parent_spec');
  });

  it('legacy frontmatter-less spec is a no-op — exitCode 0 and no ERROR: parent_spec in stderr', async () => {
    tmpDir = mkdtempSync(join(tmpdir(), 'setup-plan-test-'));

    // Spec has no --- block at all
    const specDir = join(tmpDir, '.specify', 'feature', 'feat-200');
    mkdirSync(specDir, { recursive: true });
    writeFileSync(join(specDir, 'spec.md'), '# Feature Specification: Legacy\n', 'utf-8');

    const { exitCode, stderr } = await runCli('feat-200', tmpDir);
    expect(exitCode).toBe(0);
    expect(stderr).not.toContain('ERROR: parent_spec');
  });

  it('non-default-category parent resolves to correct dir — exitCode 0 and no ERROR: parent_spec in stderr', async () => {
    tmpDir = mkdtempSync(join(tmpdir(), 'setup-plan-test-'));

    // Parent lives at .specify/test/aa-100/spec.md (non-default category)
    const parentDir = join(tmpDir, '.specify', 'test', 'aa-100');
    mkdirSync(parentDir, { recursive: true });
    writeFileSync(join(parentDir, 'spec.md'), '# Feature Specification: aa-100\n', 'utf-8');

    // Child uses folder-qualified id: test/aa-100
    writeSpecWithFrontmatter(tmpDir, 'feat-200', { title: 'Child', parent_spec: 'test/aa-100' });

    const { exitCode, stderr } = await runCli('feat-200', tmpDir);
    expect(exitCode).toBe(0);
    expect(stderr).not.toContain('ERROR: parent_spec');
  });
});
