import { describe, it, expect } from 'bun:test';
import { runConfigMigrate } from '../../src/commands/setup/steps/config-migrate';
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

describe('config-migrate step', () => {
  it('.specify.yaml exists + no .specify.json → runs migration', async () => {
    const runner = mockRunner({
      'migrate-yaml-to-json.sh': { stdout: 'migrated', exitCode: 0 },
    });
    const result = await runConfigMigrate(makeOpts(), makeCtx(), runner, {
      yamlExists: true,
      jsonExists: false,
      migrateScriptExists: true,
    });
    expect(result.status).toBe('pass');
  });

  it('.specify.json already exists → skip', async () => {
    const runner = mockRunner({});
    const result = await runConfigMigrate(makeOpts(), makeCtx(), runner, {
      yamlExists: true,
      jsonExists: true,
    });
    expect(result.status).toBe('pass');
    expect(result.message).toContain('already exists');
  });

  it('no .specify.yaml → skip', async () => {
    const runner = mockRunner({});
    const result = await runConfigMigrate(makeOpts(), makeCtx(), runner, {
      yamlExists: false,
      jsonExists: false,
    });
    expect(result.status).toBe('skipped');
  });

  it('migrate script missing → fail', async () => {
    const runner = mockRunner({});
    const result = await runConfigMigrate(makeOpts(), makeCtx(), runner, {
      yamlExists: true,
      jsonExists: false,
      migrateScriptExists: false,
    });
    expect(result.status).toBe('fail');
  });

  it('migrate script fails → fail', async () => {
    const runner = mockRunner({
      'migrate-yaml-to-json.sh': { stdout: '', exitCode: 1 },
    });
    const result = await runConfigMigrate(makeOpts(), makeCtx(), runner, {
      yamlExists: true,
      jsonExists: false,
      migrateScriptExists: true,
    });
    expect(result.status).toBe('fail');
  });
});
