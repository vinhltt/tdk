import { describe, it, expect, beforeEach, afterEach } from 'bun:test';
import { mkdtempSync, rmSync, writeFileSync, mkdirSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import type { Tier1Result } from '../../src/commands/scout/types';
import { runScout } from '../../src/commands/scout/index';
import { validateArgs } from '../../src/commands/scout/args-validator';

const CLI_ENTRY = resolve(import.meta.dir, '../../src/index.ts');

function tier1(totalFiles: number): Tier1Result {
  return {
    scope: 'x', totalFiles, totalLoc: 0, totalTokens: 0,
    tier1GeneratedAt: 'now', files: [], tree: {}, unparsed: [],
  };
}

/** Minimal repomix markdown pack with `count` file blocks. */
function packWithFiles(count: number): string {
  let out = '# pack\n\n';
  for (let i = 0; i < count; i++) {
    out += `## File: f${i}.ts\n\`\`\`ts\nexport const v${i} = ${i};\n\`\`\`\n\n`;
  }
  return out;
}

function captureStderr(fn: () => void): string {
  const original = process.stderr.write.bind(process.stderr);
  let captured = '';
  process.stderr.write = ((chunk: string) => { captured += chunk; return true; }) as typeof process.stderr.write;
  try {
    fn();
  } finally {
    process.stderr.write = original;
  }
  return captured;
}

describe('scout size gate', () => {
  let tempDir: string;
  let packFile: string;
  beforeEach(() => {
    tempDir = mkdtempSync(join(tmpdir(), 'scout-gate-'));
    mkdirSync(join(tempDir, '.specify'));
    packFile = join(tempDir, 'p.md');
    writeFileSync(packFile, '# pack');
  });
  afterEach(() => { rmSync(tempDir, { recursive: true, force: true }); });

  function withTempCwd<T>(fn: () => T): T {
    const cwd = process.cwd();
    process.chdir(tempDir);
    try {
      return fn();
    } finally {
      process.chdir(cwd);
    }
  }

  it('passes just under the ceiling', () => {
    withTempCwd(() => {
      const args = validateArgs({ fromPack: packFile });
      const result = runScout(args, {
        extractPack: (_p, out) => { writeFileSync(out, '{}'); return tier1(800); },
        isTier1CacheValid: () => false,
      });
      expect(result.cacheHit).toBe(false);
    });
  });

  it('throws just over the ceiling, naming the count and the limit', () => {
    withTempCwd(() => {
      const args = validateArgs({ fromPack: packFile });
      expect(() => runScout(args, {
        extractPack: (_p, out) => { writeFileSync(out, '{}'); return tier1(801); },
        isTier1CacheValid: () => false,
      })).toThrow(/801 files exceeds the limit of 800/);
    });
  });

  it('suggests --scope in the failure message', () => {
    withTempCwd(() => {
      const args = validateArgs({ fromPack: packFile });
      expect(() => runScout(args, {
        extractPack: (_p, out) => { writeFileSync(out, '{}'); return tier1(5000); },
        isTier1CacheValid: () => false,
      })).toThrow(/--scope <subdir>/);
    });
  });

  it('still throws on a warm cache hit (no re-extract to catch it)', () => {
    withTempCwd(() => {
      const args = validateArgs({ fromPack: packFile });
      expect(() => runScout(args, {
        extractPack: () => { throw new Error('should not extract on cache hit'); },
        isTier1CacheValid: () => true,
        readTier1Summary: () => ({ totalFiles: 1200 }),
      })).toThrow(/1200 files exceeds the limit of 800/);
    });
  });

  it('refuses a cached tier 1 JSON with no usable file count instead of passing it', () => {
    withTempCwd(() => {
      const args = validateArgs({ fromPack: packFile });
      const cacheDir = join(tempDir, '.specify/cache/tdk-scout');
      mkdirSync(cacheDir, { recursive: true });
      writeFileSync(join(cacheDir, 'p-tier1.json'), '{"scope":"p"}');
      expect(() => runScout(args, {
        extractPack: () => { throw new Error('should not extract on cache hit'); },
        isTier1CacheValid: () => true,
      })).toThrow(/no usable totalFiles/);
    });
  });

  it('warns on a large pack without failing the run', () => {
    withTempCwd(() => {
      writeFileSync(packFile, 'x'.repeat(1_000_001));
      const args = validateArgs({ fromPack: packFile });
      const stderr = captureStderr(() => {
        const result = runScout(args, {
          extractPack: (_p, out) => { writeFileSync(out, '{}'); return tier1(10); },
          isTier1CacheValid: () => false,
        });
        expect(result.cacheHit).toBe(false);
      });
      expect(stderr).toContain('warning: pack is 1000001 bytes');
      expect(stderr).toContain('approximate');
    });
  });

  it('does not warn on a small pack', () => {
    withTempCwd(() => {
      const args = validateArgs({ fromPack: packFile });
      const stderr = captureStderr(() => {
        runScout(args, {
          extractPack: (_p, out) => { writeFileSync(out, '{}'); return tier1(10); },
          isTier1CacheValid: () => false,
        });
      });
      expect(stderr).not.toContain('warning: pack is');
    });
  });

  it('exits non-zero with no JSON on stdout for an oversize --from-pack run', () => {
    writeFileSync(packFile, packWithFiles(801));
    const run = () => Bun.spawnSync({
      cmd: ['bun', CLI_ENTRY, 'scout', '--from-pack', packFile],
      cwd: tempDir,
      stdout: 'pipe',
      stderr: 'pipe',
    });

    const first = run();
    expect(first.exitCode).toBe(1);
    expect(first.stderr.toString()).toContain('801 files exceeds the limit of 800');
    expect(first.stdout.toString().trim()).toBe('');

    // The first run wrote the tier 1 JSON before failing, so this one takes the cache-hit
    // path and must be caught by the file count read back from that JSON, not by a re-extract.
    const second = run();
    expect(second.exitCode).toBe(1);
    expect(second.stderr.toString()).toContain('tier 1 cache hit');
    expect(second.stderr.toString()).toContain('801 files exceeds the limit of 800');
    expect(second.stdout.toString().trim()).toBe('');
  });
});
