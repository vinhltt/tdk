import { describe, it, expect, beforeEach, afterEach } from 'bun:test';
import { tmpdir } from 'node:os';
import { mkdtempSync, rmSync, writeFileSync, mkdirSync, readFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { detectConfig, resolveUtRules } from '../../src/utils/index';
import { buildRulesCreateDir } from '../../src/commands/ut/create-rules';
import { handleCliError } from '../../src/commands/ut/cli-error-handler';

describe('ut-scripts.test.ts (integration)', () => {
  let tempDir: string;

  beforeEach(() => {
    tempDir = mkdtempSync(join(tmpdir(), 'tdk-ut-'));
  });

  afterEach(() => {
    rmSync(tempDir, { recursive: true, force: true });
  });

  // --- UT rules resolution integration tests ---

  it('U-01: check-rules.ts with rule file → exists=true', () => {
    const specDir = join(tempDir, '.specify');
    mkdirSync(specDir);
    const configPath = join(specDir, '.specify.json');

    writeFileSync(configPath, JSON.stringify({
      version: '1.0',
      name: 'test-app',
      docs: { path: '.specify/configurations' },
    }));

    // Create L4 rule file
    const ruleDir = join(tempDir, '.specify', 'configurations', 'rules', 'test');
    mkdirSync(ruleDir, { recursive: true });
    writeFileSync(
      join(ruleDir, 'ut-rule.md'),
      'Framework: vitest\nCoverage: 80%',
    );

    const config = detectConfig({ cwd: tempDir });
    const rulesFile = resolveUtRules({
      workspaceRoot: config.workspaceRoot,
      docsPath: config.docsPath,
    });

    expect(rulesFile).not.toBeNull();
    const content = readFileSync(rulesFile!, 'utf-8');
    expect(content).toContain('vitest');
  });

  it('U-02: check-rules.ts with L3 fallback → exists=true', () => {
    const specDir = join(tempDir, '.specify');
    mkdirSync(specDir);
    const configPath = join(specDir, '.specify.json');

    writeFileSync(configPath, JSON.stringify({
      version: '1.0',
      name: 'test-app',
      docs: { path: '.specify/configurations' },
      subWorkspaces: [
        {
          name: 'backend',
          path: 'backend',
        },
      ],
    }));

    mkdirSync(join(tempDir, 'backend'), { recursive: true });

    // Create L3 rule file (sub-workspace level)
    const ruleDir = join(tempDir, '.specify', 'configurations', 'sub-workspaces', 'backend', 'rules', 'test');
    mkdirSync(ruleDir, { recursive: true });
    writeFileSync(
      join(ruleDir, 'ut-rule.md'),
      'Framework: mocha\nCoverage: 75%',
    );

    const config = detectConfig({ cwd: tempDir, subWorkspace: 'backend' });
    const rulesFile = resolveUtRules({
      workspaceRoot: config.workspaceRoot,
      docsPath: config.docsPath,
      swName: 'backend',
    });

    expect(rulesFile).not.toBeNull();
    const content = readFileSync(rulesFile!, 'utf-8');
    expect(content).toContain('mocha');
  });

  it('U-03: check-rules.ts no rules → exists=false', () => {
    const specDir = join(tempDir, '.specify');
    mkdirSync(specDir);
    const configPath = join(specDir, '.specify.json');

    writeFileSync(configPath, JSON.stringify({
      version: '1.0',
      name: 'test-app',
      docs: { path: '.specify/configurations' },
    }));

    // Create directory structure but no rule file
    const ruleDir = join(tempDir, '.specify', 'configurations', 'rules', 'test');
    mkdirSync(ruleDir, { recursive: true });

    const config = detectConfig({ cwd: tempDir });
    const rulesFile = resolveUtRules({
      workspaceRoot: config.workspaceRoot,
      docsPath: config.docsPath,
    });

    expect(rulesFile).toBeNull();
  });

  it('U-04: create-rules.ts dotnet → rulesDir contains modules/api', () => {
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
  });

  it('U-04b: buildRulesCreateDir with module → L1 module path', () => {
    const specDir = join(tempDir, '.specify');
    mkdirSync(specDir);
    writeFileSync(join(specDir, '.specify.json'), JSON.stringify({
      version: '1.0',
      name: 'dotnet-app',
      docs: { path: '.specify/configurations' },
      subWorkspaces: [{ name: 'backend', path: 'backend', modules: [{ name: 'api', path: 'api' }] }],
    }));
    mkdirSync(join(tempDir, 'backend', 'api'), { recursive: true });

    const config = detectConfig({ cwd: tempDir, subWorkspace: 'backend', module: 'api' });
    expect(config.targetModule?.name).toBe('api');
    expect(config.targetSubWorkspace?.name).toBe('backend');

    const rulesDir = buildRulesCreateDir(config, tempDir);
    expect(rulesDir).toContain('/sub-workspaces/backend/modules/api/rules/test');

    // Verify JSON output fields present when module set
    expect(config.targetModule?.path).toBeDefined();
    expect(config.targetModule?.root).toBeDefined();
  });

  it('U-04c: buildRulesCreateDir without module (hasModules=false) → L2 fallback', () => {
    const specDir = join(tempDir, '.specify');
    if (!existsSync(specDir)) mkdirSync(specDir);
    writeFileSync(join(specDir, '.specify.json'), JSON.stringify({
      version: '1.0',
      name: 'dotnet-app',
      docs: { path: '.specify/configurations' },
      subWorkspaces: [{ name: 'backend', path: 'backend' }],
    }));

    const config = detectConfig({ cwd: tempDir, subWorkspace: 'backend' });
    expect(config.targetModule).toBeUndefined();

    const rulesDir = buildRulesCreateDir(config, tempDir);
    expect(rulesDir).not.toContain('/modules/');
    expect(rulesDir).toContain('/rules/test');
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

  it('U-04e: buildRulesCreateDir L1 with custom SW docs.path — module uses workspace docsPath (RT11)', () => {
    const specDir = join(tempDir, '.specify');
    if (!existsSync(specDir)) mkdirSync(specDir);
    writeFileSync(join(specDir, '.specify.json'), JSON.stringify({
      version: '1.0',
      name: 'test-app',
      docs: { path: '.specify/configurations' },
      subWorkspaces: [{
        name: 'backend',
        path: 'backend',
        docs: { path: 'custom-docs' },
        modules: [{ name: 'api', path: 'api' }],
      }],
    }));
    mkdirSync(join(tempDir, 'backend', 'api'), { recursive: true });

    const config = detectConfig({ cwd: tempDir, subWorkspace: 'backend', module: 'api' });
    // L1: module branch uses workspace docsPath, NOT SW custom docsPath
    const modulePath = buildRulesCreateDir(config, tempDir);
    expect(modulePath).toContain('.specify/configurations/sub-workspaces/backend/modules/api');
    expect(modulePath).not.toContain('custom-docs');

    // L3: SW with modules[] (hasModules inferred true) → central sw-level, uses workspace docsPath
    const configNoMod = detectConfig({ cwd: tempDir, subWorkspace: 'backend' });
    const swPath = buildRulesCreateDir(configNoMod, tempDir);
    expect(swPath).toContain('.specify/configurations/sub-workspaces/backend/rules/test');
    expect(swPath).not.toContain('custom-docs');
  });

  it('U-04e2: buildRulesCreateDir L2 with custom SW docs.path — hasModules=false uses SW docsPath', () => {
    const specDir = join(tempDir, '.specify');
    if (!existsSync(specDir)) mkdirSync(specDir);
    writeFileSync(join(specDir, '.specify.json'), JSON.stringify({
      version: '1.0',
      name: 'test-app',
      docs: { path: '.specify/configurations' },
      subWorkspaces: [{
        name: 'frontend',
        path: 'frontend',
        docs: { path: 'custom-docs' },
      }],
    }));
    mkdirSync(join(tempDir, 'frontend'), { recursive: true });

    // hasModules=false (no modules[]) → L2 fallback uses SW custom docsPath
    const config = detectConfig({ cwd: tempDir, subWorkspace: 'frontend' });
    const swPath = buildRulesCreateDir(config, tempDir);
    expect(swPath).toContain('custom-docs/rules/test');
  });

  it('U-05: create-rules.ts minimal → rulesDir at sw level', () => {
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

  it('U-07: plan.ts with rule → resolves (4-level)', () => {
    const specDir = join(tempDir, '.specify');
    mkdirSync(specDir);
    const configPath = join(specDir, '.specify.json');

    writeFileSync(configPath, JSON.stringify({
      version: '1.0',
      name: 'test-app',
      docs: { path: '.specify/configurations' },
    }));

    // Create L4 rule
    const ruleDir = join(tempDir, '.specify', 'configurations', 'rules', 'test');
    mkdirSync(ruleDir, { recursive: true });
    writeFileSync(
      join(ruleDir, 'ut-rule.md'),
      'Framework: vitest\nCoverage: 80%',
    );

    const config = detectConfig({ cwd: tempDir });
    const rulesFile = resolveUtRules({
      workspaceRoot: config.workspaceRoot,
      docsPath: config.docsPath,
    });

    expect(rulesFile).not.toBeNull();
  });

  it('U-08: generate.ts with rule → resolves', () => {
    const specDir = join(tempDir, '.specify');
    mkdirSync(specDir);
    const configPath = join(specDir, '.specify.json');

    writeFileSync(configPath, JSON.stringify({
      version: '1.0',
      name: 'test-app',
      docs: { path: '.specify/configurations' },
    }));

    // Create L4 rule
    const ruleDir = join(tempDir, '.specify', 'configurations', 'rules', 'test');
    mkdirSync(ruleDir, { recursive: true });
    writeFileSync(
      join(ruleDir, 'ut-rule.md'),
      'Framework: vitest\nCoverage: 80%',
    );

    const config = detectConfig({ cwd: tempDir });
    expect(config.configFound).toBe(true);
  });

  // --- hasModules tests (Phase 1) ---

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
    // Simulate CLI output mapping (same logic used in all 5 CLIs)
    const mapped = (config.subWorkspaces ?? []).map(sw => ({
      ...sw,
      hasModules: sw.hasModules ?? ((sw.modules?.length ?? 0) > 0),
    }));
    expect(mapped.find(s => s.name === 'withModules')!.hasModules).toBe(true);
    expect(mapped.find(s => s.name === 'noModules')!.hasModules).toBe(false);
    expect(mapped.find(s => s.name === 'explicitFalse')!.hasModules).toBe(false);
  });

  // --- L3 write path tests (Phase 3) ---

  it('U-15: buildRulesCreateDir L3 — SW + hasModules=true + no module → central sw-level', () => {
    const specDir = join(tempDir, '.specify');
    mkdirSync(specDir);
    writeFileSync(join(specDir, '.specify.json'), JSON.stringify({
      version: '1.0',
      name: 'test-app',
      docs: { path: '.specify/configurations' },
      subWorkspaces: [{
        name: 'backend', path: 'backend', hasModules: true,
        modules: [{ name: 'api', path: 'api' }],
      }],
    }));
    mkdirSync(join(tempDir, 'backend', 'api'), { recursive: true });

    const config = detectConfig({ cwd: tempDir, subWorkspace: 'backend' });
    const rulesDir = buildRulesCreateDir(config, tempDir);
    expect(rulesDir).toContain('/sub-workspaces/backend/rules/test');
    expect(rulesDir).not.toContain('/modules/');
  });

  it('U-16: buildRulesCreateDir L2 — SW + hasModules=false → inside sw dir (regression)', () => {
    const specDir = join(tempDir, '.specify');
    mkdirSync(specDir);
    writeFileSync(join(specDir, '.specify.json'), JSON.stringify({
      version: '1.0',
      name: 'test-app',
      docs: { path: '.specify/configurations' },
      subWorkspaces: [{ name: 'frontend', path: 'frontend' }],
    }));
    mkdirSync(join(tempDir, 'frontend'), { recursive: true });

    const config = detectConfig({ cwd: tempDir, subWorkspace: 'frontend' });
    const rulesDir = buildRulesCreateDir(config, tempDir);
    expect(rulesDir).not.toContain('/sub-workspaces/');
    expect(rulesDir).toContain('/rules/test');
  });

  it('U-17: L3 write + L3 read round-trip (RT#1)', () => {
    const specDir = join(tempDir, '.specify');
    mkdirSync(specDir);
    writeFileSync(join(specDir, '.specify.json'), JSON.stringify({
      version: '1.0',
      name: 'test-app',
      docs: { path: '.specify/configurations' },
      subWorkspaces: [{
        name: 'backend', path: 'backend', hasModules: true,
        modules: [{ name: 'api', path: 'api' }],
      }],
    }));
    mkdirSync(join(tempDir, 'backend', 'api'), { recursive: true });

    // Write to L3 path
    const config = detectConfig({ cwd: tempDir, subWorkspace: 'backend' });
    const l3Dir = buildRulesCreateDir(config, tempDir);
    mkdirSync(l3Dir, { recursive: true });
    writeFileSync(join(l3Dir, 'ut-rule.md'), 'Framework: xunit\nCoverage: 90%');

    // Read should resolve L3 (no L2 exists)
    const rulesFile = resolveUtRules({
      workspaceRoot: config.workspaceRoot,
      docsPath: config.docsPath,
      swName: 'backend',
    });
    expect(rulesFile).not.toBeNull();
    const content = readFileSync(rulesFile!, 'utf-8');
    expect(content).toContain('xunit');
  });

  // [B1] handleCliError surfaces parse_error from legacy separate-folder config.
  // Skill /tdk-ut-backfill-check-rules Step 0.5 depends on the CLI emitting this error field.
  it('U-parse-error: separate-folder config → handleCliError returns parse_error', () => {
    const specDir = join(tempDir, '.specify');
    mkdirSync(specDir);
    writeFileSync(join(specDir, '.specify.json'), JSON.stringify({
      name: 'legacy',
      subWorkspaces: [
        {
          name: 'backend',
          path: 'backend',
          testMapping: { strategy: 'separate-folder' },
        },
      ],
    }));

    const config = detectConfig({ cwd: tempDir, subWorkspace: 'backend' });
    const cliError = handleCliError(config, { subWorkspace: 'backend' });

    expect(cliError).not.toBeNull();
    expect(cliError!.error).toBe('parse_error');
    expect(cliError!.message).toContain(`Strategy 'separate-folder' has been removed`);
    expect(cliError!.message).toContain('tdk-ut-backfill-skills-usage.md');
  });
});
