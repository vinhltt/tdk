import { describe, expect, it } from 'bun:test';

const CLI_ENTRY = new URL('../src/index.ts', import.meta.url).pathname;

async function runCli(args: string[]): Promise<{ exitCode: number; stdout: string; stderr: string }> {
  const proc = Bun.spawn(['bun', CLI_ENTRY, ...args], {
    stdout: 'pipe',
    stderr: 'pipe',
  });
  const [stdout, stderr, exitCode] = await Promise.all([
    new Response(proc.stdout).text(),
    new Response(proc.stderr).text(),
    proc.exited,
  ]);
  return { exitCode, stdout, stderr };
}

describe('tdk-setup CLI shell', () => {
  it('prints top-level help listing the three registered subcommands', async () => {
    const { exitCode, stdout } = await runCli(['--help']);
    expect(exitCode).toBe(0);
    expect(stdout).toContain('install');
    expect(stdout).toContain('convert');
    expect(stdout).toContain('convert-flat');
  });

  it('prints install-specific help without mutating any project state', async () => {
    const { exitCode, stdout } = await runCli(['install', '--help']);
    expect(exitCode).toBe(0);
    expect(stdout).toContain('--harness <names>');
  });

  it('prints convert-specific help without mutating any project state', async () => {
    const { exitCode, stdout } = await runCli(['convert', '--help']);
    expect(exitCode).toBe(0);
    expect(stdout).toContain('--plugins <names>');
  });

  it('prints convert-flat-specific help without mutating any project state', async () => {
    const { exitCode, stdout } = await runCli(['convert-flat', '--help']);
    expect(exitCode).toBe(0);
    expect(stdout).toContain('--dry-run');
  });
});
