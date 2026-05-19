// Mirror structure validator — detect orphan tests under mirror strategy.
// Pure function: scans `module.testPath` (default 'test') for test files, verifies
// each has a matching source file under `module.path`. Orphans surfaced to caller.

import { Glob } from 'bun';
import { existsSync } from 'node:fs';
import path from 'node:path';
import type { Module, TestMapping } from './types';

const TS_JS_EXT_GROUP = '{ts,tsx,mts,cts,js,jsx,mjs,cjs}';
const TEST_FILE_PATTERN = `**/*.{test,spec}.${TS_JS_EXT_GROUP}`;

export type OrphanTest = {
  testFile: string;           // POSIX path relative to baseDir (sub-workspace root)
  expectedSource: string;     // POSIX path relative to baseDir — for display / `touch` commands
  expectedSourceRel: string;  // POSIX path relative to module.path — matches exclude.source patterns
};

export type MirrorValidatorResult = {
  orphanTests: OrphanTest[];
};

// Normalize to POSIX separators + strip trailing slash.
export function toPosixPath(p: string): string {
  return p.replace(/\\/g, '/').replace(/\/+$/, '');
}

// Strip `.test.` or `.spec.` segment, preserving extension.
// 'Button.test.tsx' -> 'Button.tsx' | 'Button.spec.ts' -> 'Button.ts'
export function stripTestSuffix(filename: string): string {
  return filename.replace(/\.(test|spec)(?=\.[^.]+$)/, '');
}

// Iterate patterns (A6: avoid Glob alternation `{a,b}` to allow literal commas in user patterns).
function matchesAny(patterns: string[], file: string): boolean {
  if (patterns.length === 0) return false;
  for (const p of patterns) {
    if (new Glob(p).match(file)) return true;
  }
  return false;
}

// `baseDir` is the absolute sub-workspace root — used to resolve filesystem paths
// without mutating process.cwd(). Defaults to CWD for back-compat in unit tests.
export function validateMirrorStructure(
  module: Module,
  exclude: NonNullable<TestMapping['exclude']> | undefined,
  baseDir?: string,
): MirrorValidatorResult {
  const effectiveTestPath = toPosixPath(module.testPath ?? 'test');
  const modulePath = toPosixPath(module.path);

  const absTestPath = baseDir
    ? path.resolve(baseDir, effectiveTestPath)
    : effectiveTestPath;
  const absModulePath = baseDir
    ? path.resolve(baseDir, modulePath)
    : modulePath;

  const testPatterns = exclude?.test ?? [];
  const sourcePatterns = exclude?.source ?? [];

  const testGlob = new Glob(TEST_FILE_PATTERN);
  const orphanTests: OrphanTest[] = [];

  for (const relTest of testGlob.scanSync(absTestPath)) {
    const posixTest = toPosixPath(relTest);
    if (matchesAny(testPatterns, posixTest)) continue;

    const expectedSourceRel = stripTestSuffix(posixTest);
    if (matchesAny(sourcePatterns, expectedSourceRel)) continue;

    const absExpectedSource = path.resolve(absModulePath, expectedSourceRel);
    if (existsSync(absExpectedSource)) continue;

    orphanTests.push({
      testFile: path.posix.join(effectiveTestPath, posixTest),
      expectedSource: path.posix.join(modulePath, expectedSourceRel),
      expectedSourceRel,
    });
  }

  return { orphanTests };
}
