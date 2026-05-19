import { describe, it, expect } from 'bun:test';
import { splitPack } from '../../src/commands/scout/pack-splitter';

describe('pack-splitter', () => {
  it('splits 2 files separated by 16-eq delimiter', () => {
    const pack = [
      '================',
      'File: a.ts',
      '================',
      'export const a = 1;',
      '',
      '================',
      'File: b.ts',
      '================',
      'export const b = 2;',
    ].join('\n');
    const blocks = splitPack(pack);
    expect(blocks).toHaveLength(2);
    expect(blocks[0]?.path).toBe('a.ts');
    expect(blocks[1]?.path).toBe('b.ts');
  });

  it('strips fenced code blocks if wrapping body', () => {
    const pack = [
      '================',
      'File: x.ts',
      '================',
      '```typescript',
      'export const x = 1;',
      '```',
    ].join('\n');
    const [b] = splitPack(pack);
    expect(b?.body).toBe('export const x = 1;');
  });

  it('handles 64-char delimiter (legacy repomix)', () => {
    const eq = '='.repeat(64);
    const pack = `${eq}\nFile: legacy.go\n${eq}\npackage main\n`;
    const blocks = splitPack(pack);
    expect(blocks).toHaveLength(1);
    expect(blocks[0]?.path).toBe('legacy.go');
  });

  it('returns empty array on no delimiters', () => {
    expect(splitPack('# just a markdown doc')).toEqual([]);
  });

  it('handles file paths with spaces', () => {
    const pack = '================\nFile: src/my dir/x.ts\n================\nbody\n';
    const [b] = splitPack(pack);
    expect(b?.path).toBe('src/my dir/x.ts');
  });

  it('parses repomix v1 markdown style (## File: ...)', () => {
    const pack = [
      '# Files',
      '',
      '## File: src/a.ts',
      '```typescript',
      'export const a = 1;',
      '```',
      '',
      '## File: src/b.ts',
      '```typescript',
      'export const b = 2;',
      '```',
      '',
    ].join('\n');
    const blocks = splitPack(pack);
    expect(blocks).toHaveLength(2);
    expect(blocks[0]?.path).toBe('src/a.ts');
    expect(blocks[0]?.body).toBe('export const a = 1;');
    expect(blocks[1]?.path).toBe('src/b.ts');
    expect(blocks[1]?.body).toBe('export const b = 2;');
  });
});
