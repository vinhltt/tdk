import { describe, it, expect, beforeEach, afterEach } from 'bun:test';
import { tmpdir } from 'node:os';
import { mkdtempSync, rmSync, writeFileSync, mkdirSync } from 'node:fs';
import { join } from 'node:path';
import { resolveUtRules, resolveRulesCascade } from '../../src/utils/index';

describe('rules.test.ts', () => {
  let tempDir: string;

  beforeEach(() => {
    tempDir = mkdtempSync(join(tmpdir(), 'tdk-rules-'));
  });

  afterEach(() => {
    rmSync(tempDir, { recursive: true, force: true });
  });

  // --- 4-level rule resolution cascade ---

  it('R-01: Level 1 found (module-specific) → L1 path', () => {
    const docsPath = '.specify/configurations';
    const swName = 'backend';
    const moduleName = 'api';

    // Create L1 path: .specify/configurations/sub-workspaces/backend/modules/api/rules/test/ut-rule.md
    const l1Dir = join(tempDir, docsPath, 'sub-workspaces', swName, 'modules', moduleName, 'rules', 'test');
    mkdirSync(l1Dir, { recursive: true });
    const l1Path = join(l1Dir, 'ut-rule.md');
    writeFileSync(l1Path, 'Framework: vitest\nCoverage: 80%');

    // Also create L4 to verify L1 wins
    const l4Dir = join(tempDir, docsPath, 'rules', 'test');
    mkdirSync(l4Dir, { recursive: true });
    writeFileSync(join(l4Dir, 'ut-rule.md'), 'Framework: jest');

    const result = resolveUtRules({
      workspaceRoot: tempDir,
      docsPath,
      swName,
      moduleName,
    });

    expect(result).toBe(l1Path);
  });

  it('R-02: L1 missing, L2 found → L2 path', () => {
    const docsPath = '.specify/configurations';
    const swName = 'backend';
    const targetRoot = join(tempDir, 'backend');

    // Create L2 path: backend/.specify/configurations/rules/test/ut-rule.md
    const l2Dir = join(targetRoot, docsPath, 'rules', 'test');
    mkdirSync(l2Dir, { recursive: true });
    const l2Path = join(l2Dir, 'ut-rule.md');
    writeFileSync(l2Path, 'Framework: mocha');

    // Create L4 to verify L2 wins
    const l4Dir = join(tempDir, docsPath, 'rules', 'test');
    mkdirSync(l4Dir, { recursive: true });
    writeFileSync(join(l4Dir, 'ut-rule.md'), 'Framework: jest');

    const result = resolveUtRules({
      workspaceRoot: tempDir,
      docsPath,
      swName,
      targetRoot,
      targetDocsPath: docsPath,
    });

    expect(result).toBe(l2Path);
  });

  it('R-03: L1+L2 missing, L3 found → L3 path', () => {
    const docsPath = '.specify/configurations';
    const swName = 'backend';

    // Create L3 path: .specify/configurations/sub-workspaces/backend/rules/test/ut-rule.md
    const l3Dir = join(tempDir, docsPath, 'sub-workspaces', swName, 'rules', 'test');
    mkdirSync(l3Dir, { recursive: true });
    const l3Path = join(l3Dir, 'ut-rule.md');
    writeFileSync(l3Path, 'Framework: tap');

    // Create L4 to verify L3 wins
    const l4Dir = join(tempDir, docsPath, 'rules', 'test');
    mkdirSync(l4Dir, { recursive: true });
    writeFileSync(join(l4Dir, 'ut-rule.md'), 'Framework: jest');

    const result = resolveUtRules({
      workspaceRoot: tempDir,
      docsPath,
      swName,
    });

    expect(result).toBe(l3Path);
  });

  it('R-04: All miss, L4 found → L4 path', () => {
    const docsPath = '.specify/configurations';

    // Create only L4 path: .specify/configurations/rules/test/ut-rule.md
    const l4Dir = join(tempDir, docsPath, 'rules', 'test');
    mkdirSync(l4Dir, { recursive: true });
    const l4Path = join(l4Dir, 'ut-rule.md');
    writeFileSync(l4Path, 'Framework: jest');

    const result = resolveUtRules({
      workspaceRoot: tempDir,
      docsPath,
    });

    expect(result).toBe(l4Path);
  });

  it('R-05: All levels present → L1 (first wins)', () => {
    const docsPath = '.specify/configurations';
    const swName = 'backend';
    const moduleName = 'api';
    const targetRoot = join(tempDir, 'backend');

    // Create L1
    const l1Dir = join(tempDir, docsPath, 'sub-workspaces', swName, 'modules', moduleName, 'rules', 'test');
    mkdirSync(l1Dir, { recursive: true });
    const l1Path = join(l1Dir, 'ut-rule.md');
    writeFileSync(l1Path, 'Framework: vitest');

    // Create L2
    const l2Dir = join(targetRoot, docsPath, 'rules', 'test');
    mkdirSync(l2Dir, { recursive: true });
    writeFileSync(join(l2Dir, 'ut-rule.md'), 'Framework: mocha');

    // Create L3
    const l3Dir = join(tempDir, docsPath, 'sub-workspaces', swName, 'rules', 'test');
    mkdirSync(l3Dir, { recursive: true });
    writeFileSync(join(l3Dir, 'ut-rule.md'), 'Framework: tap');

    // Create L4
    const l4Dir = join(tempDir, docsPath, 'rules', 'test');
    mkdirSync(l4Dir, { recursive: true });
    writeFileSync(join(l4Dir, 'ut-rule.md'), 'Framework: jest');

    const result = resolveUtRules({
      workspaceRoot: tempDir,
      docsPath,
      swName,
      moduleName,
      targetRoot,
      targetDocsPath: docsPath,
    });

    expect(result).toBe(l1Path);
  });

  it('R-06: No rules anywhere → null', () => {
    const docsPath = '.specify/configurations';

    // Create directory structure but no rule file
    mkdirSync(join(tempDir, docsPath, 'rules', 'test'), { recursive: true });

    const result = resolveUtRules({
      workspaceRoot: tempDir,
      docsPath,
    });

    expect(result).toBeNull();
  });

  it('R-07: No module, L3 found → L3', () => {
    const docsPath = '.specify/configurations';
    const swName = 'backend';

    // Create L3 (no module)
    const l3Dir = join(tempDir, docsPath, 'sub-workspaces', swName, 'rules', 'test');
    mkdirSync(l3Dir, { recursive: true });
    const l3Path = join(l3Dir, 'ut-rule.md');
    writeFileSync(l3Path, 'Framework: mocha');

    const result = resolveUtRules({
      workspaceRoot: tempDir,
      docsPath,
      swName,
      moduleName: undefined,
    });

    expect(result).toBe(l3Path);
  });

  it('R-08: No sw, L4 found → L4', () => {
    const docsPath = '.specify/configurations';

    // Create L4 (no sw)
    const l4Dir = join(tempDir, docsPath, 'rules', 'test');
    mkdirSync(l4Dir, { recursive: true });
    const l4Path = join(l4Dir, 'ut-rule.md');
    writeFileSync(l4Path, 'Framework: jest');

    const result = resolveUtRules({
      workspaceRoot: tempDir,
      docsPath,
      swName: undefined,
      moduleName: undefined,
    });

    expect(result).toBe(l4Path);
  });

  // --- Cascade resolution (resolveRulesCascade) ---

  const UT_SUBPATH = 'rules/test/ut-rule.md';

  it('R-C01: only L4 exists -> single entry [global]', () => {
    const docsPath = '.specify/configurations';
    const l4Dir = join(tempDir, docsPath, 'rules', 'test');
    mkdirSync(l4Dir, { recursive: true });
    const l4Path = join(l4Dir, 'ut-rule.md');
    writeFileSync(l4Path, 'Framework: jest');

    const result = resolveRulesCascade({
      workspaceRoot: tempDir,
      docsPath,
      ruleSubPath: UT_SUBPATH,
    });

    expect(result.entries).toHaveLength(1);
    expect(result.entries[0]!.level).toBe('global');
    expect(result.entries[0]!.path).toBe(l4Path);
    expect(result.primary).toBe(l4Path);
  });

  it('R-C02: only L1 exists -> single entry [module]', () => {
    const docsPath = '.specify/configurations';
    const swName = 'backend';
    const moduleName = 'api';
    const l1Dir = join(tempDir, docsPath, 'sub-workspaces', swName, 'modules', moduleName, 'rules', 'test');
    mkdirSync(l1Dir, { recursive: true });
    const l1Path = join(l1Dir, 'ut-rule.md');
    writeFileSync(l1Path, 'Framework: vitest');

    const result = resolveRulesCascade({
      workspaceRoot: tempDir,
      docsPath,
      ruleSubPath: UT_SUBPATH,
      swName,
      moduleName,
    });

    expect(result.entries).toHaveLength(1);
    expect(result.entries[0]!.level).toBe('module');
    expect(result.entries[0]!.path).toBe(l1Path);
    expect(result.primary).toBe(l1Path);
  });

  it('R-C03: L4 + L1 exist -> [global, module], primary=L1', () => {
    const docsPath = '.specify/configurations';
    const swName = 'backend';
    const moduleName = 'api';

    const l4Dir = join(tempDir, docsPath, 'rules', 'test');
    mkdirSync(l4Dir, { recursive: true });
    const l4Path = join(l4Dir, 'ut-rule.md');
    writeFileSync(l4Path, 'Framework: jest');

    const l1Dir = join(tempDir, docsPath, 'sub-workspaces', swName, 'modules', moduleName, 'rules', 'test');
    mkdirSync(l1Dir, { recursive: true });
    const l1Path = join(l1Dir, 'ut-rule.md');
    writeFileSync(l1Path, 'Framework: vitest');

    const result = resolveRulesCascade({
      workspaceRoot: tempDir,
      docsPath,
      ruleSubPath: UT_SUBPATH,
      swName,
      moduleName,
    });

    expect(result.entries).toHaveLength(2);
    expect(result.entries.map(e => e.level)).toEqual(['global', 'module']);
    expect(result.entries[0]!.path).toBe(l4Path);
    expect(result.entries[1]!.path).toBe(l1Path);
    expect(result.primary).toBe(l1Path);
  });

  it('R-C04: L4 + L3 + L1 exist -> [global, sw-parent, module]', () => {
    const docsPath = '.specify/configurations';
    const swName = 'backend';
    const moduleName = 'api';

    const l4Dir = join(tempDir, docsPath, 'rules', 'test');
    mkdirSync(l4Dir, { recursive: true });
    const l4Path = join(l4Dir, 'ut-rule.md');
    writeFileSync(l4Path, 'Framework: jest');

    const l3Dir = join(tempDir, docsPath, 'sub-workspaces', swName, 'rules', 'test');
    mkdirSync(l3Dir, { recursive: true });
    const l3Path = join(l3Dir, 'ut-rule.md');
    writeFileSync(l3Path, 'Framework: tap');

    const l1Dir = join(tempDir, docsPath, 'sub-workspaces', swName, 'modules', moduleName, 'rules', 'test');
    mkdirSync(l1Dir, { recursive: true });
    const l1Path = join(l1Dir, 'ut-rule.md');
    writeFileSync(l1Path, 'Framework: vitest');

    const result = resolveRulesCascade({
      workspaceRoot: tempDir,
      docsPath,
      ruleSubPath: UT_SUBPATH,
      swName,
      moduleName,
    });

    expect(result.entries.map(e => e.level)).toEqual(['global', 'sw-parent', 'module']);
    expect(result.entries.map(e => e.path)).toEqual([l4Path, l3Path, l1Path]);
    expect(result.primary).toBe(l1Path);
  });

  it('R-C05: all 4 levels exist -> [global, sw-parent, sw-own, module]', () => {
    const docsPath = '.specify/configurations';
    const swName = 'backend';
    const moduleName = 'api';
    const targetRoot = join(tempDir, 'backend');

    const l4Dir = join(tempDir, docsPath, 'rules', 'test');
    mkdirSync(l4Dir, { recursive: true });
    const l4Path = join(l4Dir, 'ut-rule.md');
    writeFileSync(l4Path, 'Framework: jest');

    const l3Dir = join(tempDir, docsPath, 'sub-workspaces', swName, 'rules', 'test');
    mkdirSync(l3Dir, { recursive: true });
    const l3Path = join(l3Dir, 'ut-rule.md');
    writeFileSync(l3Path, 'Framework: tap');

    const l2Dir = join(targetRoot, docsPath, 'rules', 'test');
    mkdirSync(l2Dir, { recursive: true });
    const l2Path = join(l2Dir, 'ut-rule.md');
    writeFileSync(l2Path, 'Framework: mocha');

    const l1Dir = join(tempDir, docsPath, 'sub-workspaces', swName, 'modules', moduleName, 'rules', 'test');
    mkdirSync(l1Dir, { recursive: true });
    const l1Path = join(l1Dir, 'ut-rule.md');
    writeFileSync(l1Path, 'Framework: vitest');

    const result = resolveRulesCascade({
      workspaceRoot: tempDir,
      docsPath,
      ruleSubPath: UT_SUBPATH,
      swName,
      moduleName,
      targetRoot,
      targetDocsPath: docsPath,
    });

    expect(result.entries.map(e => e.level)).toEqual(['global', 'sw-parent', 'sw-own', 'module']);
    expect(result.entries.map(e => e.path)).toEqual([l4Path, l3Path, l2Path, l1Path]);
    expect(result.primary).toBe(l1Path);
  });

  it('R-C06: no levels exist -> empty entries, primary=null', () => {
    const docsPath = '.specify/configurations';
    mkdirSync(join(tempDir, docsPath), { recursive: true });

    const result = resolveRulesCascade({
      workspaceRoot: tempDir,
      docsPath,
      ruleSubPath: UT_SUBPATH,
      swName: 'backend',
      moduleName: 'api',
    });

    expect(result.entries).toEqual([]);
    expect(result.primary).toBeNull();
  });

  it('R-C07: generic ruleSubPath wiring (lint-rule.md on L4)', () => {
    const docsPath = 'docs';
    const lintSubPath = 'rules/lint/lint-rule.md';
    const l4Dir = join(tempDir, docsPath, 'rules', 'lint');
    mkdirSync(l4Dir, { recursive: true });
    const l4Path = join(l4Dir, 'lint-rule.md');
    writeFileSync(l4Path, 'Linter: eslint');

    const result = resolveRulesCascade({
      workspaceRoot: tempDir,
      docsPath,
      ruleSubPath: lintSubPath,
    });

    expect(result.entries).toHaveLength(1);
    expect(result.entries[0]!.level).toBe('global');
    expect(result.entries[0]!.path).toBe(l4Path);
    expect(result.primary).toBe(l4Path);
  });

  it('R-C08: zero-byte file at L1 -> included in entries', () => {
    const docsPath = '.specify/configurations';
    const swName = 'backend';
    const moduleName = 'api';
    const l1Dir = join(tempDir, docsPath, 'sub-workspaces', swName, 'modules', moduleName, 'rules', 'test');
    mkdirSync(l1Dir, { recursive: true });
    const l1Path = join(l1Dir, 'ut-rule.md');
    writeFileSync(l1Path, ''); // zero-byte

    const result = resolveRulesCascade({
      workspaceRoot: tempDir,
      docsPath,
      ruleSubPath: UT_SUBPATH,
      swName,
      moduleName,
    });

    expect(result.entries).toHaveLength(1);
    expect(result.entries[0]!.level).toBe('module');
    expect(result.primary).toBe(l1Path);
  });

  it('R-C09: directory at L1 path -> NOT included (statSync rejects)', () => {
    const docsPath = '.specify/configurations';
    const swName = 'backend';
    const moduleName = 'api';
    // L1 path exists as DIRECTORY, not file
    const l1AsDir = join(tempDir, docsPath, 'sub-workspaces', swName, 'modules', moduleName, 'rules', 'test', 'ut-rule.md');
    mkdirSync(l1AsDir, { recursive: true });

    // Valid L4 to have something in entries
    const l4Dir = join(tempDir, docsPath, 'rules', 'test');
    mkdirSync(l4Dir, { recursive: true });
    const l4Path = join(l4Dir, 'ut-rule.md');
    writeFileSync(l4Path, 'Framework: jest');

    const result = resolveRulesCascade({
      workspaceRoot: tempDir,
      docsPath,
      ruleSubPath: UT_SUBPATH,
      swName,
      moduleName,
    });

    expect(result.entries).toHaveLength(1);
    expect(result.entries[0]!.level).toBe('global');
    expect(result.primary).toBe(l4Path);
  });
});
