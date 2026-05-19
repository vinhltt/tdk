import { describe, it, expect } from 'bun:test';
import { runPythonImports } from '../../src/commands/setup/steps/python-imports';
import type { CommandRunner, StepResult } from '../../src/commands/setup/types';

function mockRunner(responses: Record<string, { stdout: string; exitCode: number }>): CommandRunner {
  return {
    async run(cmd, args) {
      const key = [cmd, ...args].join(' ');
      for (const [pattern, resp] of Object.entries(responses)) {
        if (key.includes(pattern)) return resp;
      }
      return { stdout: '', exitCode: 1 };
    },
  };
}

describe('python-imports step', () => {
  it('imports succeed → pass', async () => {
    const runner = mockRunner({
      'import requests': { stdout: '', exitCode: 0 },
    });
    const result = await runPythonImports(runner, {
      venvPythonPath: '/fake/.venv/bin/python',
      venvStepStatus: 'pass',
      importsAlreadyVerified: false,
    });
    expect(result.status).toBe('pass');
  });

  it('imports already verified from venv step → pass (skip re-check)', async () => {
    const runner = mockRunner({});
    const result = await runPythonImports(runner, {
      venvPythonPath: '/fake/.venv/bin/python',
      venvStepStatus: 'pass',
      importsAlreadyVerified: true,
    });
    expect(result.status).toBe('pass');
    expect(result.message).toContain('Already verified');
  });

  it('venv step failed → skipped', async () => {
    const runner = mockRunner({});
    const result = await runPythonImports(runner, {
      venvPythonPath: '',
      venvStepStatus: 'fail',
      importsAlreadyVerified: false,
    });
    expect(result.status).toBe('skipped');
  });

  it('venv skipped + no venv python → skipped', async () => {
    const runner = mockRunner({});
    const result = await runPythonImports(runner, {
      venvPythonPath: '',
      venvStepStatus: 'skipped',
      importsAlreadyVerified: false,
    });
    expect(result.status).toBe('skipped');
  });

  it('imports fail → fail', async () => {
    const runner = mockRunner({
      'import requests': { stdout: 'ModuleNotFoundError', exitCode: 1 },
    });
    const result = await runPythonImports(runner, {
      venvPythonPath: '/fake/.venv/bin/python',
      venvStepStatus: 'pass',
      importsAlreadyVerified: false,
    });
    expect(result.status).toBe('fail');
  });
});
