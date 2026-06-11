import { describe, it, expect } from 'bun:test';
import { runPythonVenv } from '../../src/commands/setup/steps/python-venv';
import type { CommandRunner, SetupOptions, SetupContext } from '../../src/commands/setup/types';

function makeOpts(overrides?: Partial<SetupOptions>): SetupOptions {
  return { skipVenv: false, skipConfig: false, skipPlugins: false, force: false, ...overrides };
}

function makeCtx(overrides?: Partial<SetupContext>): SetupContext {
  return { projectRoot: '/fake/root', os: 'linux', arch: 'amd64', venvPath: '/fake/root/.venv', ...overrides };
}

function mockRunner(responses: Record<string, { stdout: string; exitCode: number }>): CommandRunner {
  return makeMockRunner(responses);
}

function makeMockRunner(responses: Record<string, { stdout: string; exitCode: number }>): CommandRunner & { calls: string[] } {
  const calls: string[] = [];
  return {
    calls,
    async run(cmd, args) {
      const key = [cmd, ...args].join(' ');
      calls.push(key);
      for (const [pattern, resp] of Object.entries(responses)) {
        if (key.includes(pattern)) return resp;
      }
      return { stdout: '', exitCode: 1 };
    },
  };
}

describe('python-venv step', () => {
  it('--skip-venv → skipped', async () => {
    const runner = mockRunner({});
    const result = await runPythonVenv(makeOpts({ skipVenv: true }), makeCtx(), runner);
    expect(result.status).toBe('skipped');
  });

  it('existing venv + working imports → pass (smart re-run)', async () => {
    const runner = mockRunner({
      'import requests': { stdout: '', exitCode: 0 },
    });
    const ctx = makeCtx();
    // Simulate venv python exists via runner detecting it
    const result = await runPythonVenv(makeOpts(), ctx, runner, {
      venvPythonExists: true,
    });
    expect(result.status).toBe('pass');
  });

  it('--force ignores existing venv, runs setup script', async () => {
    const runner = mockRunner({
      'import requests': { stdout: '', exitCode: 0 },
      'setup-python-venv.sh': { stdout: 'installed', exitCode: 0 },
    });
    const result = await runPythonVenv(makeOpts({ force: true }), makeCtx(), runner, {
      venvPythonExists: true,
      setupScriptExists: true,
    });
    expect(result.status).toBe('pass');
  });

  it('missing venv + setup script exists → runs script', async () => {
    const runner = mockRunner({
      'setup-python-venv.sh': { stdout: 'installed', exitCode: 0 },
    });
    const result = await runPythonVenv(makeOpts(), makeCtx(), runner, {
      venvPythonExists: false,
      setupScriptExists: true,
    });
    expect(result.status).toBe('pass');
    expect((runner as { calls: string[] }).calls.some((call) =>
      call.includes('/.specify/scripts/bash/setup-python-venv.sh'))
    ).toBe(true);
  });

  it('missing venv + no setup script → fail', async () => {
    const runner = mockRunner({});
    const result = await runPythonVenv(makeOpts(), makeCtx(), runner, {
      venvPythonExists: false,
      setupScriptExists: false,
    });
    expect(result.status).toBe('fail');
  });

  it('setup script fails → fail', async () => {
    const runner = mockRunner({
      'setup-python-venv.sh': { stdout: '', exitCode: 1 },
    });
    const result = await runPythonVenv(makeOpts(), makeCtx(), runner, {
      venvPythonExists: false,
      setupScriptExists: true,
    });
    expect(result.status).toBe('fail');
  });
});
