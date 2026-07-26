import { afterEach, beforeEach, describe, expect, it } from 'bun:test';
import { execFileSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, realpathSync, rmSync, symlinkSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import {
  canonicalizeAccessPath,
  checkGitIgnoredWrite,
  findNearestExistingAncestor,
  walkProjectPath,
} from '../src/commands/util/parallel-phase-path-policy';

let root: string;

beforeEach(() => {
  root = realpathSync.native(mkdtempSync(join(tmpdir(), 'tdk-path-policy-')));
});

afterEach(() => {
  rmSync(root, { recursive: true, force: true });
});

describe('canonicalizeAccessPath', () => {
  it('accepts a project-relative path', () => {
    const result = canonicalizeAccessPath(root, 'src/foo.ts');
    expect(result.ok).toBe(true);
    expect(result.relativePath).toBe('src/foo.ts');
  });

  it('accepts an in-root absolute path', () => {
    const result = canonicalizeAccessPath(root, join(root, 'src/foo.ts'));
    expect(result.ok).toBe(true);
    expect(result.relativePath).toBe('src/foo.ts');
  });

  it('rejects a relative root escape', () => {
    const result = canonicalizeAccessPath(root, '../outside.ts');
    expect(result.ok).toBe(false);
    expect(result.reason).toBe('root-escape');
  });

  it('rejects an absolute path outside the project root', () => {
    const result = canonicalizeAccessPath(root, '/etc/passwd');
    expect(result.ok).toBe(false);
    expect(result.reason).toBe('root-escape');
  });

  it('rejects the project root itself (empty relative path)', () => {
    const result = canonicalizeAccessPath(root, root);
    expect(result.ok).toBe(false);
    expect(result.reason).toBe('root-escape');
  });

  it('rejects an empty path', () => {
    const result = canonicalizeAccessPath(root, '');
    expect(result.ok).toBe(false);
    expect(result.reason).toBe('empty-path');
  });

  it('rejects a drive-letter path', () => {
    const result = canonicalizeAccessPath(root, 'C:\\Users\\file.ts');
    expect(result.ok).toBe(false);
    expect(result.reason).toBe('drive-letter-path');
  });

  it('rejects a UNC path', () => {
    const result = canonicalizeAccessPath(root, '//server/share/file.ts');
    expect(result.ok).toBe(false);
    expect(result.reason).toBe('unc-path');
  });

  it('rejects a bare backslash path', () => {
    const result = canonicalizeAccessPath(root, 'src\\foo.ts');
    expect(result.ok).toBe(false);
    expect(result.reason).toBe('backslash-path');
  });

  it('reports a trailing separator and strips it from the canonical form', () => {
    const result = canonicalizeAccessPath(root, 'src/dir/');
    expect(result.ok).toBe(true);
    expect(result.relativePath).toBe('src/dir');
    expect(result.hadTrailingSeparator).toBe(true);
  });

  it('does not report a trailing separator for a normal path', () => {
    const result = canonicalizeAccessPath(root, 'src/dir');
    expect(result.hadTrailingSeparator).toBe(false);
  });

  it('accepts an exact extensionless file name', () => {
    const result = canonicalizeAccessPath(root, 'Dockerfile');
    expect(result.ok).toBe(true);
    expect(result.relativePath).toBe('Dockerfile');
  });
});

describe('walkProjectPath', () => {
  it('reports an existing non-directory target', () => {
    writeFileSync(join(root, 'file.ts'), 'x');
    const result = walkProjectPath(root, 'file.ts');
    expect(result).toEqual({ exists: true, isDirectory: false, symlinkComponent: false });
  });

  it('reports an absent target', () => {
    const result = walkProjectPath(root, 'missing.ts');
    expect(result).toEqual({ exists: false, isDirectory: false, symlinkComponent: false });
  });

  it('reports an existing directory', () => {
    mkdirSync(join(root, 'adir'));
    const result = walkProjectPath(root, 'adir');
    expect(result).toEqual({ exists: true, isDirectory: true, symlinkComponent: false });
  });

  it('rejects a symlink leaf', () => {
    writeFileSync(join(root, 'real.ts'), 'x');
    symlinkSync(join(root, 'real.ts'), join(root, 'link.ts'));
    const result = walkProjectPath(root, 'link.ts');
    expect(result.symlinkComponent).toBe(true);
  });

  it('rejects a symlink ancestor', () => {
    mkdirSync(join(root, 'realdir'));
    writeFileSync(join(root, 'realdir', 'file.ts'), 'x');
    symlinkSync(join(root, 'realdir'), join(root, 'linkdir'));
    const result = walkProjectPath(root, 'linkdir/file.ts');
    expect(result.symlinkComponent).toBe(true);
  });

  it('validates the nearest existing ancestor for an absent nested target', () => {
    mkdirSync(join(root, 'existingdir'));
    const result = walkProjectPath(root, 'existingdir/newfile.ts');
    expect(result).toEqual({ exists: false, isDirectory: false, symlinkComponent: false });
  });
});

describe('findNearestExistingAncestor', () => {
  it('returns the existing parent directory for an absent nested target', () => {
    mkdirSync(join(root, 'existingdir'));
    expect(findNearestExistingAncestor(root, 'existingdir/newfile.ts')).toBe(join(root, 'existingdir'));
  });

  it('returns the project root when even the immediate parent is absent', () => {
    expect(findNearestExistingAncestor(root, 'missingdir/newfile.ts')).toBe(root);
  });

  it('returns the full path when the target itself exists', () => {
    writeFileSync(join(root, 'file.ts'), 'x');
    expect(findNearestExistingAncestor(root, 'file.ts')).toBe(join(root, 'file.ts'));
  });
});

describe('checkGitIgnoredWrite', () => {
  it('denies a git-ignored path', () => {
    execFileSync('git', ['init', '-q'], { cwd: root });
    writeFileSync(join(root, '.gitignore'), 'ignored.txt\n');
    writeFileSync(join(root, 'ignored.txt'), 'x');
    expect(checkGitIgnoredWrite(root, 'ignored.txt')).toBe('ignored');
  });

  it('allows a non-ignored path', () => {
    execFileSync('git', ['init', '-q'], { cwd: root });
    writeFileSync(join(root, '.gitignore'), 'ignored.txt\n');
    writeFileSync(join(root, 'tracked.ts'), 'x');
    expect(checkGitIgnoredWrite(root, 'tracked.ts')).toBe('not-ignored');
  });

  it('fails closed when git reports a fatal error (not a repository)', () => {
    writeFileSync(join(root, 'file.ts'), 'x');
    expect(checkGitIgnoredWrite(root, 'file.ts')).toBe('error');
  });
});
