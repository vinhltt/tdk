import type { StepResult, StepStatus, CommandRunner } from '../types';

export interface PythonImportsInput {
  venvPythonPath: string;
  venvStepStatus: StepStatus;
  importsAlreadyVerified: boolean;
}

export async function runPythonImports(
  runner: CommandRunner,
  input: PythonImportsInput,
): Promise<StepResult> {
  if (input.importsAlreadyVerified) {
    return { status: 'pass', message: 'Already verified (from venv step)' };
  }

  if (input.venvStepStatus === 'fail' || (input.venvStepStatus === 'skipped' && !input.venvPythonPath)) {
    return { status: 'skipped', message: 'Skipped — venv not available' };
  }

  if (!input.venvPythonPath) {
    return { status: 'fail', message: 'venv Python not found' };
  }

  const { exitCode } = await runner.run(input.venvPythonPath, ['-c', 'import requests, dotenv, yaml, git']);
  if (exitCode === 0) return { status: 'pass', message: 'All required packages available' };

  return { status: 'fail', message: 'Import check failed — some packages missing' };
}
