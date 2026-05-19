import { describe, it, expect, beforeEach, afterEach } from 'bun:test';
import { tmpdir } from 'node:os';
import { mkdtempSync, rmSync, writeFileSync, mkdirSync } from 'node:fs';
import { join, resolve } from 'node:path';
import {
  findConfigFile,
  parseConfig,
  findSubWorkspace,
  autoDetectSubWorkspace,
  findModule,
  autoDetectModule,
  getTestStrategy,
  validateModules,
  validatePathContainment,
  detectConfig,
  type SpecifyConfig,
} from '../../src/utils/index';
import { SpecifyConfigSchema, type TestStrategy } from '../../src/utils/types';

describe('config.test.ts', () => {
  let tempDir: string;

  beforeEach(() => {
    tempDir = mkdtempSync(join(tmpdir(), 'tdk-test-'));
  });

  afterEach(() => {
    rmSync(tempDir, { recursive: true, force: true });
  });

  // --- findConfigFile tests ---

  it('C-01: findConfigFile from workspace root (.json) → returns path', () => {
    const specDir = join(tempDir, '.specify');
    mkdirSync(specDir);
    const configPath = join(specDir, '.specify.json');
    writeFileSync(configPath, JSON.stringify({ name: 'test' }));

    const result = findConfigFile(tempDir);
    expect(result).toBe(configPath);
  });

  it('C-02: findConfigFile from subdirectory → walks up', () => {
    const specDir = join(tempDir, '.specify');
    mkdirSync(specDir);
    const configPath = join(specDir, '.specify.json');
    writeFileSync(configPath, JSON.stringify({ name: 'test' }));

    const subDir = join(tempDir, 'src', 'api');
    mkdirSync(subDir, { recursive: true });

    const result = findConfigFile(subDir);
    expect(result).toBe(configPath);
  });

  it('C-03: findConfigFile no config → null', () => {
    const result = findConfigFile(tempDir);
    expect(result).toBeNull();
  });

  it('C-04: findConfigFile prefers .json over .yaml', () => {
    const specDir = join(tempDir, '.specify');
    mkdirSync(specDir);
    const jsonPath = join(specDir, '.specify.json');
    const yamlPath = join(specDir, '.specify.yaml');
    writeFileSync(jsonPath, JSON.stringify({ name: 'test' }));
    writeFileSync(yamlPath, 'name: test');

    const result = findConfigFile(tempDir);
    expect(result).toBe(jsonPath);
  });

  // --- parseConfig tests ---

  it('C-05: parseConfig valid JSON → validated config', () => {
    const specDir = join(tempDir, '.specify');
    mkdirSync(specDir);
    const configPath = join(specDir, '.specify.json');
    const config: SpecifyConfig = {
      version: '1.0',
      name: 'test-workspace',
      specs: { root: '.specify', defaultFolder: 'feature' },
    };
    writeFileSync(configPath, JSON.stringify(config));

    const { config: parsed, error } = parseConfig(configPath);
    expect(error).toBeNull();
    expect(parsed?.name).toBe('test-workspace');
    expect(parsed?.specs?.root).toBe('.specify');
  });

  it('C-06: parseConfig invalid JSON → error', () => {
    const specDir = join(tempDir, '.specify');
    mkdirSync(specDir);
    const configPath = join(specDir, '.specify.json');
    writeFileSync(configPath, '{ invalid json');

    const { config, error } = parseConfig(configPath);
    expect(config).toBeNull();
    expect(error).toContain('parse_error');
  });

  it('C-07: parseConfig YAML file → migration hint error', () => {
    const specDir = join(tempDir, '.specify');
    mkdirSync(specDir);
    const configPath = join(specDir, '.specify.yaml');
    writeFileSync(configPath, 'name: test');

    const { config, error } = parseConfig(configPath);
    expect(config).toBeNull();
    expect(error).toContain('yaml_not_supported');
  });

  // --- findSubWorkspace tests ---

  it('C-08: findSubWorkspace by name → correct sw', () => {
    const config: SpecifyConfig = {
      version: '1.0',
      name: 'test',
      subWorkspaces: [
        { name: 'backend', path: 'backend' },
        { name: 'frontend', path: 'frontend' },
      ],
    };

    const sw = findSubWorkspace(config, 'backend');
    expect(sw?.name).toBe('backend');
    expect(sw?.path).toBe('backend');
  });

  it('C-09: findSubWorkspace not found → undefined', () => {
    const config: SpecifyConfig = {
      version: '1.0',
      name: 'test',
      subWorkspaces: [{ name: 'backend', path: 'backend' }],
    };

    const sw = findSubWorkspace(config, 'nonexistent');
    expect(sw).toBeUndefined();
  });

  it('C-10: autoDetectSubWorkspace CWD inside sw → sw name', () => {
    const config: SpecifyConfig = {
      version: '1.0',
      name: 'test',
      subWorkspaces: [
        { name: 'backend', path: 'backend' },
        { name: 'frontend', path: 'frontend' },
      ],
    };

    const backendDir = join(tempDir, 'backend', 'src');
    mkdirSync(backendDir, { recursive: true });

    const result = autoDetectSubWorkspace(config, tempDir, backendDir);
    expect(result).toBe('backend');
  });

  it('C-11: autoDetectSubWorkspace CWD at root → null', () => {
    const config: SpecifyConfig = {
      version: '1.0',
      name: 'test',
      subWorkspaces: [{ name: 'backend', path: 'backend' }],
    };

    const result = autoDetectSubWorkspace(config, tempDir, tempDir);
    expect(result).toBeNull();
  });

  it('C-12: autoDetectSubWorkspace prefix safety: "backend/" NOT match "backend-v2/"', () => {
    const config: SpecifyConfig = {
      version: '1.0',
      name: 'test',
      subWorkspaces: [
        { name: 'backend', path: 'backend' },
        { name: 'backend-v2', path: 'backend-v2' },
      ],
    };

    const backendDir = join(tempDir, 'backend', 'src');
    mkdirSync(backendDir, { recursive: true });

    const result = autoDetectSubWorkspace(config, tempDir, backendDir);
    expect(result).toBe('backend');
  });

  // --- findModule tests ---

  it('C-13: findModule by name → module', () => {
    const sw = {
      name: 'backend',
      path: 'backend',
      modules: [
        { name: 'api', path: 'api' },
        { name: 'auth', path: 'auth' },
      ],
    };

    const mod = findModule(sw, 'api');
    expect(mod?.name).toBe('api');
    expect(mod?.path).toBe('api');
  });

  it('C-14: findModule not found → undefined', () => {
    const sw = {
      name: 'backend',
      path: 'backend',
      modules: [{ name: 'api', path: 'api' }],
    };

    const mod = findModule(sw, 'nonexistent');
    expect(mod).toBeUndefined();
  });

  it('C-15: findModule no modules key → undefined', () => {
    const sw = { name: 'backend', path: 'backend' };
    const mod = findModule(sw, 'api');
    expect(mod).toBeUndefined();
  });

  // --- autoDetectModule tests ---

  it('C-16: autoDetectModule CWD inside module → module name', () => {
    const sw = {
      name: 'backend',
      path: 'backend',
      modules: [
        { name: 'api', path: 'api' },
        { name: 'auth', path: 'auth' },
      ],
    };

    const apiDir = join(tempDir, 'backend', 'api', 'src');
    mkdirSync(apiDir, { recursive: true });

    const result = autoDetectModule(sw, join(tempDir, 'backend'), apiDir);
    expect(result).toBe('api');
  });

  it('C-17: autoDetectModule longest match wins', () => {
    const sw = {
      name: 'backend',
      path: 'backend',
      modules: [
        { name: 'api', path: 'api' },
        { name: 'api-internal', path: 'api/internal' },
      ],
    };

    const internalDir = join(tempDir, 'backend', 'api', 'internal', 'src');
    mkdirSync(internalDir, { recursive: true });

    const result = autoDetectModule(sw, join(tempDir, 'backend'), internalDir);
    expect(result).toBe('api-internal');
  });

  // --- getTestStrategy tests ---

  it('C-19: getTestStrategy not defined → undefined', () => {
    const sw = { name: 'backend', path: 'backend' };
    const strategy = getTestStrategy(sw);
    expect(strategy).toBeUndefined();
  });

  // --- validateModules tests ---

  it('C-20: validateModules duplicate names → warning', () => {
    const config: SpecifyConfig = {
      version: '1.0',
      name: 'test',
      subWorkspaces: [
        {
          name: 'backend',
          path: 'backend',
          modules: [
            { name: 'api', path: 'api' },
            { name: 'api', path: 'api2' },
          ],
        },
      ],
    };

    const warnings = validateModules(config);
    expect(warnings.some(w => w.includes('Duplicate module name'))).toBe(true);
  });

  it('C-21: validateModules overlapping paths → warning', () => {
    const config: SpecifyConfig = {
      version: '1.0',
      name: 'test',
      subWorkspaces: [
        {
          name: 'backend',
          path: 'backend',
          modules: [
            { name: 'api', path: 'api' },
            { name: 'api-v2', path: 'api' },
          ],
        },
      ],
    };

    const warnings = validateModules(config);
    expect(warnings.some(w => w.includes('Overlapping module path'))).toBe(true);
  });

  it('C-22: validateModules missing testPath → warning', () => {
    const config: SpecifyConfig = {
      version: '1.0',
      name: 'test',
      subWorkspaces: [
        {
          name: 'backend',
          path: 'backend',
          testMapping: { strategy: 'separate-project' satisfies TestStrategy },
          modules: [{ name: 'api', path: 'api' }],
        },
      ],
    };

    const warnings = validateModules(config);
    expect(warnings.some(w => w.includes('testPath recommended'))).toBe(true);
  });

  it('C-22b: validateModules mirror + no testPath → no warning (testPath defaults to "test")', () => {
    const config: SpecifyConfig = {
      version: '1.0',
      name: 'test',
      subWorkspaces: [
        {
          name: 'backend',
          path: 'backend',
          testMapping: { strategy: 'mirror' satisfies TestStrategy },
          modules: [{ name: 'api', path: 'api' }],
        },
      ],
    };

    const warnings = validateModules(config);
    expect(warnings.some(w => w.includes('testPath recommended'))).toBe(false);
  });

  // --- separate-folder rejection + migration hint tests ---

  it('rejects legacy separate-folder strategy with migration hint', () => {
    const config = {
      name: 'legacy',
      subWorkspaces: [
        {
          name: 'backend',
          path: 'backend',
          testMapping: { strategy: 'separate-folder' },
        },
      ],
    };
    expect(() => SpecifyConfigSchema.parse(config)).toThrow(
      /separate-folder.*mirror.*tdk-ut-backfill-skills-usage\.md/s,
    );
  });

  it('parseConfig surfaces migration hint as first line of error for separate-folder', () => {
    const specDir = join(tempDir, '.specify');
    mkdirSync(specDir);
    const configPath = join(specDir, '.specify.json');
    writeFileSync(configPath, JSON.stringify({
      name: 'legacy',
      subWorkspaces: [
        {
          name: 'backend',
          path: 'backend',
          testMapping: { strategy: 'separate-folder' },
        },
      ],
    }));

    const { config, error } = parseConfig(configPath);
    expect(config).toBeNull();
    expect(error).not.toBeNull();
    const firstLine = (error ?? '').split('\n')[0];
    expect(firstLine.startsWith(`parse_error:Strategy 'separate-folder' has been removed`)).toBe(true);
  });

  // --- validatePathContainment tests ---

  it('validatePathContainment with ../ → throws', () => {
    expect(() => {
      validatePathContainment(tempDir, join(tempDir, '..', 'escape'));
    }).toThrow();
  });

  it('validatePathContainment safe path → no throw', () => {
    const safePath = join(tempDir, 'subdir', 'file');
    expect(() => {
      validatePathContainment(tempDir, safePath);
    }).not.toThrow();
  });
});
