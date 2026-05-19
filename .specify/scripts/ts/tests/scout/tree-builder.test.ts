import { describe, it, expect } from 'bun:test';
import { buildTree } from '../../src/commands/scout/tree-builder';

describe('tree-builder', () => {
  it('groups nested paths under directory keys', () => {
    const tree = buildTree(['src/a.ts', 'src/b.ts', 'src/utils/c.ts']);
    expect(tree['src']).toBeDefined();
    const src = tree['src'] as Record<string, unknown>;
    expect((src['__files__'] as string[]).sort()).toEqual(['a.ts', 'b.ts']);
    const utils = src['utils'] as Record<string, unknown>;
    expect(utils['__files__']).toEqual(['c.ts']);
  });

  it('handles root-level files', () => {
    const tree = buildTree(['README.md']);
    expect(tree['__files__']).toEqual(['README.md']);
  });

  it('caps siblings at 50, emits _more', () => {
    const paths = Array.from({ length: 60 }, (_, i) => `dir/file${i}.ts`);
    const tree = buildTree(paths);
    const dir = tree['dir'] as Record<string, unknown>;
    const files = dir['__files__'] as string[];
    expect(files).toHaveLength(51);
    expect(files[50]).toBe('_more: 10');
  });
});
