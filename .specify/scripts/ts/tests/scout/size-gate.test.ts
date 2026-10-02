import { describe, it, expect, beforeEach, afterEach } from 'bun:test';
import { mkdtempSync, rmSync, writeFileSync, mkdirSync, readFileSync, utimesSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { MAX_AGGREGATED_BYTES, TIER1_VERSION, type Tier1Result } from '../../src/commands/scout/types';

const CLI_ENTRY = resolve(import.meta.dir, '../../src/index.ts');

describe('scout output mode and cache transitions', () => {
  let tempDir: string;
  let packFile: string;
  beforeEach(() => {
    tempDir = mkdtempSync(join(tmpdir(), 'scout-mode-'));
    mkdirSync(join(tempDir, '.specify'));
    packFile = join(tempDir, 'p.md');
  });
  afterEach(() => { rmSync(tempDir, { recursive: true, force: true }); });

  function run() {
    const child = Bun.spawnSync({
      cmd: ['bun', CLI_ENTRY, 'scout', '--from-pack', packFile],
      cwd: tempDir, stdout: 'pipe', stderr: 'pipe',
    });
    expect(child.exitCode).toBe(0);
    const contract = JSON.parse(child.stdout.toString());
    const content = readFileSync(contract.tier1JsonPath, 'utf-8');
    return { contract, content, tier1: JSON.parse(content) as Tier1Result };
  }

  for (const count of [800, 801]) {
    it(`preserves ${count}-file coverage on fresh and warm CLI runs`, () => {
      const blocks = Array.from({ length: count }, (_, i) =>
        `## File: src/f${i}.ts\n\`\`\`ts\nexport const v${i} = ${i};\n\`\`\`\n`);
      writeFileSync(packFile, '# pack\n' + blocks.join('\n'));
      const first = run();
      expect(first.contract.cacheHit).toBe(false);
      expect(first.tier1.tier1Version).toBe(TIER1_VERSION);
      expect(first.tier1.totalFiles).toBe(count);
      if (count === 800) {
        expect(first.tier1.aggregated).toBeUndefined();
        expect(first.tier1.files.map(f => f.path)).toEqual(Array.from({ length: count }, (_, i) => `src/f${i}.ts`));
      } else {
        expect(first.tier1.aggregated!.reduce((n, d) => n + d.fileCount, 0)).toBe(count);
        expect(first.tier1.files.length).toBeLessThan(count);
        expect(Buffer.byteLength(first.content)).toBeLessThanOrEqual(MAX_AGGREGATED_BYTES);
      }
      const second = run();
      expect(second.contract.cacheHit).toBe(true);
      expect(second.tier1).toEqual(first.tier1);
    });
  }

  it('rebuilds a newer old-schema oversize cache instead of forwarding it', () => {
    writeFileSync(packFile, '# pack\n## File: src/index.ts\n```ts\nexport const main = 1;\n```\n');
    const cacheDir = join(tempDir, '.specify/cache/tdk-scout');
    mkdirSync(cacheDir, { recursive: true });
    const cache = join(cacheDir, 'p-tier1.json');
    writeFileSync(cache, JSON.stringify({ tier1Version: 1, totalFiles: 9000, files: [] }));
    const future = new Date(Date.now() + 60_000);
    utimesSync(cache, future, future);
    const rebuilt = run();
    expect(rebuilt.contract.cacheHit).toBe(false);
    expect(rebuilt.tier1.totalFiles).toBe(1);
    expect(rebuilt.tier1.files.map(f => f.path)).toEqual(['src/index.ts']);
    expect(rebuilt.tier1.tier1Version).toBe(TIER1_VERSION);
  });

  it('rejects current-version caches with missing file metadata or borrowed group anchors', () => {
    const cacheDir = join(tempDir, '.specify/cache/tdk-scout');
    mkdirSync(cacheDir, { recursive: true });
    writeFileSync(packFile, '# pack');
    const aggregate = JSON.parse(readFileSync(join(import.meta.dir, 'fixtures/tier1-aggregated.json'), 'utf-8')) as Tier1Result;
    const frontend = aggregate.aggregated!.find(d => d.path === 'src/frontend')!;
    aggregate.aggregated!.find(d => d.path === 'src/shared')!.entryPoints = [...frontend.entryPoints];
    const malformed = {
      tier1Version: TIER1_VERSION, scope: 'p', totalFiles: 1, totalLoc: 1, totalTokens: 0,
      tier1GeneratedAt: '2026-10-01T00:00:00.000Z', files: [{ path: 'a.ts' }], tree: {}, unparsed: [],
    };
    for (const cached of [malformed, aggregate]) {
      const cache = join(cacheDir, 'p-tier1.json');
      writeFileSync(cache, JSON.stringify(cached));
      const future = new Date(Date.now() + 60_000);
      utimesSync(cache, future, future);
      const child = Bun.spawnSync({
        cmd: ['bun', CLI_ENTRY, 'scout', '--from-pack', packFile],
        cwd: tempDir, stdout: 'pipe', stderr: 'pipe',
      });
      expect(child.exitCode).toBe(1);
      expect(child.stdout.toString()).toBe('');
    }
  });
});
