import { describe, it, expect } from 'bun:test';
import { buildRepomixArgs } from '../../src/commands/scout/repomix-runner';

describe('buildRepomixArgs', () => {
  it('emits the base argv when no patterns are given', () => {
    expect(buildRepomixArgs({ scope: '/repo', outputPath: '/out/pack.md' }))
      .toEqual(['/repo', '--style', 'markdown', '-o', '/out/pack.md']);
  });

  it('joins include patterns into a single comma-separated arg value', () => {
    expect(buildRepomixArgs({
      scope: '/repo',
      outputPath: '/out/pack.md',
      include: ['src/**/*.ts', '*.md'],
    })).toEqual([
      '/repo', '--style', 'markdown', '-o', '/out/pack.md',
      '--include', 'src/**/*.ts,*.md',
    ]);
  });

  it('joins ignore patterns into a single comma-separated arg value', () => {
    expect(buildRepomixArgs({
      scope: '/repo',
      outputPath: '/out/pack.md',
      ignore: ['**/*.test.ts', 'dist/**'],
    })).toEqual([
      '/repo', '--style', 'markdown', '-o', '/out/pack.md',
      '--ignore', '**/*.test.ts,dist/**',
    ]);
  });

  it('appends include before ignore when both are given', () => {
    expect(buildRepomixArgs({
      scope: '/repo',
      outputPath: '/out/pack.md',
      include: ['src/**'],
      ignore: ['dist/**'],
    })).toEqual([
      '/repo', '--style', 'markdown', '-o', '/out/pack.md',
      '--include', 'src/**',
      '--ignore', 'dist/**',
    ]);
  });

  it('omits flags for empty pattern arrays', () => {
    expect(buildRepomixArgs({ scope: '/repo', outputPath: '/out/pack.md', include: [], ignore: [] }))
      .toEqual(['/repo', '--style', 'markdown', '-o', '/out/pack.md']);
  });
});
