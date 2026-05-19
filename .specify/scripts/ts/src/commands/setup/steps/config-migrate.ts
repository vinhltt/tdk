import { existsSync } from 'node:fs';
import type { StepResult, SetupOptions, SetupContext, CommandRunner } from '../types';

export interface ConfigMigrateOverrides {
  yamlExists?: boolean;
  jsonExists?: boolean;
  migrateScriptExists?: boolean;
}

export async function runConfigMigrate(
  _opts: SetupOptions,
  ctx: SetupContext,
  runner: CommandRunner,
  overrides?: ConfigMigrateOverrides,
): Promise<StepResult> {
  const yamlPath = `${ctx.projectRoot}/.specify/.specify.yaml`;
  const jsonPath = `${ctx.projectRoot}/.specify/.specify.json`;
  const scriptPath = `${ctx.projectRoot}/.specify/scripts/bash/migrate-yaml-to-json.sh`;

  const yamlExists = overrides?.yamlExists ?? existsSync(yamlPath);
  const jsonExists = overrides?.jsonExists ?? existsSync(jsonPath);

  if (!yamlExists) return { status: 'skipped', message: 'No .specify.yaml found' };
  if (jsonExists) return { status: 'pass', message: '.specify.json already exists' };

  const scriptExists = overrides?.migrateScriptExists ?? existsSync(scriptPath);
  if (!scriptExists) return { status: 'fail', message: 'migrate-yaml-to-json.sh not found' };

  const { exitCode } = await runner.run('bash', [scriptPath, yamlPath]);
  if (exitCode === 0) return { status: 'pass', message: 'Migrated to .specify.json' };

  return { status: 'fail', message: 'Migration failed' };
}
