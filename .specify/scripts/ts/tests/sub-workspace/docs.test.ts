import { describe, it, expect, beforeEach, afterEach } from 'bun:test';
import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import {
  validateDocsArgs,
  computeMode,
  scanExistingDocs,
  runDocs,
} from '../../src/commands/sub-workspace/docs';
import { parseTokenCount } from '../../src/commands/sub-workspace/repomix-pack';
import { DocsError, EXPECTED_DOC_FILES } from '../../src/commands/sub-workspace/types';

describe('validateDocsArgs', () => {
  it('accepts --sub-workspace alone', () => {
    const r = validateDocsArgs({ subWorkspace: 'frontend' });
    expect(r.mode).toBe('single');
    if (r.mode === 'single') expect(r.name).toBe('frontend');
    expect(r.force).toBe(false);
  });

  it('accepts --all', () => {
    const r = validateDocsArgs({ all: true });
    expect(r.mode).toBe('all');
  });

  it('passes force flag through', () => {
    const r = validateDocsArgs({ all: true, force: true });
    expect(r.force).toBe(true);
  });

  it('throws NO_ARGS when neither flag provided', () => {
    expect(() => validateDocsArgs({})).toThrow(DocsError);
    try {
      validateDocsArgs({});
    } catch (e) {
      expect((e as DocsError).code).toBe('NO_ARGS');
    }
  });

  it('throws INVALID_ARGS when both flags provided', () => {
    try {
      validateDocsArgs({ subWorkspace: 'x', all: true });
      throw new Error('should have thrown');
    } catch (e) {
      expect((e as DocsError).code).toBe('INVALID_ARGS');
    }
  });
});

describe('computeMode', () => {
  it('returns force when force flag is true', () => {
    expect(computeMode([], true)).toBe('force');
    expect(computeMode(['codebase-summary.md'], true)).toBe('force');
  });
  it('returns init when no existing files', () => {
    expect(computeMode([], false)).toBe('init');
  });
  it('returns update when at least one expected file exists', () => {
    expect(computeMode(['codebase-summary.md'], false)).toBe('update');
  });
});

describe('parseTokenCount', () => {
  it('parses standard repomix output', () => {
    expect(parseTokenCount('Total Tokens: 42,100 tokens')).toBe(42100);
  });
  it('parses without comma', () => {
    expect(parseTokenCount('Total Tokens: 1234')).toBe(1234);
  });
  it('returns -1 on missing line', () => {
    expect(parseTokenCount('no tokens here')).toBe(-1);
  });
});

describe('scanExistingDocs', () => {
  let tmp: string;
  beforeEach(() => {
    tmp = mkdtempSync(join(tmpdir(), 'docs-scan-'));
  });
  afterEach(() => {
    rmSync(tmp, { recursive: true, force: true });
  });

  it('returns [] for non-existent dir', () => {
    expect(scanExistingDocs(join(tmp, 'nope'))).toEqual([]);
  });

  it('returns [] for empty dir', () => {
    expect(scanExistingDocs(tmp)).toEqual([]);
  });

  it('returns only expected files, ignores others', () => {
    writeFileSync(join(tmp, 'codebase-summary.md'), '');
    writeFileSync(join(tmp, 'README.md'), '');
    writeFileSync(join(tmp, 'random.md'), '');
    const found = scanExistingDocs(tmp);
    expect(found.sort()).toEqual(['README.md', 'codebase-summary.md'].sort());
  });

  it('preserves canonical ordering of expected files', () => {
    for (const f of EXPECTED_DOC_FILES) writeFileSync(join(tmp, f), '');
    expect(scanExistingDocs(tmp)).toEqual([...EXPECTED_DOC_FILES]);
  });
});

