import { describe, expect, it } from 'bun:test';
import { spawnSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { FORBIDDEN_MEMORY_PATH_CHARS, hasForbiddenLocationCharacter, validateGuardianReport } from '../src/commands/util/memory-gate';

const require = createRequire(import.meta.url);
const SPECIFY = resolve(import.meta.dir, '../../..');
const RUNTIME_DIR = resolve(SPECIFY, 'plugins/tdk-memory/skills/tdk-memory-checksum/scripts');
const HOOK_READER = resolve(SPECIFY, 'plugins/tdk-core/lib/speckit-config-reader.cjs');

/** Characters that straddle every boundary of the screened ranges and sets. */
const SAMPLES = [
  ...'/ .-_~\'"`$;&|<>\\()[]{}*?!#%^=+,:@A-za-z0-9\n\r\t',
  '\u0000', '\u001f', ' ', '~', '\u007f', '\u0080', '\u0085', '\u009f', ' ',
  '‧', ' ', ' ', '‪', '‮', '⁦', '⁩', '﻿',
];

describe('memory gate and hook stay aligned with the memory runtime', () => {
  const runtimeSource = readFileSync(resolve(RUNTIME_DIR, 'memory-manifest.ts'), 'utf8');
  const constant = (name: string) => new RegExp(`const ${name} = /(.+)/;`).exec(runtimeSource)?.[1];

  it('shares the strict memory.path character set', () => {
    const runtimeSet = constant('FORBIDDEN_MEMORY_PATH_CHARACTERS');
    expect(runtimeSet).toBeDefined();
    expect(FORBIDDEN_MEMORY_PATH_CHARS.source).toBe(runtimeSet!);
    expect(require(HOOK_READER).FORBIDDEN_MEMORY_PATH_CHARS.source).toBe(runtimeSet!);
  });

  it('screens resolved locations exactly like the runtime on every platform', () => {
    const runtime = require(resolve(RUNTIME_DIR, 'memory-manifest.cjs')) as {
      hasForbiddenLocationCharacter: (value: string, platform?: string) => boolean;
    };
    for (const platform of ['linux', 'darwin', 'win32']) {
      for (const char of SAMPLES) {
        const value = `/srv/a${char}b`;
        expect(hasForbiddenLocationCharacter(value, platform)).toBe(runtime.hasForbiddenLocationCharacter(value, platform));
      }
    }
  });

  it.each([
    ['absent', undefined, 'file', 'none'],
    ['file', { backend: 'file' }, 'file', 'none'],
    ['obsidian-cli', { backend: 'obsidian-cli', vault: 'v' }, 'obsidian-cli', 'none'],
    ['unknown backend', { backend: 'other-reader', vault: 'v' }, 'file', 'config-invalid'],
    ['wrong type', 'x', 'file', 'config-invalid'],
    ['unsafe vault', { backend: 'obsidian-cli', vault: 'a"b' }, 'file', 'config-invalid'],
  ])('accepts a memory root the runtime reports ready with a %s reader', async (_label, reader, expectedReader, expectedFallback) => {
    const workspace = mkdtempSync(join(tmpdir(), 'tdk-gate-reader-'));
    try {
      const root = join(workspace, '.specify', 'memory');
      mkdirSync(root, { recursive: true });
      writeFileSync(join(root, 'memory-index.md'), '# Index\n');
      writeFileSync(join(root, 'memory.yaml'), 'version: "2"\nfiles: []\n');
      writeFileSync(join(workspace, '.specify', '.specify.json'), JSON.stringify({ memory: reader === undefined ? {} : { reader } }));

      const resolved = spawnSync('node', [resolve(RUNTIME_DIR, 'memory-manifest.cjs'), 'resolve'], { cwd: workspace, encoding: 'utf8' });
      expect(resolved.status).toBe(0);
      const status = JSON.parse(resolved.stdout) as { status: string; root: string; reader: string; reader_fallback: string };
      expect(status.status).toBe('ready');
      expect(status.reader).toBe(expectedReader);
      expect(status.reader_fallback).toBe(expectedFallback);

      const clear = readFileSync(resolve(import.meta.dir, 'fixtures/guardian-reports/valid-clear.txt'), 'utf8');
      expect((await validateGuardianReport(clear, 0, status.root, workspace)).state).toBe('clear');
    } finally {
      rmSync(workspace, { recursive: true, force: true });
    }
  });
});

describe('memory consumers forward the Status Block reader', () => {
  const plugin = (path: string) => readFileSync(resolve(SPECIFY, 'plugins', path), 'utf8');
  const STATUS_LINE = '`ready` → use `root`, `reader`, `binding_coverage`, `domains` only from the block;';
  const FORWARD = "When the block's `reader` is not `file`, also pass `reader: <that value>` as a control line before `===END-CONTROL===`.";

  it.each([
    'tdk-core/skills/tdk-clarify/SKILL.md',
    'tdk-core/skills/tdk-consistency-check/SKILL.md',
    'tdk-core/skills/tdk-archive/references/ingest-workflow.md',
    'tdk-core/skills/tdk-specify/references/input-routing-and-mode-workflow.md',
    'tdk-core/skills/tdk-plan/references/gates.md',
    'tdk-inception/skills/tdk-constitution/SKILL.md',
    'tdk-retro/skills/tdk-retro-propose/SKILL.md',
    'tdk-retro/skills/tdk-retro-apply/SKILL.md',
  ])('%s takes reader from the block and passes it with every control block', path => {
    const text = plugin(path);
    expect(text).toContain(STATUS_LINE);
    const controlBlocks = text.split('===TDK-MEMORY-CONTROL===').length - 1;
    expect(text.split(FORWARD).length - 1).toBe(controlBlocks);
  });

  it('research-phase forwards reader on its prose-described load spawn', () => {
    const text = plugin('tdk-core/skills/tdk-plan/references/research-phase.md');
    expect(text).toContain('`mode: load`');
    expect(text).toContain(FORWARD);
  });
});
