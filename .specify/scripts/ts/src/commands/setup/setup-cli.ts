import type { SetupOptions, SetupContext, CommandRunner, StepResult } from './types';
import { runPythonVenv } from './steps/python-venv';
import type { PythonVenvResult } from './steps/python-venv';
import { runTsDeps } from './steps/ts-deps';
import { runConfigMigrate } from './steps/config-migrate';
import { runConfigDetect } from './steps/config-detect';
import { runPythonImports } from './steps/python-imports';
import { runPluginRegister } from './steps/plugin-register';

export interface StepEntry {
  label: string;
  result: StepResult;
}

export interface OrchestratorOverrides {
  venvPythonExists?: boolean;
  setupScriptExists?: boolean;
  nodeModulesExists?: boolean;
  packageJsonExists?: boolean;
  yamlExists?: boolean;
  jsonExists?: boolean;
  detectScriptExists?: boolean;
  claudeAvailable?: boolean;
}

export function parseSetupArgs(argv: string[]): SetupOptions {
  return {
    skipVenv: argv.includes('--skip-venv'),
    skipConfig: argv.includes('--skip-config'),
    skipPlugins: argv.includes('--skip-plugins'),
    force: argv.includes('--force'),
  };
}

export async function runSetupSteps(
  opts: SetupOptions,
  ctx: SetupContext,
  runner: CommandRunner,
  overrides?: OrchestratorOverrides,
): Promise<StepEntry[]> {
  const results: StepEntry[] = [];

  const venvResult: PythonVenvResult = await runPythonVenv(opts, ctx, runner, {
    venvPythonExists: overrides?.venvPythonExists,
    setupScriptExists: overrides?.setupScriptExists,
  });
  results.push({ label: 'Step 2 — Python venv:       ', result: venvResult });

  // Smart re-run: if venv pass returned a resolved path, imports were already verified
  const importsAlreadyVerified = !!venvResult.resolvedPythonPath
    && venvResult.status === 'pass'
    && !opts.force;

  const tsResult = await runTsDeps(opts, ctx, runner, {
    nodeModulesExists: overrides?.nodeModulesExists,
    packageJsonExists: overrides?.packageJsonExists,
  });
  results.push({ label: 'Step 2b — TS deps:          ', result: tsResult });

  const migrateResult = await runConfigMigrate(opts, ctx, runner, {
    yamlExists: overrides?.yamlExists,
    jsonExists: overrides?.jsonExists,
  });
  results.push({ label: 'Step 2c — Config migration:  ', result: migrateResult });

  const detectResult = await runConfigDetect(opts, ctx, runner, {
    detectScriptExists: overrides?.detectScriptExists,
  });
  results.push({ label: 'Step 3 — Config detection:   ', result: detectResult });

  const importsResult = await runPythonImports(runner, {
    venvPythonPath: venvResult.resolvedPythonPath ?? '',
    venvStepStatus: venvResult.status,
    importsAlreadyVerified,
  });
  results.push({ label: 'Step 4 — Python imports:     ', result: importsResult });

  const pluginResult = await runPluginRegister(opts, runner, {
    claudeAvailable: overrides?.claudeAvailable ?? false,
  });
  results.push({ label: 'Step 5 — Plugin marketplaces:', result: pluginResult });

  return results;
}
