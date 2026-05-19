import { describe, it, expect } from 'bun:test';
import { runConfigDetect } from '../../src/commands/setup/steps/config-detect';
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

describe('config-detect step', () => {
  it('--skip-config → skipped', async () => {
    const runner = mockRunner({});
    const result = await runConfigDetect(makeOpts({ skipConfig: true }), makeCtx(), runner);
    expect(result.status).toBe('skipped');
  });

  it('configFound: true → pass with workspace name', async () => {
    const runner = mockRunner({
      'detect-config.ts': { stdout: JSON.stringify({ configFound: true, workspaceName: 'myproject' }), exitCode: 0 },
    });
    const result = await runConfigDetect(makeOpts(), makeCtx(), runner, { detectScriptExists: true });
    expect(result.status).toBe('pass');
    expect(result.message).toContain('myproject');
  });

  it('configFound: false → fail', async () => {
    const runner = mockRunner({
      'detect-config.ts': { stdout: JSON.stringify({ configFound: false }), exitCode: 0 },
    });
    const result = await runConfigDetect(makeOpts(), makeCtx(), runner, { detectScriptExists: true });
    expect(result.status).toBe('fail');
  });

  it('detect script not found → fail', async () => {
    const runner = mockRunner({});
    const result = await runConfigDetect(makeOpts(), makeCtx(), runner, { detectScriptExists: false });
    expect(result.status).toBe('fail');
  });

  it('bun command not available → fail', async () => {
    const runner = mockRunner({});
    const result = await runConfigDetect(makeOpts(), makeCtx(), runner, {
      detectScriptExists: true,
      bunAvailable: false,
    });
    expect(result.status).toBe('fail');
  });
});
