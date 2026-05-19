import type { CommandRunner } from '../types';

export const defaultRunner: CommandRunner = {
  async run(cmd, args, opts) {
    const proc = Bun.spawn([cmd, ...args], {
      cwd: opts?.cwd,
      stdout: 'pipe',
      stderr: 'inherit',
    });
    const stdout = await new Response(proc.stdout).text();
    const exitCode = await proc.exited;
    return { stdout: stdout.trim(), exitCode };
  },
};
