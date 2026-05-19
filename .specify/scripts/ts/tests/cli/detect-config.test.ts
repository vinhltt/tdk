import { describe, it, expect, beforeEach, afterEach } from 'bun:test';
import { tmpdir } from 'node:os';
import { mkdtempSync, rmSync, writeFileSync, mkdirSync } from 'node:fs';
import { join } from 'node:path';
import { detectConfig } from '../../src/utils/index';

describe('detect-config.test.ts (integration)', () => {
  let tempDir: string;

  beforeEach(() => {
    tempDir = mkdtempSync(join(tmpdir(), 'tdk-detect-'));
  });

  afterEach(() => {
    rmSync(tempDir, { recursive: true, force: true });
  });

  // --- detect-config integration tests (using detectConfig function directly) ---

  it('D-01: minimal config → configFound=true', () => {
    const specDir = join(tempDir, '.specify');
    mkdirSync(specDir);
    const configPath = join(specDir, '.specify.json');
    writeFileSync(configPath, JSON.stringify({
      version: '1.0',
      name: 'test-workspace',
    }));

    const result = detectConfig({ cwd: tempDir });

    expect(result.configFound).toBe(true);
    expect(result.workspaceName).toBe('test-workspace');
  });

  it('D-02: dotnet config with --sub-workspace backend --module api → targetModule present', () => {
    const specDir = join(tempDir, '.specify');
    mkdirSync(specDir);
    const configPath = join(specDir, '.specify.json');

    // Create a config with sub-workspace and module
    writeFileSync(configPath, JSON.stringify({
      version: '1.0',
      name: 'dotnet-app',
      subWorkspaces: [
        {
          name: 'backend',
          path: 'backend',
          modules: [
            { name: 'api', path: 'api' },
            { name: 'auth', path: 'auth' },
          ],
        },
      ],
    }));

    // Create the actual directory structure
    mkdirSync(join(tempDir, 'backend', 'api'), { recursive: true });
    mkdirSync(join(tempDir, 'backend', 'auth'), { recursive: true });

    const result = detectConfig({
      cwd: tempDir,
      subWorkspace: 'backend',
      module: 'api',
    });

    expect(result.configFound).toBe(true);
    expect((result.targetModule as any)?.name).toBe('api');
    expect((result.targetSubWorkspace as any)?.name).toBe('backend');
  });

  it('D-03: dotnet config with --module nope → error=module_not_found', () => {
    const specDir = join(tempDir, '.specify');
    mkdirSync(specDir);
    const configPath = join(specDir, '.specify.json');

    writeFileSync(configPath, JSON.stringify({
      version: '1.0',
      name: 'dotnet-app',
      subWorkspaces: [
        {
          name: 'backend',
          path: 'backend',
          modules: [
            { name: 'api', path: 'api' },
          ],
        },
      ],
    }));

    mkdirSync(join(tempDir, 'backend', 'api'), { recursive: true });

    const result = detectConfig({
      cwd: tempDir,
      subWorkspace: 'backend',
      module: 'nope',
    });

    expect(result.error).toBe('module_not_found');
    expect(result.requestedModule).toBe('nope');
  });

  it('D-04: empty dir → configFound=false', () => {
    const result = detectConfig({ cwd: tempDir });

    expect(result.configFound).toBe(false);
  });

  it('D-06: minimal with --sub-workspace backend → no testStrategy', () => {
    const specDir = join(tempDir, '.specify');
    mkdirSync(specDir);
    const configPath = join(specDir, '.specify.json');

    writeFileSync(configPath, JSON.stringify({
      version: '1.0',
      name: 'test-app',
      subWorkspaces: [
        {
          name: 'backend',
          path: 'backend',
        },
      ],
    }));

    mkdirSync(join(tempDir, 'backend'), { recursive: true });

    const result = detectConfig({
      cwd: tempDir,
      subWorkspace: 'backend',
    });

    expect(result.configFound).toBe(true);
    expect(result.testStrategy).toBeUndefined();
  });

  it('D-extra: sub-workspace auto-detect from cwd inside sw', () => {
    const specDir = join(tempDir, '.specify');
    mkdirSync(specDir);
    const configPath = join(specDir, '.specify.json');

    writeFileSync(configPath, JSON.stringify({
      version: '1.0',
      name: 'test-app',
      subWorkspaces: [
        { name: 'backend', path: 'backend' },
        { name: 'frontend', path: 'frontend' },
      ],
    }));

    mkdirSync(join(tempDir, 'backend', 'src'), { recursive: true });
    mkdirSync(join(tempDir, 'frontend', 'src'), { recursive: true });

    // Call from inside backend directory
    const result = detectConfig({
      cwd: join(tempDir, 'backend', 'src'),
    });

    expect(result.configFound).toBe(true);
    expect((result.targetSubWorkspace as any)?.name).toBe('backend');
  });

  it('D-07: CLI stdout JSON envelope replaces rawConfig with featureEnv + testConfig', async () => {
    const specDir = join(tempDir, '.specify');
    mkdirSync(specDir);
    writeFileSync(join(specDir, '.specify.json'), JSON.stringify({
      version: '1.0',
      name: 'envelope-test',
      git: { prefixList: 'feat,fix' },
      test: { api: { outputDir: 'custom/api' } },
    }));

    // cliPath: tests/cli/<this-file> → up 2 → src/commands/detect-config.ts
    const cliPath = join(import.meta.dir, '..', '..', 'src', 'commands', 'detect-config.ts');
    const proc = Bun.spawn(['bun', 'run', cliPath], {
      cwd: tempDir,
      stdout: 'pipe',
      stderr: 'pipe',
    });
    const stdout = await new Response(proc.stdout).text();
    await proc.exited;

    const output = JSON.parse(stdout);
    // 3 focused assertions: envelope replaces rawConfig, featureEnv populated, testConfig populated
    expect(output.rawConfig).toBeUndefined();
    expect(output.featureEnv?.prefixList).toBe('feat,fix');
    expect(output.testConfig?.found).toBe(true);
  });
});
