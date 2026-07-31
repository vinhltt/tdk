import type { StepResult, SetupOptions, CommandRunner } from '../types';

export interface PluginRegisterOverrides {
  claudeAvailable: boolean;
}

export async function runPluginRegister(
  opts: SetupOptions,
  runner: CommandRunner,
  overrides: PluginRegisterOverrides,
): Promise<StepResult> {
  if (opts.skipPlugins) return { status: 'skipped', message: 'Skipped (--skip-plugins)' };

  if (!overrides.claudeAvailable) {
    return { status: 'skipped', message: 'claude CLI not found — see manual steps' };
  }

  const { exitCode } = await runner.run('claude', ['plugin', 'marketplace', 'add', 'https://github.com/upstash/context7']);

  const { exitCode: repomixExitCode } = await runner.run('claude', ['plugin', 'marketplace', 'add', 'https://github.com/yamadashy/repomix']);

  if (exitCode === 0) {
    if (repomixExitCode !== 0) {
      return {
        status: 'pass',
        message: `Context7 marketplace registered; repomix marketplace add failed (exit code ${repomixExitCode}) — see manual steps`,
      };
    }
    return { status: 'pass', message: 'Context7 marketplace registered' };
  }
  return { status: 'fail', message: `Plugin registration failed (exit code ${exitCode})` };
}
