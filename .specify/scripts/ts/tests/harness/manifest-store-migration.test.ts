import { describe, expect, test } from 'bun:test';
import * as fs from 'node:fs';
import * as path from 'node:path';
import {
  emptyHarnessManifest,
  legacyManifestPathFor,
  loadHarnessManifest,
  manifestPathFor,
  saveHarnessManifest,
} from '../../src/commands/harness/manifest-store';
import { makeConsumer } from './fixtures';

describe('ownership manifest migration', () => {
  test('reads legacy manifest path and writes new per-harness manifest without deleting legacy state', () => {
    const consumer = makeConsumer();
    const legacyPath = legacyManifestPathFor(consumer.root);
    fs.mkdirSync(path.dirname(legacyPath), { recursive: true });
    fs.writeFileSync(legacyPath, JSON.stringify({
      ...emptyHarnessManifest(),
      selectedPlugins: ['tdk-core'],
    }, null, 2));

    const legacy = loadHarnessManifest(consumer.root);
    saveHarnessManifest(consumer.root, {
      ...legacy,
      managedFiles: [{
        plugin: 'tdk-core',
        sourceRelativePath: 'skills/demo/SKILL.md',
        targetRelativePath: '.claude/skills/demo/SKILL.md',
        sourceChecksum: 'source',
        installedChecksum: 'installed',
      }],
    });

    expect(legacy.selectedPlugins).toEqual(['tdk-core']);
    expect(fs.existsSync(legacyPath)).toBe(true);
    expect(fs.existsSync(manifestPathFor(consumer.root, 'claude'))).toBe(true);
  });
});
