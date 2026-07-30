import { describe, it, expect, beforeEach, afterEach } from 'bun:test';
import { mkdtempSync, rmSync, writeFileSync, mkdirSync, readFileSync, utimesSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { runScout } from '../../src/commands/scout/index';
import { validateArgs } from '../../src/commands/scout/args-validator';

describe('runScout (integration with mocks)', () => {
  let tempDir: string;
  beforeEach(() => {
    tempDir = mkdtempSync(join(tmpdir(), 'scout-run-'));
    mkdirSync(join(tempDir, '.specify'));
  });
  afterEach(() => { rmSync(tempDir, { recursive: true, force: true }); });

  it('scope mode: invokes repomix + extract; emits result', () => {
    const cwd = process.cwd();
    process.chdir(tempDir);
    try {
      let repomixCalled = false;
      let extractCalled = false;

      const args = validateArgs({ scope: tempDir, taskHint: 'auth' });
      const result = runScout(args, {
        runRepomix: (opts) => {
          repomixCalled = true;
          writeFileSync(opts.outputPath, '# pack');
          return opts.outputPath;
        },
        extractPack: (_pack, out) => {
          extractCalled = true;
          writeFileSync(out, '{}');
          return {
            scope: 'x', totalFiles: 0, totalLoc: 0, totalTokens: 0,
            tier1GeneratedAt: 'now', files: [], tree: {}, unparsed: [],
          };
        },
        isTier1CacheValid: () => false,
      });

      expect(repomixCalled).toBe(true);
      expect(extractCalled).toBe(true);
      expect(result.cacheHit).toBe(false);
      expect(result.taskHint).toBe('auth');
      expect(result.tier1JsonPath).toContain('-tier1.json');
    } finally {
      process.chdir(cwd);
    }
  });

  it('scope mode: forwards include/ignore patterns to repomix', () => {
    const cwd = process.cwd();
    process.chdir(tempDir);
    try {
      let seenInclude: string[] | undefined;
      let seenIgnore: string[] | undefined;

      const args = validateArgs({
        scope: tempDir,
        include: 'src/**/*.ts, *.md',
        ignore: '**/*.test.ts',
      });
      runScout(args, {
        runRepomix: (opts) => {
          seenInclude = opts.include;
          seenIgnore = opts.ignore;
          writeFileSync(opts.outputPath, '# pack');
          return opts.outputPath;
        },
        extractPack: (_pack, out) => {
          writeFileSync(out, '{}');
          return {
            scope: 'x', totalFiles: 0, totalLoc: 0, totalTokens: 0,
            tier1GeneratedAt: 'now', files: [], tree: {}, unparsed: [],
          };
        },
        isTier1CacheValid: () => false,
      });

      expect(seenInclude).toEqual(['src/**/*.ts', '*.md']);
      expect(seenIgnore).toEqual(['**/*.test.ts']);
    } finally {
      process.chdir(cwd);
    }
  });

  it('scope mode: leaves repomix pattern opts undefined when flags absent', () => {
    const cwd = process.cwd();
    process.chdir(tempDir);
    try {
      let seen: { include?: string[]; ignore?: string[] } | undefined;

      const args = validateArgs({ scope: tempDir });
      runScout(args, {
        runRepomix: (opts) => {
          seen = { include: opts.include, ignore: opts.ignore };
          writeFileSync(opts.outputPath, '# pack');
          return opts.outputPath;
        },
        extractPack: (_pack, out) => {
          writeFileSync(out, '{}');
          return {
            scope: 'x', totalFiles: 0, totalLoc: 0, totalTokens: 0,
            tier1GeneratedAt: 'now', files: [], tree: {}, unparsed: [],
          };
        },
        isTier1CacheValid: () => false,
      });

      expect(seen?.include).toBeUndefined();
      expect(seen?.ignore).toBeUndefined();
    } finally {
      process.chdir(cwd);
    }
  });

  it('cache hit: skips extract', () => {
    const cwd = process.cwd();
    process.chdir(tempDir);
    try {
      const packFile = join(tempDir, 'p.md');
      writeFileSync(packFile, '# pack');

      let extractCalled = false;
      const args = validateArgs({ fromPack: packFile });
      const result = runScout(args, {
        runRepomix: () => { throw new Error('should not run repomix'); },
        extractPack: () => {
          extractCalled = true;
          return {
            scope: 'x', totalFiles: 0, totalLoc: 0, totalTokens: 0,
            tier1GeneratedAt: 'now', files: [], tree: {}, unparsed: [],
          };
        },
        isTier1CacheValid: () => true,
        readTier1Summary: () => ({ totalFiles: 12 }),
      });

      expect(extractCalled).toBe(false);
      expect(result.cacheHit).toBe(true);
    } finally {
      process.chdir(cwd);
    }
  });

  // Two scope runs with different --include resolve to the same pack path, so reusing a cached
  // result across them would hand the second run the first run's differently-filtered files.
  // Uses the real isTier1CacheValid rather than a mock — the reuse is prevented by the mtime
  // comparison itself, so mocking it away would test nothing.
  it('scope runs with different --include never reuse each other tier 1 output', () => {
    const cwd = process.cwd();
    process.chdir(tempDir);
    try {
      const extractedPacks: string[] = [];

      const run = (include: string) => runScout(validateArgs({ scope: tempDir, include }), {
        runRepomix: (opts) => {
          writeFileSync(opts.outputPath, `# pack ${opts.include?.join(',')}`);
          // repomix always finishes after any earlier extract, so the pack is the newer file.
          // Mock writes land in the same millisecond, which would not reproduce that.
          const after = new Date(Date.now() + 2000);
          utimesSync(opts.outputPath, after, after);
          return opts.outputPath;
        },
        extractPack: (pack, out) => {
          extractedPacks.push(readFileSync(pack, 'utf-8'));
          const result = {
            scope: 'x', totalFiles: 1, totalLoc: 0, totalTokens: 0,
            tier1GeneratedAt: 'now', files: [], tree: {}, unparsed: [],
          };
          writeFileSync(out, JSON.stringify(result));
          return result;
        },
      });

      const first = run('src/**');
      const second = run('docs/**');

      expect(first.packPath).toBe(second.packPath);
      expect(first.cacheHit).toBe(false);
      expect(second.cacheHit).toBe(false);
      expect(extractedPacks).toEqual(['# pack src/**', '# pack docs/**']);
    } finally {
      process.chdir(cwd);
    }
  });

  it('forceRefresh bypasses cache', () => {
    const cwd = process.cwd();
    process.chdir(tempDir);
    try {
      const packFile = join(tempDir, 'p.md');
      writeFileSync(packFile, '# pack');

      let extractCalled = false;
      const args = validateArgs({ fromPack: packFile, forceRefresh: true });
      runScout(args, {
        extractPack: (_p, out) => {
          extractCalled = true;
          writeFileSync(out, '{}');
          return {
            scope: 'x', totalFiles: 0, totalLoc: 0, totalTokens: 0,
            tier1GeneratedAt: 'now', files: [], tree: {}, unparsed: [],
          };
        },
        isTier1CacheValid: () => true,
      });

      expect(extractCalled).toBe(true);
    } finally {
      process.chdir(cwd);
    }
  });
});
