import { describe, it, expect } from 'bun:test';
import { runTsDeps } from '../../src/commands/setup/steps/ts-deps';
import type { CommandRunner, SetupOptions, SetupContext } from '../../src/commands/setup/types';

function makeOpts(overrides?: Partial<SetupOptions>): SetupOptions {
  return { skipVenv: false, skipConfig: false, skipPlugins: false, force: false, ...overrides };
}

function makeCtx(overrides?: Partial<SetupContext>): SetupContext {
  return { projectRoot: '/fake/root', os: 'linux', arch: 'amd64', venvPath: '/fake/root/.venv', ...overrides };
}

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

describe('ts-deps step', () => {
  it('node_modules exists + not force → pass (skip)', async () => {
    const runner = mockRunner({});
    const result = await runTsDeps(makeOpts(), makeCtx(), runner, {
      nodeModulesExists: true,
      packageJsonExists: true,
    });
    expect(result.status).toBe('pass');
  });

  it('missing node_modules → runs bun install → pass', async () => {
    const runner = mockRunner({
      'bun install': { stdout: 'installed', exitCode: 0 },
    });
    const result = await runTsDeps(makeOpts(), makeCtx(), runner, {
      nodeModulesExists: false,
      packageJsonExists: true,
    });
    expect(result.status).toBe('pass');
  });

  it('--force → runs bun install even with node_modules', async () => {
    const runner = mockRunner({
      'bun install': { stdout: 'installed', exitCode: 0 },
    });
    const result = await runTsDeps(makeOpts({ force: true }), makeCtx(), runner, {
      nodeModulesExists: true,
      packageJsonExists: true,
    });
    expect(result.status).toBe('pass');
    expect(result.message).toContain('bun install');
  });

  it('missing package.json → skipped', async () => {
    const runner = mockRunner({});
    const result = await runTsDeps(makeOpts(), makeCtx(), runner, {
      nodeModulesExists: false,
      packageJsonExists: false,
    });
    expect(result.status).toBe('skipped');
  });

  it('bun install fails → fail', async () => {
    const runner = mockRunner({
      'bun install': { stdout: '', exitCode: 1 },
    });
    const result = await runTsDeps(makeOpts(), makeCtx(), runner, {
      nodeModulesExists: false,
      packageJsonExists: true,
    });
    expect(result.status).toBe('fail');
  });
});
