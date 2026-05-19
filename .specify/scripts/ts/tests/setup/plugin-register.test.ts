import { describe, it, expect } from 'bun:test';
import { runPluginRegister } from '../../src/commands/setup/steps/plugin-register';
import type { CommandRunner, SetupOptions, SetupContext } from '../../src/commands/setup/types';

function makeOpts(overrides?: Partial<SetupOptions>): SetupOptions {
  return { skipVenv: false, skipConfig: false, skipPlugins: false, force: false, ...overrides };
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

describe('plugin-register step', () => {
  it('--skip-plugins → skipped', async () => {
    const runner = mockRunner({});
    const result = await runPluginRegister(makeOpts({ skipPlugins: true }), runner, { claudeAvailable: true });
    expect(result.status).toBe('skipped');
  });

  it('claude CLI found → registers marketplace → pass', async () => {
    const runner = mockRunner({
      'claude plugin marketplace add': { stdout: 'registered', exitCode: 0 },
    });
    const result = await runPluginRegister(makeOpts(), runner, { claudeAvailable: true });
    expect(result.status).toBe('pass');
  });

  it('claude CLI not found → skipped', async () => {
    const runner = mockRunner({});
    const result = await runPluginRegister(makeOpts(), runner, { claudeAvailable: false });
    expect(result.status).toBe('skipped');
  });

  it('registration fails → returns fail with exit code', async () => {
    const runner = mockRunner({
      'claude plugin marketplace add': { stdout: '', exitCode: 1 },
    });
    const result = await runPluginRegister(makeOpts(), runner, { claudeAvailable: true });
    expect(result.status).toBe('fail');
    expect(result.message).toContain('exit code 1');
  });
});
