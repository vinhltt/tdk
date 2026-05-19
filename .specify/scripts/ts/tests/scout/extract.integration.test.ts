import { describe, it, expect, beforeEach, afterEach } from 'bun:test';
import { tmpdir } from 'node:os';
import { mkdtempSync, rmSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { extractPack } from '../../src/commands/scout/extract';
import type { Tier1Result } from '../../src/commands/scout/types';

describe('extract.integration (Tier 1)', () => {
  let tempDir: string;

  beforeEach(() => {
    tempDir = mkdtempSync(join(tmpdir(), 'tdk-scout-'));
  });

  afterEach(() => {
    rmSync(tempDir, { recursive: true, force: true });
  });

  it('TS-only fixture → 5 files with imports/exports', () => {
    const out = join(tempDir, 'tier1.json');
    const fixture = join(import.meta.dir, 'fixtures', 'sample-pack-ts.md');
    const result = extractPack(fixture, out);

    expect(result.totalFiles).toBe(5);
    const idx = result.files.find((f) => f.path === 'src/index.ts');
    expect(idx).toBeDefined();
    expect(idx?.imports).toContain('./foo');
    expect(idx?.imports).toContain('zod');
    expect(idx?.exports).toContain('main');
    expect(idx?.exports).toContain('Service');

    const onDisk = JSON.parse(readFileSync(out, 'utf-8')) as Tier1Result;
    expect(onDisk.totalFiles).toBe(5);
    expect(onDisk.tier1GeneratedAt).toMatch(/^\d{4}-\d{2}-\d{2}T/);
  });

  it('mixed languages → per-language symbols extracted', () => {
    const out = join(tempDir, 'tier1.json');
    const fixture = join(import.meta.dir, 'fixtures', 'sample-pack-mixed.md');
    const result = extractPack(fixture, out);

    expect(result.totalFiles).toBe(4);
    const py = result.files.find((f) => f.path === 'scripts/build.py');
    expect(py?.imports.sort()).toEqual(['json', 'os', 'pathlib', 'sys']);
    expect(py?.exports).toContain('Builder');
    expect(py?.exports).not.toContain('_private');

    const go = result.files.find((f) => f.path === 'cmd/server.go');
    expect(go?.exports).toContain('Run');
    expect(go?.exports).toContain('Server');
    expect(go?.exports).not.toContain('privateHelper');

    const md = result.files.find((f) => f.path === 'README.md');
    expect(md?.imports).toEqual([]);
    expect(md?.exports).toEqual([]);
  });

  it('writes tree + totals + iso timestamp', () => {
    const out = join(tempDir, 'tier1.json');
    const fixture = join(import.meta.dir, 'fixtures', 'sample-pack-ts.md');
    const result = extractPack(fixture, out, { scope: 'demo' });
    expect(result.scope).toBe('demo');
    expect(result.totalLoc).toBeGreaterThan(0);
    expect(result.totalTokens).toBeGreaterThan(0);
    expect(result.tree).toBeDefined();
    expect(result.unparsed).toEqual([]);
  });
});
