import { describe, it, expect } from 'bun:test';
import { parseSetupArgs, runSetupSteps } from '../../src/commands/setup/setup-cli';
import type { CommandRunner, StepResult } from '../../src/commands/setup/types';

function mockRunner(responses: Record<string, { stdout: string; exitCode: number }>): CommandRunner {
  return {
    async run(cmd, args) {
      const key = [cmd, ...args].join(' ');
      for (const [pattern, resp] of Object.entries(responses)) {
        if (key.includes(pattern)) return resp;
      }
      return { stdout: '', exitCode: 0 };
    },
  };
}

describe('setup CLI arg parsing', () => {
  it('parses --skip-venv', () => {
    const opts = parseSetupArgs(['--skip-venv']);
    expect(opts.skipVenv).toBe(true);
    expect(opts.skipConfig).toBe(false);
  });

  it('parses --skip-config', () => {
    const opts = parseSetupArgs(['--skip-config']);
    expect(opts.skipConfig).toBe(true);
  });

  it('parses --skip-plugins', () => {
    const opts = parseSetupArgs(['--skip-plugins']);
    expect(opts.skipPlugins).toBe(true);
  });

  it('parses --force', () => {
    const opts = parseSetupArgs(['--force']);
    expect(opts.force).toBe(true);
  });

  it('parses combined flags', () => {
    const opts = parseSetupArgs(['--skip-venv', '--skip-plugins', '--force']);
    expect(opts.skipVenv).toBe(true);
    expect(opts.skipPlugins).toBe(true);
    expect(opts.force).toBe(true);
    expect(opts.skipConfig).toBe(false);
  });

  it('defaults all false with no args', () => {
    const opts = parseSetupArgs([]);
    expect(opts.skipVenv).toBe(false);
    expect(opts.skipConfig).toBe(false);
    expect(opts.skipPlugins).toBe(false);
    expect(opts.force).toBe(false);
  });
});

describe('setup step orchestration', () => {
  it('runs steps in order, returns results', async () => {
    const runner = mockRunner({
      'import requests': { stdout: '', exitCode: 0 },
      'detect-config.ts': { stdout: JSON.stringify({ configFound: true, workspaceName: 'test' }), exitCode: 0 },
    });

    const results = await runSetupSteps(
      { skipVenv: true, skipConfig: true, skipPlugins: true, force: false },
      { projectRoot: '/fake', os: 'linux', arch: 'amd64', venvPath: '/fake/.venv' },
      runner,
      {
        venvPythonExists: false,
        setupScriptExists: false,
        nodeModulesExists: true,
        packageJsonExists: true,
        yamlExists: false,
        jsonExists: true,
        detectScriptExists: true,
        claudeAvailable: false,
      },
    );

    expect(results.length).toBe(6);
    expect(results[0]!.result.status).toBe('skipped');  // venv
    expect(results[1]!.result.status).toBe('pass');     // ts-deps
    expect(results[2]!.result.status).toBe('skipped');  // config-migrate
    expect(results[3]!.result.status).toBe('skipped');  // config-detect
    expect(results[4]!.result.status).toBe('skipped');  // python-imports
    expect(results[5]!.result.status).toBe('skipped');  // plugins
  });

  it('exit code 1 if any step fails', async () => {
    const runner = mockRunner({});
    const results = await runSetupSteps(
      { skipVenv: false, skipConfig: false, skipPlugins: true, force: false },
      { projectRoot: '/fake', os: 'linux', arch: 'amd64', venvPath: '/fake/.venv' },
      runner,
      {
        venvPythonExists: false,
        setupScriptExists: false,
        nodeModulesExists: true,
        packageJsonExists: true,
        yamlExists: false,
        jsonExists: false,
        detectScriptExists: false,
        claudeAvailable: false,
      },
    );

    const hasFail = results.some(r => r.result.status === 'fail');
    expect(hasFail).toBe(true);
  });
});
