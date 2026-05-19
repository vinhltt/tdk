import { describe, it, expect, beforeEach, afterEach } from 'bun:test';
import { mkdtempSync, rmSync, writeFileSync, mkdirSync, utimesSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { resolveCachePaths, isTier1CacheValid } from '../../src/commands/scout/cache-resolver';

describe('cache-resolver', () => {
  let tempDir: string;
  beforeEach(() => {
    tempDir = mkdtempSync(join(tmpdir(), 'scout-cache-'));
    mkdirSync(join(tempDir, '.specify'));
  });
  afterEach(() => { rmSync(tempDir, { recursive: true, force: true }); });

  it('creates cache root and returns paths', () => {
    const p = resolveCachePaths({ scopeKey: 'demo', cwd: tempDir });
    expect(p.cacheRoot).toContain('.specify/cache/tdk-scout');
    expect(p.packPath).toContain('demo.md');
    expect(p.tier1JsonPath).toContain('demo-tier1.json');
  });

  it('honours packPathOverride', () => {
    const p = resolveCachePaths({
      scopeKey: 'x',
      cwd: tempDir,
      packPathOverride: '/tmp/abc.md',
    });
    expect(p.packPath).toBe('/tmp/abc.md');
  });

  it('isTier1CacheValid: returns false when JSON missing', () => {
    const pack = join(tempDir, 'pack.md');
    writeFileSync(pack, 'pack');
    expect(isTier1CacheValid(join(tempDir, 'missing.json'), pack)).toBe(false);
  });

  it('isTier1CacheValid: returns false when JSON older than pack', () => {
    const pack = join(tempDir, 'p.md');
    const json = join(tempDir, 'p.json');
    writeFileSync(json, '{}');
    writeFileSync(pack, 'pack');
    const past = new Date(Date.now() - 60_000);
    utimesSync(json, past, past);
    expect(isTier1CacheValid(json, pack)).toBe(false);
  });

  it('isTier1CacheValid: returns true when JSON newer than pack', () => {
    const pack = join(tempDir, 'p.md');
    const json = join(tempDir, 'p.json');
    writeFileSync(pack, 'pack');
    const past = new Date(Date.now() - 60_000);
    utimesSync(pack, past, past);
    writeFileSync(json, '{}');
    expect(isTier1CacheValid(json, pack)).toBe(true);
  });
});
