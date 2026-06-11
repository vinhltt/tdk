import { existsSync } from 'node:fs';
import type { StepResult, SetupOptions, SetupContext, CommandRunner } from '../types';

export interface PythonVenvOverrides {
  venvPythonExists?: boolean;
  setupScriptExists?: boolean;
}

export interface PythonVenvResult extends StepResult {
  resolvedPythonPath?: string;
}

export async function runPythonVenv(
  opts: SetupOptions,
  ctx: SetupContext,
  runner: CommandRunner,
  overrides?: PythonVenvOverrides,
): Promise<PythonVenvResult> {
  if (opts.skipVenv) return { status: 'skipped', message: 'Skipped (--skip-venv)' };

  const resolvedPath = overrides?.venvPythonExists !== undefined
    ? (overrides.venvPythonExists ? `${ctx.venvPath}/bin/python` : undefined)
    : (detectVenvPythonSync(ctx.venvPath) ?? await detectVenvPython(ctx.venvPath, runner));

  if (!opts.force && resolvedPath) {
    const imports = await checkImports(resolvedPath, runner);
    if (imports) return { status: 'pass', message: 'Already installed (venv exists, imports OK)', resolvedPythonPath: resolvedPath };
  }

  const setupScriptPath = `${ctx.projectRoot}/.specify/scripts/bash/setup-python-venv.sh`;
  const setupScriptExists = overrides?.setupScriptExists
    ?? existsSync(setupScriptPath);

  if (!setupScriptExists) return { status: 'fail', message: 'setup-python-venv.sh not found' };

  const { exitCode } = await runner.run('bash', [
    setupScriptPath,
  ]);

  if (exitCode === 0) {
    const newPath = detectVenvPythonSync(ctx.venvPath);
    return { status: 'pass', message: 'Python venv created', resolvedPythonPath: newPath ?? undefined };
  }

  return { status: 'fail', message: 'venv setup failed' };
}

const VENV_PYTHON_SUFFIXES = ['bin/python', 'Scripts/python.exe'];

function detectVenvPythonSync(venvPath: string): string | undefined {
  for (const suffix of VENV_PYTHON_SUFFIXES) {
    const full = `${venvPath}/${suffix}`;
    if (existsSync(full)) return full;
  }
  return undefined;
}

async function detectVenvPython(venvPath: string, runner: CommandRunner): Promise<string | undefined> {
  for (const suffix of VENV_PYTHON_SUFFIXES) {
    const full = `${venvPath}/${suffix}`;
    const { exitCode } = await runner.run('test', ['-f', full]);
    if (exitCode === 0) return full;
  }
  return undefined;
}

async function checkImports(pythonPath: string, runner: CommandRunner): Promise<boolean> {
  const { exitCode } = await runner.run(pythonPath, ['-c', 'import requests, dotenv, yaml, git']);
  return exitCode === 0;
}
