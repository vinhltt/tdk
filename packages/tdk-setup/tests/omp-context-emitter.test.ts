import { describe, expect, test } from 'bun:test';
import * as fs from 'node:fs';
import * as path from 'node:path';
import { sha256Buffer, sha256File } from '../src/checksum';
import { emitOmpContextFile } from '../src/omp-context-emitter';
import { makeConsumer } from './fixtures';
import type { FlatClaudeMdRecord } from '../src/flat-claude-types';

describe('OMP context emitter', () => {
  test('emits a native AGENTS.md that imports the root CLAUDE.md', () => {
    const consumer = makeConsumer('tdk-omp-context-');
    const sourcePath = path.join(consumer.root, 'CLAUDE.md');
    fs.writeFileSync(sourcePath, '# Project instructions\n', 'utf-8');
    const record: FlatClaudeMdRecord = {
      kind: 'claude-md',
      sourcePath,
      sourceRelativePath: 'CLAUDE.md',
    };

    const result = emitOmpContextFile(record);

    expect(result.files).toHaveLength(1);
    expect(result.files[0]).toEqual({
      sourcePath,
      sourceRelativePath: 'CLAUDE.md',
      targetRelativePath: '.omp/AGENTS.md',
      sourceChecksum: sha256File(sourcePath),
      installedChecksum: sha256Buffer(Buffer.from('@../CLAUDE.md\n')),
      content: Buffer.from('@../CLAUDE.md\n'),
      part: 'context',
    });
    expect(result.facts).toContainEqual(expect.objectContaining({
      layer: 1,
      status: 'converted',
      source: 'CLAUDE.md',
    }));
  });

  test('reports the missing source without emitting a target', () => {
    const result = emitOmpContextFile();

    expect(result.files).toEqual([]);
    expect(result.facts).toEqual([expect.objectContaining({
      layer: 1,
      status: 'note',
      source: 'CLAUDE.md',
      message: expect.stringContaining('no root CLAUDE.md'),
    })]);
  });
});
