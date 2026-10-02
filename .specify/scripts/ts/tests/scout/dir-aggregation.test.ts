import { describe, it, expect, beforeEach, afterEach } from 'bun:test';
import { mkdtempSync, rmSync, writeFileSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { extractPack } from '../../src/commands/scout/extract';
import { aggregateTier1 } from '../../src/commands/scout/dir-aggregator';
import { buildTree } from '../../src/commands/scout/tree-builder';
import { MAX_AGGREGATED_BYTES, TIER1_VERSION, type FileEntry, type Tier1Result } from '../../src/commands/scout/types';

describe('directory aggregation', () => {
  let tempDir: string;
  beforeEach(() => { tempDir = mkdtempSync(join(tmpdir(), 'scout-dirs-')); });
  afterEach(() => { rmSync(tempDir, { recursive: true, force: true }); });

  function extract(entries: { path: string; body: string }[]): Tier1Result {
    const pack = join(tempDir, 'pack.md');
    const out = join(tempDir, 'tier1.json');
    writeFileSync(pack, '# pack\n' + entries.map(f => `## File: ${f.path}\n\`\`\`\n${f.body}\n\`\`\`\n`).join('\n'));
    const result = extractPack(pack, out, { scope: 'fixture' });
    expect(Buffer.byteLength(readFileSync(out, 'utf-8'))).toBeLessThanOrEqual(MAX_AGGREGATED_BYTES);
    return result;
  }

  it('keeps full totals and directed cross-directory dependencies, deduplicated per source file', () => {
    const entries = [
      { path: 'src/api/index.ts', body: "import { a } from '../lib/util';\nimport { b } from '../lib/helper.js';\nimport { run } from '../worker';\nimport z from 'zod';\nexport const main = a;" },
      { path: 'src/api/route.ts', body: "import { a } from '../lib/util';\nexport const route = a;" },
      { path: 'src/lib/util.ts', body: 'export const a = 1;' },
      { path: 'src/lib/helper.ts', body: 'export const b = 2;' },
      { path: 'src/worker/index.ts', body: 'export const run = 3;' },
      { path: 'README.md', body: 'entry guide' },
      ...Array.from({ length: 810 }, (_, i) => ({ path: `src/lib/f${i}.ts`, body: `export const v${i} = ${i};` })),
    ];
    const result = extract(entries);
    expect(result.totalFiles).toBe(entries.length);
    expect(result.aggregated!.reduce((n, d) => n + d.fileCount, 0)).toBe(entries.length);
    expect(result.aggregated!.reduce((n, d) => n + d.totalLoc, 0)).toBe(result.totalLoc);
    expect(result.aggregated!.reduce((n, d) => n + d.totalTokens, 0)).toBe(result.totalTokens);
    const api = result.aggregated!.find(d => d.path === 'src/api')!;
    expect(api.imports).toEqual([{ path: 'src/lib', fileCount: 2 }, { path: 'src/worker', fileCount: 1 }]);
    expect(result.aggregated!.find(d => d.path === 'src/lib')!.imports).toEqual([]);
    expect(result.aggregated!.find(d => d.path === '.')!.fileCount).toBe(1);
    expect(api.entryPoints).toContain('src/api/index.ts');
    const actualPaths = new Set(entries.map(f => f.path));
    for (const f of result.files) expect(actualPaths.has(f.path)).toBe(true);
    for (const d of result.aggregated!) {
      for (const path of d.entryPoints) expect(result.files.some(f => f.path === path)).toBe(true);
    }
  });

  it('coarsens a wide distribution without dropping files or changing representative metadata', () => {
    const entries = Array.from({ length: 1100 }, (_, i) => ({ path: `packages/p${i}/index.ts`, body: `export const value${i} = ${i};` }));
    const result = extract(entries);
    expect(result.aggregated!.reduce((n, d) => n + d.fileCount, 0)).toBe(1100);
    expect(result.aggregationDepth).toBeLessThan(2);
    expect(result.files.length).toBeLessThan(1100);
    for (const f of result.files) {
      const i = Number(f.path.match(/p(\d+)/)![1]);
      expect(f.exports).toEqual([`value${i}`]);
      expect(f.symbols).toEqual([`value${i}`]);
      expect(f.loc).toBe(1);
    }
  });

  it('derives deeper grouping for nested boundaries and preserves aggregate metrics', () => {
    const entries = Array.from({ length: 840 }, (_, i) => ({
      path: `repo/src/features/${i % 2 === 0 ? 'orders' : 'billing'}/f${i}.ts`, body: `export const v${i} = ${i};`,
    }));
    const result = extract(entries);
    expect(result.aggregationDepth).toBeGreaterThan(1);
    expect(result.aggregated!.map(d => d.path)).toEqual(['repo/src/features/billing', 'repo/src/features/orders']);
    expect(result.aggregated!.map(d => d.fileCount)).toEqual([420, 420]);
  });

  it('handles a flat repo as one root summary with bounded exact representatives', () => {
    const entries = Array.from({ length: 850 }, (_, i) => ({ path: `f${i}.ts`, body: `export const v${i} = ${i};` }));
    const result = extract(entries);
    expect(result.aggregated!.map(d => ({ path: d.path, fileCount: d.fileCount, imports: d.imports }))).toEqual([
      { path: '.', fileCount: 850, imports: [] },
    ]);
    expect(result.files.length).toBeLessThan(850);
  });

  it('fits the complete representative view near the byte limit, not just FileEntry bytes', () => {
    const entry = (path: string, padding: number): FileEntry => ({
      path, loc: 1, tokens: 0, imports: [], exports: [], symbols: ['x'.repeat(padding)],
    });
    const base: Tier1Result = {
      tier1Version: TIER1_VERSION, scope: 'budget-edge', totalFiles: 801, totalLoc: 801,
      totalTokens: 0, tier1GeneratedAt: '2026-10-01T00:00:00.000Z', files: [], tree: {},
      unparsed: [], unparsedCount: 0, aggregationDepth: 0,
    };
    const view = (file: FileEntry): Tier1Result => ({
      ...base, files: [file], tree: buildTree([file.path]),
      aggregated: [{ path: '.', fileCount: 801, totalLoc: 801, totalTokens: 0, entryPoints: [file.path], imports: [] }],
    });
    const longPath = 'a'.repeat(240) + '.ts';
    const padding = 49_900 - Buffer.byteLength(JSON.stringify(view(entry('b.ts', 0))));
    const short = entry('b.ts', padding);
    const long = entry(longPath, padding -
      (Buffer.byteLength(JSON.stringify(entry(longPath, 0))) - Buffer.byteLength(JSON.stringify(entry('b.ts', 0)))) - 100);
    const result = aggregateTier1({
      ...base, files: [long, short, ...Array.from({ length: 799 }, (_, i) => entry(`z${i}.ts`, 60_000))],
    }, []);
    expect(result.files).toEqual([short]);
    expect(Buffer.byteLength(JSON.stringify(result))).toBe(49_900);
    expect(result.aggregated![0]!.fileCount).toBe(801);
  });
});
