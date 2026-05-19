import { describe, it, expect, beforeEach, afterEach } from 'bun:test';
import { tmpdir } from 'node:os';
import { mkdtempSync, rmSync, writeFileSync, mkdirSync } from 'node:fs';
import { join } from 'node:path';
import { validateMirrorStructure, toPosixPath, stripTestSuffix } from '../../src/utils/mirror-validator';
import type { Module } from '../../src/utils/types';

describe('mirror-validator.test.ts', () => {
  let tempDir: string;
  let prevCwd: string;

  beforeEach(() => {
    tempDir = mkdtempSync(join(tmpdir(), 'tdk-mirror-'));
    prevCwd = process.cwd();
    process.chdir(tempDir);
  });

  afterEach(() => {
    process.chdir(prevCwd);
    rmSync(tempDir, { recursive: true, force: true });
  });

  function writeFile(rel: string, content = '') {
    const full = join(tempDir, rel);
    mkdirSync(join(full, '..'), { recursive: true });
    writeFileSync(full, content);
  }

  // --- unit tests for helpers ---

  it('toPosixPath normalizes backslashes + strips trailing slashes', () => {
    expect(toPosixPath('test\\composables')).toBe('test/composables');
    expect(toPosixPath('test/')).toBe('test');
    expect(toPosixPath('./test')).toBe('./test');
  });

  it('stripTestSuffix handles .test. and .spec. segments', () => {
    expect(stripTestSuffix('Button.test.tsx')).toBe('Button.tsx');
    expect(stripTestSuffix('Button.spec.ts')).toBe('Button.ts');
    expect(stripTestSuffix('Button.tsx')).toBe('Button.tsx');
    expect(stripTestSuffix('utils/helper.test.mts')).toBe('utils/helper.mts');
  });

  // --- algorithm branches T-01..T-12 ---

  it('T-01: module.testPath unset → defaults to test/', () => {
    writeFile('test/foo.test.ts');
    writeFile('foo.ts');
    const module: Module = { name: 'm', path: '.' };
    const result = validateMirrorStructure(module, undefined);
    expect(result.orphanTests).toHaveLength(0);
  });

  it('T-02: orphan detection — no matching source', () => {
    writeFile('test/foo.test.ts');
    const module: Module = { name: 'm', path: '.' };
    const result = validateMirrorStructure(module, undefined);
    expect(result.orphanTests).toHaveLength(1);
    expect(result.orphanTests[0].testFile).toBe('test/foo.test.ts');
    expect(result.orphanTests[0].expectedSource).toBe('foo.ts');
  });

  it('T-03: .spec. suffix matches source', () => {
    writeFile('test/foo.spec.ts');
    writeFile('foo.ts');
    const module: Module = { name: 'm', path: '.' };
    const result = validateMirrorStructure(module, undefined);
    expect(result.orphanTests).toHaveLength(0);
  });

  it('T-04: multiple TS/JS extensions resolve correctly', () => {
    writeFile('test/a.test.tsx');
    writeFile('a.tsx');
    writeFile('test/b.test.mts');
    writeFile('b.mts');
    writeFile('test/c.test.cjs');
    writeFile('c.cjs');
    const module: Module = { name: 'm', path: '.' };
    const result = validateMirrorStructure(module, undefined);
    expect(result.orphanTests).toHaveLength(0);
  });

  it('T-05: extension mismatch is an orphan (strict match, no cross-ext fallback)', () => {
    writeFile('test/a.test.tsx');
    writeFile('a.ts'); // source has .ts, test expects .tsx
    const module: Module = { name: 'm', path: '.' };
    const result = validateMirrorStructure(module, undefined);
    expect(result.orphanTests).toHaveLength(1);
    expect(result.orphanTests[0].expectedSource).toBe('a.tsx');
  });

  it('T-06: exclude.source swallows orphan matching pattern (e.g. **/*.d.ts)', () => {
    writeFile('test/types.test.d.ts');
    const module: Module = { name: 'm', path: '.' };
    const result = validateMirrorStructure(module, { source: ['**/*.d.ts'], test: [] });
    expect(result.orphanTests).toHaveLength(0);
  });

  it('T-07: exclude.test hides test file from discovery', () => {
    writeFile('test/fixtures/data.test.ts');
    writeFile('test/real.test.ts');
    writeFile('real.ts');
    const module: Module = { name: 'm', path: '.' };
    const result = validateMirrorStructure(module, { source: [], test: ['fixtures/**'] });
    expect(result.orphanTests).toHaveLength(0);
  });

  it('T-08: Windows-style testPath normalized via toPosixPath', () => {
    // scanSync on testPath='test/composables' yields relTest='useX.test.ts'
    // expectedSource = modulePath('.') joined with 'useX.ts' → 'useX.ts' at tempDir root.
    writeFile('test/composables/useX.test.ts');
    writeFile('useX.ts');
    const module: Module = { name: 'm', path: '.', testPath: 'test\\composables' };
    const result = validateMirrorStructure(module, undefined);
    expect(result.orphanTests).toHaveLength(0);
  });

  it('T-09: empty test dir → empty orphanTests', () => {
    mkdirSync(join(tempDir, 'test'), { recursive: true });
    const module: Module = { name: 'm', path: '.' };
    const result = validateMirrorStructure(module, undefined);
    expect(result.orphanTests).toHaveLength(0);
  });

  it('T-10: nested mirror — test/sub/foo.test.ts + sub/foo.ts → 0 orphans', () => {
    writeFile('test/sub/foo.test.ts');
    writeFile('sub/foo.ts');
    const module: Module = { name: 'm', path: '.' };
    const result = validateMirrorStructure(module, undefined);
    expect(result.orphanTests).toHaveLength(0);
  });

  it('T-11: exclude pattern with literal comma (iterated match, no alternation)', () => {
    writeFile('test/fixtures/data,comma/foo.test.ts');
    const module: Module = { name: 'm', path: '.' };
    const result = validateMirrorStructure(module, {
      source: [],
      test: ['fixtures/data,comma/**'],
    });
    expect(result.orphanTests).toHaveLength(0);
  });

  it('T-12: leading ./ in testPath normalized', () => {
    writeFile('test/foo.test.ts');
    writeFile('foo.ts');
    const module: Module = { name: 'm', path: '.', testPath: './test' };
    const result = validateMirrorStructure(module, undefined);
    expect(result.orphanTests).toHaveLength(0);
  });

  it('T-14: explicit baseDir resolves paths without process.chdir', () => {
    // Do NOT chdir; call from a different cwd to confirm baseDir decoupling.
    process.chdir(prevCwd);
    writeFile('test/foo.test.ts');
    const module: Module = { name: 'm', path: '.' };
    const result = validateMirrorStructure(module, undefined, tempDir);
    expect(result.orphanTests).toHaveLength(1);
    expect(result.orphanTests[0].testFile).toBe('test/foo.test.ts');
    expect(result.orphanTests[0].expectedSource).toBe('foo.ts');
    expect(result.orphanTests[0].expectedSourceRel).toBe('foo.ts');
  });

  it('T-15: expectedSourceRel is relative to module.path (distinct from expectedSource)', () => {
    writeFile('test/api/users.test.ts');
    const module: Module = { name: 'api', path: 'src/api', testPath: 'test/api' };
    mkdirSync(join(tempDir, 'src/api'), { recursive: true });
    const result = validateMirrorStructure(module, undefined, tempDir);
    expect(result.orphanTests).toHaveLength(1);
    expect(result.orphanTests[0].expectedSourceRel).toBe('users.ts');
    expect(result.orphanTests[0].expectedSource).toBe('src/api/users.ts');
  });
});
