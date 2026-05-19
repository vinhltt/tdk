import { existsSync } from 'node:fs';
import type { StepResult, SetupOptions, SetupContext, CommandRunner } from '../types';

export interface TsDepsOverrides {
  nodeModulesExists?: boolean;
  packageJsonExists?: boolean;
}

export async function runTsDeps(
  opts: SetupOptions,
  ctx: SetupContext,
  runner: CommandRunner,
  overrides?: TsDepsOverrides,
): Promise<StepResult> {
  const tsDir = `${ctx.projectRoot}/.specify/scripts/ts`;

  const packageJsonExists = overrides?.packageJsonExists ?? existsSync(`${tsDir}/package.json`);
  if (!packageJsonExists) return { status: 'skipped', message: 'No TypeScript project found (package.json missing)' };

  const nodeModulesExists = overrides?.nodeModulesExists ?? existsSync(`${tsDir}/node_modules`);
  if (!opts.force && nodeModulesExists) return { status: 'pass', message: 'Already installed (node_modules exists)' };

  const { exitCode } = await runner.run('bun', ['install', '--no-save'], { cwd: tsDir });
  if (exitCode === 0) return { status: 'pass', message: 'bun install completed' };

  const fallback = await runner.run('bun', ['install', '--frozen-lockfile'], { cwd: tsDir });
  if (fallback.exitCode === 0) return { status: 'pass', message: 'bun install completed (frozen lockfile)' };

  return { status: 'fail', message: 'bun install failed' };
}

