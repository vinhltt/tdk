import { describe, it, expect, beforeEach, afterEach } from 'bun:test';
import { mkdtempSync, rmSync, writeFileSync, mkdirSync, utimesSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { resolveCachePaths, readTier1Cache } from '../../src/commands/scout/cache-resolver';
import { TIER1_VERSION } from '../../src/commands/scout/types';

describe('cache-resolver', () => {
  let tempDir: string;
  beforeEach(() => {
    tempDir = mkdtempSync(join(tmpdir(), 'scout-cache-'));
    mkdirSync(join(tempDir, '.specify'));
  });
  afterEach(() => { rmSync(tempDir, { recursive: true, force: true }); });

  it('creates cache root and returns paths', () => {
    const p = resolveCachePaths({ scopeKey: 'demo', cwd: tempDir });
    expect(p.cacheRoot).toContain(join('.specify', 'cache', 'tdk-scout'));
    expect(p.packPath).toContain('demo.md');
    expect(p.tier1JsonPath).toContain('demo-tier1.json');
  });

  it('honours packPathOverride', () => {
    const p = resolveCachePaths({
      scopeKey: 'x',
      cwd: tempDir,
      packPathOverride: '/tmp/abc.md',
    });
    expect(p.packPath).toBe(resolve('/tmp/abc.md'));
  });

  it('does not load a missing cache', () => {
    const pack = join(tempDir, 'pack.md');
    writeFileSync(pack, 'pack');
    expect(readTier1Cache(join(tempDir, 'missing.json'), pack)).toBeUndefined();
  });

  it('does not load a cache older than its pack', () => {
    const pack = join(tempDir, 'p.md');
    const json = join(tempDir, 'p.json');
    writeFileSync(json, JSON.stringify({ tier1Version: TIER1_VERSION }));
    writeFileSync(pack, 'pack');
    const past = new Date(Date.now() - 60_000);
    utimesSync(json, past, past);
    expect(readTier1Cache(json, pack)).toBeUndefined();
  });

  it('loads current-version data only when newer than its pack', () => {
    const pack = join(tempDir, 'p.md');
    const json = join(tempDir, 'p.json');
    writeFileSync(pack, 'pack');
    const past = new Date(Date.now() - 60_000);
    utimesSync(pack, past, past);
    const cached = { tier1Version: TIER1_VERSION, totalFiles: 1, files: [{ path: 'main.ts' }] };
    writeFileSync(json, JSON.stringify(cached));
    expect(readTier1Cache(json, pack)).toEqual(cached);
  });

  it('invalidates fresh legacy, stale-version, future-version, and malformed caches', () => {
    const pack = join(tempDir, 'p.md');
    const json = join(tempDir, 'p.json');
    writeFileSync(pack, 'pack');
    const past = new Date(Date.now() - 60_000);
    utimesSync(pack, past, past);
    for (const content of ['{}', '{"tier1Version":1}', '{"tier1Version":999}', 'broken', 'null']) {
      writeFileSync(json, content);
      expect(readTier1Cache(json, pack)).toBeUndefined();
    }
  });
});