// Integration: fake .specify.json + mocked pack function
describe('runDocs (integration)', () => {
  let tmp: string;
  beforeEach(() => {
    tmp = mkdtempSync(join(tmpdir(), 'docs-int-'));
  });
  afterEach(() => {
    rmSync(tmp, { recursive: true, force: true });
  });

  function setupConfig(subWorkspaces: Array<{ name: string; path: string }>) {
    mkdirSync(join(tmp, '.specify'), { recursive: true });
    writeFileSync(
      join(tmp, '.specify', '.specify.json'),
      JSON.stringify({
        name: 'fixture',
        version: '1.0',
        docs: { path: 'docs' },
        subWorkspaces,
      }),
    );
    for (const sw of subWorkspaces) {
      mkdirSync(join(tmp, sw.path), { recursive: true });
    }
  }

  it('returns CONFIG_NOT_FOUND when no .specify dir', () => {
    const empty = mkdtempSync(join(tmpdir(), 'no-cfg-'));
    try {
      const env = runDocs({ all: true }, undefined, empty);
      expect(env.ok).toBe(false);
      if (!env.ok) expect(env.code).toBe('CONFIG_NOT_FOUND');
    } finally {
      rmSync(empty, { recursive: true, force: true });
    }
  });

  it('returns EMPTY_CONFIG when subWorkspaces is empty', () => {
    setupConfig([]);
    const env = runDocs({ all: true }, undefined, tmp);
    expect(env.ok).toBe(false);
    if (!env.ok) expect(env.code).toBe('EMPTY_CONFIG');
  });

  it('returns UNKNOWN_SW when name not in config', () => {
    setupConfig([{ name: 'frontend', path: 'apps/frontend' }]);
    const env = runDocs({ subWorkspace: 'ghost' }, undefined, tmp);
    expect(env.ok).toBe(false);
    if (!env.ok) {
      expect(env.code).toBe('UNKNOWN_SW');
      expect(env.error).toContain('frontend');
    }
  });

  it('returns MISSING_PATH when sw dir does not exist on disk', () => {
    setupConfig([{ name: 'gone', path: 'no/such/dir' }]);
    rmSync(join(tmp, 'no/such/dir'), { recursive: true, force: true });
    const env = runDocs({ subWorkspace: 'gone' }, undefined, tmp);
    expect(env.ok).toBe(false);
    if (!env.ok) expect(env.code).toBe('MISSING_PATH');
  });

  it('runs end-to-end with mocked pack: init mode for blank target', () => {
    setupConfig([{ name: 'frontend', path: 'apps/frontend' }]);
    const env = runDocs(
      { subWorkspace: 'frontend' },
      {
        ensureBin: () => {},
        pack: ({ outputPath }) => ({ packedFile: outputPath, tokenCount: 1234 }),
      },
      tmp,
    );
    expect(env.ok).toBe(true);
    if (env.ok) {
      expect(env.targets).toHaveLength(1);
      const t = env.targets[0]!;
      expect(t.name).toBe('frontend');
      expect(t.mode).toBe('init');
      expect(t.tokenCount).toBe(1234);
      expect(t.existingFiles).toEqual([]);
      expect(t.outputDir).toContain('sub-workspaces/frontend');
      expect(env.cleanupCandidates[0]).toContain('.specify/cache/tdk-docs');
    }
  });

  it('detects update mode when existing doc files present', () => {
    setupConfig([{ name: 'frontend', path: 'apps/frontend' }]);
    const docDir = join(tmp, 'docs/sub-workspaces/frontend');
    mkdirSync(docDir, { recursive: true });
    writeFileSync(join(docDir, 'codebase-summary.md'), '# old');
    const env = runDocs(
      { subWorkspace: 'frontend' },
      { ensureBin: () => {}, pack: ({ outputPath }) => ({ packedFile: outputPath, tokenCount: 5 }) },
      tmp,
    );
    expect(env.ok).toBe(true);
    if (env.ok) {
      expect(env.targets[0]!.mode).toBe('update');
      expect(env.targets[0]!.existingFiles).toContain('codebase-summary.md');
    }
  });

  it('force flag overrides existing files to mode=force', () => {
    setupConfig([{ name: 'frontend', path: 'apps/frontend' }]);
    const docDir = join(tmp, 'docs/sub-workspaces/frontend');
    mkdirSync(docDir, { recursive: true });
    writeFileSync(join(docDir, 'README.md'), '');
    const env = runDocs(
      { subWorkspace: 'frontend', force: true },
      { ensureBin: () => {}, pack: ({ outputPath }) => ({ packedFile: outputPath, tokenCount: 0 }) },
      tmp,
    );
    expect(env.ok).toBe(true);
    if (env.ok) expect(env.targets[0]!.mode).toBe('force');
  });

  it('--all expands to every configured sub-workspace', () => {
    setupConfig([
      { name: 'frontend', path: 'apps/frontend' },
      { name: 'backend', path: 'apps/backend' },
    ]);
    const env = runDocs(
      { all: true },
      { ensureBin: () => {}, pack: ({ outputPath }) => ({ packedFile: outputPath, tokenCount: 10 }) },
      tmp,
    );
    expect(env.ok).toBe(true);
    if (env.ok) {
      expect(env.targets).toHaveLength(2);
      expect(env.targets.map(t => t.name).sort()).toEqual(['backend', 'frontend']);
    }
  });

  it('warns when token count exceeds 100k threshold', () => {
    setupConfig([{ name: 'big', path: 'apps/big' }]);
    const env = runDocs(
      { subWorkspace: 'big' },
      { ensureBin: () => {}, pack: ({ outputPath }) => ({ packedFile: outputPath, tokenCount: 150_000 }) },
      tmp,
    );
    expect(env.ok).toBe(true);
    if (env.ok) {
      expect(env.warnings.some(w => /pack >\d+ tokens/.test(w))).toBe(true);
    }
  });

  it('returns MISSING_BIN when ensureBin throws', () => {
    setupConfig([{ name: 'x', path: 'x' }]);
    const env = runDocs(
      { subWorkspace: 'x' },
      {
        ensureBin: () => {
          throw new DocsError('MISSING_BIN', 'no repomix');
        },
        pack: ({ outputPath }) => ({ packedFile: outputPath, tokenCount: 0 }),
      },
      tmp,
    );
    expect(env.ok).toBe(false);
    if (!env.ok) expect(env.code).toBe('MISSING_BIN');
  });
});
