import { describe, it, expect, beforeEach, afterEach } from 'bun:test';
import { mkdtempSync, rmSync, writeFileSync, mkdirSync } from 'node:fs';
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
      });

      expect(extractCalled).toBe(false);
      expect(result.cacheHit).toBe(true);
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
