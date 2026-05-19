import { describe, it, expect, beforeEach, afterEach, spyOn } from 'bun:test';
import { tmpdir } from 'node:os';
import { mkdtempSync, rmSync, writeFileSync, mkdirSync } from 'node:fs';
import { join } from 'node:path';
import {
  loadFeatureEnv,
  parseTicketId,
  readTestApiConfig,
  type FeatureEnv,
  type SpecifyConfig,
} from '../../src/utils/index';

describe('common.test.ts', () => {
  let tempDir: string;

  beforeEach(() => {
    tempDir = mkdtempSync(join(tmpdir(), 'tdk-common-'));
  });

  afterEach(() => {
    rmSync(tempDir, { recursive: true, force: true });
  });

  // --- loadFeatureEnv tests ---

  it('CM-01: loadFeatureEnv with config → config values', () => {
    const specDir = join(tempDir, '.specify');
    mkdirSync(specDir);
    const configPath = join(specDir, '.specify.json');

    const config: SpecifyConfig = {
      version: '1.0',
      name: 'test',
      git: { mainBranch: 'develop', prefixList: 'feat,fix' },
      specs: {
        root: '.specify',
        defaultFolder: 'feature',
        ticketFormat: '^([a-zA-Z]+/)?([a-zA-Z]+)-([0-9]+)$',
      },
      validation: { timeout: 45, failBehavior: 'warn' as const },
    };
    writeFileSync(configPath, JSON.stringify(config));

    const env = loadFeatureEnv(configPath);

    expect(env.mainBranch).toBe('develop');
    expect(env.prefixList).toBe('feat,fix');
    expect(env.defaultFolder).toBe('feature');
    expect(env.hookTimeout).toBe(45);
    expect(env.hookFailBehavior).toBe('warn');
  });

  it('CM-02: loadFeatureEnv no config → defaults', () => {
    // Pass a non-existent path to ensure defaults are used
    const env = loadFeatureEnv(join(tempDir, 'nonexistent', '.specify.json'));

    expect(env.mainBranch).toBe('master');
    expect(env.prefixList).toBe('feat');
    expect(env.defaultFolder).toBe('feature');
    expect(env.specsRoot).toBe('.specify');
    expect(env.hookTimeout).toBe(30);
    expect(env.hookFailBehavior).toBe('exit');
  });

  // --- parseTicketId tests (also covers validatePrefix indirectly) ---

  it('CM-06: parseTicketId valid → parts', () => {
    const env: FeatureEnv = {
      prefixList: 'aa,bb',
      defaultFolder: 'feature',
      mainBranch: 'master',
      specsRoot: '.specify',
      ticketFormat: '^([a-zA-Z]+/)?([a-zA-Z]+)-([0-9]+)$',
      hookTimeout: 30,
      hookFailBehavior: 'exit',
      validationHook: '',
    };

    const result = parseTicketId('aa-001', env);

    expect(result).not.toBeNull();
    expect(result?.folder).toBe('feature');
    expect(result?.prefix).toBe('aa');
    expect(result?.number).toBe('001');
  });

  it('CM-07: parseTicketId invalid → null', () => {
    const env: FeatureEnv = {
      prefixList: 'aa,bb',
      defaultFolder: 'feature',
      mainBranch: 'master',
      specsRoot: '.specify',
      ticketFormat: '^([a-zA-Z]+/)?([a-zA-Z]+)-([0-9]+)$',
      hookTimeout: 30,
      hookFailBehavior: 'exit',
      validationHook: '',
    };

    const result = parseTicketId('not-a-valid-ticket', env);

    expect(result).toBeNull();
  });

  it('CM-06-extra: parseTicketId with folder prefix', () => {
    const env: FeatureEnv = {
      prefixList: 'aa,bb',
      defaultFolder: 'feature',
      mainBranch: 'master',
      specsRoot: '.specify',
      ticketFormat: '^([a-zA-Z]+/)?([a-zA-Z]+)-([0-9]+)$',
      hookTimeout: 30,
      hookFailBehavior: 'exit',
      validationHook: '',
    };

    const result = parseTicketId('backend/aa-002', env);

    expect(result).not.toBeNull();
    expect(result?.folder).toBe('backend');
    expect(result?.prefix).toBe('aa');
    expect(result?.number).toBe('002');
  });

  it('CM-06-extra: parseTicketId prefix not in allowlist → null', () => {
    const env: FeatureEnv = {
      prefixList: 'aa,bb',
      defaultFolder: 'feature',
      mainBranch: 'master',
      specsRoot: '.specify',
      ticketFormat: '^([a-zA-Z]+/)?([a-zA-Z]+)-([0-9]+)$',
      hookTimeout: 30,
      hookFailBehavior: 'exit',
      validationHook: '',
    };

    const result = parseTicketId('cc-001', env);

    expect(result).toBeNull();
  });

  it('CM-06-extra: parseTicketId ReDoS pattern rejected', () => {
    const env: FeatureEnv = {
      prefixList: 'aa',
      defaultFolder: 'feature',
      mainBranch: 'master',
      specsRoot: '.specify',
      ticketFormat: '^(a+)+$', // ReDoS pattern
      hookTimeout: 30,
      hookFailBehavior: 'exit',
      validationHook: '',
    };

    const stderrSpy = spyOn(process.stderr, 'write').mockImplementation(() => true);
    const result = parseTicketId('aa-001', env);

    expect(result).toBeNull();
    expect(stderrSpy).toHaveBeenCalledWith(expect.stringContaining('Unsafe ticketFormat'));

    stderrSpy.mockRestore();
  });

  // --- readTestApiConfig tests ---

  it('CM-08: readTestApiConfig defaults', () => {
    const config = readTestApiConfig();

    expect(config.found).toBe(false);
    expect(config.outputDir).toBe('tests/api');
    expect(config.authStrategy).toBe('bearer');
    expect(config.baseUrlEnv).toBe('API_BASE_URL');
    expect(config.tokenEnv).toBe('API_TOKEN');
  });

  it('CM-08-extra: readTestApiConfig with test.api config', () => {
    const config: SpecifyConfig = {
      version: '1.0',
      name: 'test',
      test: {
        api: {
          outputDir: 'tests/integration/api',
          authStrategy: 'oauth2',
          baseUrlEnv: 'TEST_API_URL',
          tokenEnv: 'TEST_TOKEN',
        },
      },
    };

    const result = readTestApiConfig(config);

    expect(result.found).toBe(true);
    expect(result.outputDir).toBe('tests/integration/api');
    expect(result.authStrategy).toBe('oauth2');
    expect(result.baseUrlEnv).toBe('TEST_API_URL');
    expect(result.tokenEnv).toBe('TEST_TOKEN');
  });

  it('CM-08-extra: readTestApiConfig with snake_case keys', () => {
    const config: SpecifyConfig = {
      version: '1.0',
      name: 'test',
      test: {
        api: {
          output_dir: 'tests/api/v2',
          auth_strategy: 'basic',
          base_url_env: 'API_URL',
          token_env: 'AUTH_TOKEN',
        },
      },
    };

    const result = readTestApiConfig(config);

    expect(result.found).toBe(true);
    expect(result.outputDir).toBe('tests/api/v2');
    expect(result.authStrategy).toBe('basic');
  });
});
