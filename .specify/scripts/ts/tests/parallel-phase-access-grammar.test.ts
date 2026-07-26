import { afterEach, beforeEach, describe, expect, it } from 'bun:test';
import { mkdirSync, mkdtempSync, realpathSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { extractPhaseAccess } from '../src/commands/util/parallel-phase-access-grammar';

let root: string;

function file(relPath: string, contents = 'x'): void {
  const abs = join(root, relPath);
  mkdirSync(dirname(abs), { recursive: true });
  writeFileSync(abs, contents);
}

function dir(relPath: string): void {
  mkdirSync(join(root, relPath), { recursive: true });
}

function codes(errors: { code: string }[]): string[] {
  return errors.map((e) => e.code);
}

function phaseMarkdown(sectionBody: string): string {
  return [
    '---',
    'parallel_safe: auto',
    '---',
    '',
    '# Phase X',
    '',
    '## Related Code Files',
    '',
    sectionBody,
    '',
    '## Implementation Steps',
    '',
    '1. Do the thing.',
    '',
  ].join('\n');
}

beforeEach(() => {
  root = realpathSync.native(mkdtempSync(join(tmpdir(), 'tdk-access-grammar-')));
});

afterEach(() => {
  rmSync(root, { recursive: true, force: true });
});

describe('extractPhaseAccess', () => {
  it('complete-read-plus-writes: parses every action with zero errors', () => {
    file('docs/readme.md');
    file('src/existing.ts');
    file('src/old-file.ts');
    const md = phaseMarkdown(
      [
        '- Read: `docs/readme.md`',
        '- Modify: `src/existing.ts`',
        '- Create: `src/new-file.ts`',
        '- Delete: `src/old-file.ts`',
      ].join('\n')
    );
    const result = extractPhaseAccess(md, root);
    expect(result.errors).toEqual([]);
    expect(result.reads).toEqual(['docs/readme.md']);
    expect(result.writes).toEqual([
      { action: 'Modify', path: 'src/existing.ts' },
      { action: 'Create', path: 'src/new-file.ts' },
      { action: 'Delete', path: 'src/old-file.ts' },
    ]);
  });

  it('read-only: parses with zero writes and zero errors (mode-gating happens elsewhere)', () => {
    file('docs/readme.md');
    const md = phaseMarkdown('- Read: `docs/readme.md`');
    const result = extractPhaseAccess(md, root);
    expect(result.errors).toEqual([]);
    expect(result.writes).toEqual([]);
    expect(result.reads).toEqual(['docs/readme.md']);
  });

  it('missing section: reports MISSING_ACCESS_SECTION', () => {
    const md = ['---', 'parallel_safe: auto', '---', '', '# Phase X', '', '## Implementation Steps', ''].join('\n');
    const result = extractPhaseAccess(md, root);
    expect(codes(result.errors)).toContain('MISSING_ACCESS_SECTION');
    expect(result.reads).toEqual([]);
    expect(result.writes).toEqual([]);
  });

  it('duplicate section: reports DUPLICATE_ACCESS_SECTION', () => {
    file('src/existing.ts');
    const md = [
      '# Phase X',
      '',
      '## Related Code Files',
      '- Modify: `src/existing.ts`',
      '',
      '## Related Code Files',
      '- Modify: `src/existing.ts`',
      '',
    ].join('\n');
    const result = extractPhaseAccess(md, root);
    expect(codes(result.errors)).toContain('DUPLICATE_ACCESS_SECTION');
  });

  it('duplicate path: same path declared twice under the same action', () => {
    file('src/existing.ts');
    const md = phaseMarkdown(['- Modify: `src/existing.ts`', '- Modify: `src/existing.ts`'].join('\n'));
    const result = extractPhaseAccess(md, root);
    expect(codes(result.errors)).toContain('DUPLICATE_ACCESS_PATH');
    expect(result.writes).toEqual([{ action: 'Modify', path: 'src/existing.ts' }]);
  });

  it('cross-action path: same path declared under two different actions', () => {
    file('src/existing.ts');
    const md = phaseMarkdown(['- Modify: `src/existing.ts`', '- Delete: `src/existing.ts`'].join('\n'));
    const result = extractPhaseAccess(md, root);
    expect(codes(result.errors)).toContain('CROSS_ACTION_ACCESS_PATH');
  });

  it('combined-action: rejects a bullet naming two actions', () => {
    file('src/existing.ts');
    const md = phaseMarkdown('- Modify, Create: `src/existing.ts`');
    const result = extractPhaseAccess(md, root);
    expect(codes(result.errors)).toContain('COMBINED_ACTION');
    expect(result.writes).toEqual([]);
  });

  it('glob: rejects a wildcard path', () => {
    const md = phaseMarkdown('- Modify: `src/*.ts`');
    const result = extractPhaseAccess(md, root);
    expect(codes(result.errors)).toContain('GLOB_ACCESS_PATH');
  });

  it('placeholder: rejects an unedited template placeholder', () => {
    const md = phaseMarkdown('- Modify: `[path/to/file]`');
    const result = extractPhaseAccess(md, root);
    expect(codes(result.errors)).toContain('PLACEHOLDER_ACCESS_PATH');
  });

  it('existing directory: rejects a Modify target that is a directory', () => {
    dir('src');
    const md = phaseMarkdown('- Modify: `src`');
    const result = extractPhaseAccess(md, root);
    expect(codes(result.errors)).toContain('ACCESS_TARGET_IS_DIRECTORY');
  });

  it('extensionless-create: accepts an absent exact extensionless file name', () => {
    const md = phaseMarkdown('- Create: `Dockerfile`');
    const result = extractPhaseAccess(md, root);
    expect(result.errors).toEqual([]);
    expect(result.writes).toEqual([{ action: 'Create', path: 'Dockerfile' }]);
  });

  it('unbackticked: rejects a path without backticks', () => {
    file('src/existing.ts');
    const md = phaseMarkdown('- Modify: src/existing.ts');
    const result = extractPhaseAccess(md, root);
    expect(codes(result.errors)).toContain('UNBACKTICKED_ACCESS_PATH');
    expect(result.writes).toEqual([]);
  });

  it('rejects a Create target that already exists', () => {
    file('src/existing.ts');
    const md = phaseMarkdown('- Create: `src/existing.ts`');
    const result = extractPhaseAccess(md, root);
    expect(codes(result.errors)).toContain('ACCESS_TARGET_ALREADY_EXISTS');
  });

  it('rejects a Create target with a trailing separator', () => {
    const md = phaseMarkdown('- Create: `src/newdir/`');
    const result = extractPhaseAccess(md, root);
    expect(codes(result.errors)).toContain('ACCESS_TARGET_TRAILING_SEPARATOR');
  });

  it('rejects a Modify target that does not exist', () => {
    const md = phaseMarkdown('- Modify: `src/missing.ts`');
    const result = extractPhaseAccess(md, root);
    expect(codes(result.errors)).toContain('ACCESS_TARGET_NOT_FOUND');
  });
});
