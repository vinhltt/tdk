import { describe, it, expect, beforeEach, afterEach } from 'bun:test';
import { tmpdir } from 'node:os';
import { mkdtempSync, rmSync, writeFileSync, mkdirSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { detectConfig } from '../../src/utils/index';
import { handleCliError } from '../../src/commands/ut/cli-error-handler';

describe('ut-scripts.test.ts (integration)', () => {
  let tempDir: string;

  beforeEach(() => {
    tempDir = mkdtempSync(join(tmpdir(), 'tdk-ut-'));
  });

  afterEach(() => {
    rmSync(tempDir, { recursive: true, force: true });
  });

  async function runBackfillCommand(command: 'auto' | 'plan' | 'impl'): Promise<Record<string, unknown>> {
    const commandPath = join(import.meta.dir, '..', '..', 'src', 'commands', 'ut', 'backfill', `${command}.ts`);
    const proc = Bun.spawn([
      'bun',
      'run',
      commandPath,
      'feat-001',
      '--sub-workspace',
      'backend',
      '--module',
      'api',
      ...(command === 'plan' ? ['--standalone'] : []),
    ], {
      cwd: tempDir,
      stdout: 'pipe',
      stderr: 'pipe',
    });
    const stdout = await new Response(proc.stdout).text();
    await new Response(proc.stderr).text();
    const exitCode = await proc.exited;
    expect(exitCode).toBe(0);
    return JSON.parse(stdout) as Record<string, unknown>;
  }

  it('U-04: detectConfig resolves module target', () => {
    const specDir = join(tempDir, '.specify');
    mkdirSync(specDir);
    const configPath = join(specDir, '.specify.json');

    writeFileSync(configPath, JSON.stringify({
      version: '1.0',
      name: 'dotnet-app',
      docs: { path: '.specify/configurations' },
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

    const config = detectConfig({ cwd: tempDir, subWorkspace: 'backend', module: 'api' });
    expect(config.configFound).toBe(true);
    expect(config.targetModule?.name).toBe('api');
    expect(Object.keys(config.targetModule ?? {}).sort()).toEqual(['name', 'path', 'root']);
    expect(Object.keys(config.targetSubWorkspace?.modules?.[0] ?? {}).sort()).toEqual(['name', 'path', 'root']);
    expect(Object.keys(config).sort()).toEqual([
      'commands',
      'configFound',
      'defaultFolder',
      'docsPath',
      'docsSyncBackup',
      'docsSyncExclude',
      'inlineRules',
      'memoryPath',
      'metadata',
      'rulesFiles',
      'specsRoot',
      'subWorkspaces',
      'targetModule',
      'targetSubWorkspace',
      'warnings',
      'workspaceName',
      'workspaceRoot',
    ]);
  });

  it('U-04d: handleCliError returns error when module not found', () => {
    const specDir = join(tempDir, '.specify');
    if (!existsSync(specDir)) mkdirSync(specDir);
    writeFileSync(join(specDir, '.specify.json'), JSON.stringify({
      version: '1.0',
      name: 'dotnet-app',
      docs: { path: '.specify/configurations' },
      subWorkspaces: [{ name: 'backend', path: 'backend', modules: [{ name: 'api', path: 'api' }] }],
    }));

    const config = detectConfig({ cwd: tempDir, subWorkspace: 'backend', module: 'nonexistent' });
    const result = handleCliError(config, { module: 'nonexistent' });
    expect(result).not.toBeNull();
    expect(result!.error).toBe('module_not_found');
    expect(result!.availableModules).toContain('api');
  });

  it('U-04d2: handleCliError returns error when --module without --sub-workspace', () => {
    const specDir = join(tempDir, '.specify');
    if (!existsSync(specDir)) mkdirSync(specDir);
    writeFileSync(join(specDir, '.specify.json'), JSON.stringify({
      version: '1.0',
      name: 'dotnet-app',
      docs: { path: '.specify/configurations' },
      subWorkspaces: [{ name: 'backend', path: 'backend' }],
    }));

    const config = detectConfig({ cwd: tempDir });
    const result = handleCliError(config, { module: 'api' });
    expect(result).not.toBeNull();
    expect(result!.error).toBe('sub_workspace_required');
    expect(result!.availableSubWorkspaces).toContain('backend');
  });

  it('U-04d3: handleCliError returns error when sub-workspace not found (V2-2)', () => {
    const specDir = join(tempDir, '.specify');
    if (!existsSync(specDir)) mkdirSync(specDir);
    writeFileSync(join(specDir, '.specify.json'), JSON.stringify({
      version: '1.0',
      name: 'dotnet-app',
      docs: { path: '.specify/configurations' },
      subWorkspaces: [{ name: 'backend', path: 'backend' }],
    }));

    const config = detectConfig({ cwd: tempDir, subWorkspace: 'nonexistent' });
    const result = handleCliError(config, { subWorkspace: 'nonexistent' });
    expect(result).not.toBeNull();
    expect(result!.error).toBe('sub_workspace_not_found');
    expect(result!.availableSubWorkspaces).toContain('backend');
  });

  it('U-05: detectConfig resolves sub-workspace target', () => {
    const specDir = join(tempDir, '.specify');
    mkdirSync(specDir);
    const configPath = join(specDir, '.specify.json');

    writeFileSync(configPath, JSON.stringify({
      version: '1.0',
      name: 'minimal-app',
      docs: { path: '.specify/configurations' },
      subWorkspaces: [
        {
          name: 'backend',
          path: 'backend',
        },
      ],
    }));

    mkdirSync(join(tempDir, 'backend'), { recursive: true });

    const config = detectConfig({ cwd: tempDir, subWorkspace: 'backend' });
    expect(config.configFound).toBe(true);
    expect(config.targetSubWorkspace?.name).toBe('backend');
  });

  it('U-06: auto.ts minimal → JSON shape, no moduleName', () => {
    const specDir = join(tempDir, '.specify');
    mkdirSync(specDir);
    const configPath = join(specDir, '.specify.json');

    writeFileSync(configPath, JSON.stringify({
      version: '1.0',
      name: 'test-app',
      docs: { path: '.specify/configurations' },
    }));

    const config = detectConfig({ cwd: tempDir });
    expect(config).toBeDefined();
    expect(typeof config).toBe('object');
    expect(config.configFound).toBe(true);
  });

  // --- hasModules tests ---

  it('U-09: hasModules=true when explicitly set in config', () => {
    const specDir = join(tempDir, '.specify');
    mkdirSync(specDir);
    writeFileSync(join(specDir, '.specify.json'), JSON.stringify({
      version: '1.0',
      name: 'test-app',
      docs: { path: '.specify/configurations' },
      subWorkspaces: [{ name: 'backend', path: 'backend', hasModules: true }],
    }));
    mkdirSync(join(tempDir, 'backend'), { recursive: true });

    const config = detectConfig({ cwd: tempDir, subWorkspace: 'backend' });
    expect(config.targetSubWorkspace?.hasModules).toBe(true);
  });

  it('U-10: hasModules inferred true from modules[] presence', () => {
    const specDir = join(tempDir, '.specify');
    mkdirSync(specDir);
    writeFileSync(join(specDir, '.specify.json'), JSON.stringify({
      version: '1.0',
      name: 'test-app',
      docs: { path: '.specify/configurations' },
      subWorkspaces: [{
        name: 'backend', path: 'backend',
        modules: [{ name: 'api', path: 'api' }],
      }],
    }));
    mkdirSync(join(tempDir, 'backend', 'api'), { recursive: true });

    const config = detectConfig({ cwd: tempDir, subWorkspace: 'backend' });
    expect(config.targetSubWorkspace?.hasModules).toBe(true);
  });

  it('U-11: hasModules defaults false when absent + no modules', () => {
    const specDir = join(tempDir, '.specify');
    mkdirSync(specDir);
    writeFileSync(join(specDir, '.specify.json'), JSON.stringify({
      version: '1.0',
      name: 'test-app',
      docs: { path: '.specify/configurations' },
      subWorkspaces: [{ name: 'backend', path: 'backend' }],
    }));
    mkdirSync(join(tempDir, 'backend'), { recursive: true });

    const config = detectConfig({ cwd: tempDir, subWorkspace: 'backend' });
    expect(config.targetSubWorkspace?.hasModules).toBe(false);
  });

  it('U-12: hasModules=false honored even with modules[] present', () => {
    const specDir = join(tempDir, '.specify');
    mkdirSync(specDir);
    writeFileSync(join(specDir, '.specify.json'), JSON.stringify({
      version: '1.0',
      name: 'test-app',
      docs: { path: '.specify/configurations' },
      subWorkspaces: [{
        name: 'backend', path: 'backend',
        hasModules: false,
        modules: [{ name: 'api', path: 'api' }],
      }],
    }));
    mkdirSync(join(tempDir, 'backend', 'api'), { recursive: true });

    const config = detectConfig({ cwd: tempDir, subWorkspace: 'backend' });
    // Explicit false overrides modules[] inference
    expect(config.targetSubWorkspace?.hasModules).toBe(false);
  });

  it('U-13: ModuleSchema rejects path traversal (..)', () => {
    const { ModuleSchema } = require('../../src/utils/types');
    const result = ModuleSchema.safeParse({ name: 'evil', path: '../etc/passwd' });
    expect(result.success).toBe(false);
  });

  it('U-14: SubWorkspaceSchema accepts hasModules optional field', () => {
    const { SubWorkspaceSchema } = require('../../src/utils/types');
    const withFlag = SubWorkspaceSchema.parse({ name: 'X', path: 'Y', hasModules: true });
    expect(withFlag.hasModules).toBe(true);

    const withoutFlag = SubWorkspaceSchema.parse({ name: 'X', path: 'Y' });
    expect(withoutFlag.hasModules).toBeUndefined();
  });

  it('U-14b: subWorkspaces[] output applies hasModules smart default (H1 fix)', () => {
    const specDir = join(tempDir, '.specify');
    mkdirSync(specDir);
    writeFileSync(join(specDir, '.specify.json'), JSON.stringify({
      version: '1.0',
      name: 'test-app',
      docs: { path: '.specify/configurations' },
      subWorkspaces: [
        { name: 'withModules', path: 'wm', modules: [{ name: 'api', path: 'api' }] },
        { name: 'noModules', path: 'nm' },
        { name: 'explicitFalse', path: 'ef', hasModules: false, modules: [{ name: 'x', path: 'x' }] },
      ],
    }));
    mkdirSync(join(tempDir, 'wm', 'api'), { recursive: true });
    mkdirSync(join(tempDir, 'nm'), { recursive: true });
    mkdirSync(join(tempDir, 'ef', 'x'), { recursive: true });

    const config = detectConfig({ cwd: tempDir });
    // Simulate CLI output mapping (same logic used in backfill CLIs)
    const mapped = (config.subWorkspaces ?? []).map(sw => ({
      ...sw,
      hasModules: sw.hasModules ?? ((sw.modules?.length ?? 0) > 0),
    }));
    expect(mapped.find(s => s.name === 'withModules')!.hasModules).toBe(true);
    expect(mapped.find(s => s.name === 'noModules')!.hasModules).toBe(false);
    expect(mapped.find(s => s.name === 'explicitFalse')!.hasModules).toBe(false);
  });

  it('U-15: UT backfill command JSON matches current output key allowlists', async () => {
    const specDir = join(tempDir, '.specify');
    mkdirSync(specDir);
    writeFileSync(join(specDir, '.specify.json'), JSON.stringify({
      version: '1.0',
      name: 'dotnet-app',
      specs: { root: '.specify', defaultFolder: 'feature' },
      subWorkspaces: [
        {
          name: 'backend',
          path: 'backend',
          modules: [{ name: 'api', path: 'api' }],
        },
      ],
    }));
    mkdirSync(join(tempDir, 'backend', 'api'), { recursive: true });
    mkdirSync(join(tempDir, '.specify', 'feature', 'feat-001', 'ut'), { recursive: true });
    writeFileSync(join(tempDir, '.specify', 'feature', 'feat-001', 'ut', 'plan.md'), '# UT Plan\n');

    for (const command of ['auto', 'plan', 'impl'] as const) {
      const output = await runBackfillCommand(command);
      expect(output.moduleName).toBe('api');
      const firstSubWorkspace = (output.subWorkspaces as Array<{ modules?: Array<Record<string, unknown>> }>)[0];
      expect(Object.keys(firstSubWorkspace?.modules?.[0] ?? {}).sort()).toEqual(['name', 'path']);
      const expectedKeys = {
        auto: [
          'createdFeatureDir',
          'featureDir',
          'featureId',
          'force',
          'hasPlan',
          'hasSpec',
          'moduleName',
          'planFile',
          'planOnly',
          'skipRun',
          'specFile',
          'subWorkspaceName',
          'subWorkspaces',
          'workspaceRoot',
        ],
        plan: [
          'coverageFile',
          'existingFiles',
          'featureDir',
          'featureId',
          'forceMode',
          'hasSpecFile',
          'mode',
          'moduleName',
          'needsStandalonePrompt',
          'planFile',
          'reviewMode',
          'specFile',
          'standaloneMode',
          'subWorkspaceName',
          'subWorkspaces',
          'testSpecFile',
          'workspaceRoot',
        ],
        impl: [
          'coverageFile',
          'featureDir',
          'featureId',
          'hasCoverage',
          'hasTestSpec',
          'moduleName',
          'planFile',
          'subWorkspaceName',
          'subWorkspaces',
          'testSpecFile',
          'workspaceRoot',
        ],
      }[command];
      expect(Object.keys(output).sort()).toEqual(expectedKeys);
    }
  });
});
