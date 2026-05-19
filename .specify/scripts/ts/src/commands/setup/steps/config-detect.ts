import { existsSync } from 'node:fs';
import type { StepResult, SetupOptions, SetupContext, CommandRunner } from '../types';

export interface ConfigDetectOverrides {
  detectScriptExists?: boolean;
  bunAvailable?: boolean;
}

export async function runConfigDetect(
  opts: SetupOptions,
  ctx: SetupContext,
  runner: CommandRunner,
  overrides?: ConfigDetectOverrides,
): Promise<StepResult> {
  if (opts.skipConfig) return { status: 'skipped', message: 'Skipped (--skip-config)' };

  const bunAvailable = overrides?.bunAvailable ?? true;
  if (!bunAvailable) return { status: 'fail', message: 'bun not available for config detection' };

  const detectScript = `${ctx.projectRoot}/.specify/scripts/ts/src/commands/detect-config.ts`;
  const scriptExists = overrides?.detectScriptExists ?? existsSync(detectScript);
  if (!scriptExists) return { status: 'fail', message: 'detect-config.ts not found' };

  const { stdout, exitCode } = await runner.run('bun', [detectScript]);

  if (exitCode !== 0 && !stdout) return { status: 'fail', message: 'Config detection failed' };

  try {
    const parsed = JSON.parse(stdout) as { configFound?: boolean; workspaceName?: string };
    if (parsed.configFound) {
      return { status: 'pass', message: `Config found — workspace: ${parsed.workspaceName ?? 'unknown'}` };
    }
    return { status: 'fail', message: 'Config detection failed' };
  } catch {
    return { status: 'fail', message: 'Config detection output invalid' };
  }
}
