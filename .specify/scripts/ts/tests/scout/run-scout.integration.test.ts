import { describe, it, expect, beforeEach, afterEach } from 'bun:test';
import { mkdtempSync, rmSync, writeFileSync, mkdirSync, readFileSync, utimesSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { runScout } from '../../src/commands/scout/index';
import { validateArgs } from '../../src/commands/scout/args-validator';

// DI replaces only external repomix; extraction and cache decisions remain real.
describe('runScout cache isolation', () => {
  let tempDir: string;
  let previousCwd: string;
  beforeEach(() => {
    previousCwd = process.cwd();
    tempDir = mkdtempSync(join(tmpdir(), 'scout-run-'));
    mkdirSync(join(tempDir, '.specify'));
    process.chdir(tempDir);
  });
  afterEach(() => {
    process.chdir(previousCwd);
    rmSync(tempDir, { recursive: true, force: true });
  });

  it('scope runs with different include filters never reuse each other file universe', () => {
    const run = (include: string) => runScout(validateArgs({ scope: tempDir, include }), {
      runRepomix: opts => {
        const path = opts.include![0] === 'src/**' ? 'src/app.ts' : 'docs/guide.md';
        writeFileSync(opts.outputPath, `# pack\n## File: ${path}\n\`\`\`\nexport const demo = 1;\n\`\`\`\n`);
        // Separate timestamps deterministically; the external pack rewrite invalidates Tier 1.
        const after = new Date(Date.now() + 2000);
        utimesSync(opts.outputPath, after, after);
        return opts.outputPath;
      },
    });
    const first = run('src/**');
    expect(JSON.parse(readFileSync(first.tier1JsonPath, 'utf-8')).files.map((f: { path: string }) => f.path)).toEqual(['src/app.ts']);
    const second = run('docs/**');
    expect(second.cacheHit).toBe(false);
    expect(JSON.parse(readFileSync(second.tier1JsonPath, 'utf-8')).files.map((f: { path: string }) => f.path)).toEqual(['docs/guide.md']);
  });

  it('force-refresh rebuilds a changed pack even when timestamps would reuse the cache', () => {
    const pack = join(tempDir, 'p.md');
    writeFileSync(pack, '# pack\n## File: old.ts\n```ts\nexport const old = 1;\n```\n');
    const first = runScout(validateArgs({ fromPack: pack }));
    writeFileSync(pack, '# pack\n## File: new.ts\n```ts\nexport const fresh = 1;\n```\n');
    const past = new Date(Date.now() - 60_000);
    utimesSync(pack, past, past);
    const result = runScout(validateArgs({ fromPack: pack, forceRefresh: true }));
    expect(result.cacheHit).toBe(false);
    expect(result.tier1JsonPath).toBe(first.tier1JsonPath);
    expect(JSON.parse(readFileSync(result.tier1JsonPath, 'utf-8')).files.map((f: { path: string }) => f.path)).toEqual(['new.ts']);
  });
});
