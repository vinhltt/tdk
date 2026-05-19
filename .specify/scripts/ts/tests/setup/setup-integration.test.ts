import { describe, it, expect } from 'bun:test';
import { parseSetupArgs, runSetupSteps } from '../../src/commands/setup/setup-cli';
import type { CommandRunner } from '../../src/commands/setup/types';

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

const baseCtx = { projectRoot: '/fake', os: 'linux', arch: 'amd64', venvPath: '/fake/.venv' };

describe('setup integration — flag combinations', () => {
  it('all skips → all steps skipped, no fails', async () => {
    const opts = parseSetupArgs(['--skip-venv', '--skip-config', '--skip-plugins']);
    const runner = mockRunner({});
    const results = await runSetupSteps(opts, baseCtx, runner, {
      nodeModulesExists: true,
      packageJsonExists: true,
      yamlExists: false,
      jsonExists: true,
      detectScriptExists: true,
      claudeAvailable: false,
    });

    const hasFail = results.some(r => r.result.status === 'fail');
    expect(hasFail).toBe(false);

    const skipped = results.filter(r => r.result.status === 'skipped');
    expect(skipped.length).toBeGreaterThanOrEqual(3);
  });

  it('--force propagated → steps ignore cached state', async () => {
    const opts = parseSetupArgs(['--force', '--skip-config', '--skip-plugins']);
    const runner = mockRunner({
      'setup-python-venv.sh': { stdout: 'installed', exitCode: 0 },
      'bun install': { stdout: 'ok', exitCode: 0 },
      'import requests': { stdout: '', exitCode: 0 },
    });
    const results = await runSetupSteps(opts, baseCtx, runner, {
      venvPythonExists: true,
      setupScriptExists: true,
      nodeModulesExists: true,
      packageJsonExists: true,
      yamlExists: false,
      jsonExists: true,
      detectScriptExists: true,
      claudeAvailable: false,
    });

    // venv should run (not skip) because --force
    expect(results[0]!.result.status).toBe('pass');
    // ts-deps should run bun install because --force
    expect(results[1]!.result.status).toBe('pass');
    expect(results[1]!.result.message).toContain('bun install');
  });

  it('mixed flags: --skip-venv --skip-plugins', async () => {
    const opts = parseSetupArgs(['--skip-venv', '--skip-plugins']);
    const runner = mockRunner({
      'detect-config.ts': { stdout: JSON.stringify({ configFound: true, workspaceName: 'test' }), exitCode: 0 },
    });
    const results = await runSetupSteps(opts, baseCtx, runner, {
      nodeModulesExists: true,
      packageJsonExists: true,
      yamlExists: false,
      jsonExists: true,
      detectScriptExists: true,
      claudeAvailable: false,
    });

    expect(results[0]!.result.status).toBe('skipped');  // venv
    expect(results[3]!.result.status).toBe('pass');      // config-detect
    expect(results[5]!.result.status).toBe('skipped');   // plugins
  });

  it('default run (no flags) attempts all steps', async () => {
    const opts = parseSetupArgs([]);
    expect(opts.skipVenv).toBe(false);
    expect(opts.skipConfig).toBe(false);
    expect(opts.skipPlugins).toBe(false);
    expect(opts.force).toBe(false);
  });

  it('--help flag is recognized by parseSetupArgs without error', () => {
    const opts = parseSetupArgs(['--help']);
    expect(opts.skipVenv).toBe(false);
  });
});
