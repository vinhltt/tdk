import { describe, expect, it } from 'bun:test';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { resolve } from 'node:path';
import { FORBIDDEN_MEMORY_PATH_CHARS, hasForbiddenLocationCharacter } from '../src/commands/util/memory-gate';

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
});
