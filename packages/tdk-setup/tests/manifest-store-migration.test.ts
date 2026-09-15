import { describe, expect, test } from 'bun:test';
import * as fs from 'node:fs';
import * as path from 'node:path';
import {
  emptyHarnessManifest,
  legacyManifestPathFor,
  loadHarnessManifest,
  manifestPathFor,
  saveHarnessManifest,
} from '../src/manifest-store';
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

  test('normalizes legacy managed target paths to POSIX separators', () => {
    const consumer = makeConsumer();
    const manifestPath = manifestPathFor(consumer.root, 'claude');
    fs.mkdirSync(path.dirname(manifestPath), { recursive: true });
    fs.writeFileSync(manifestPath, JSON.stringify({
      ...emptyHarnessManifest(),
      managedFiles: [{
        plugin: 'tdk-core',
        sourceRelativePath: 'skills/demo/SKILL.md',
        targetRelativePath: ['.claude', 'skills', 'demo', 'SKILL.md'].join('\\\\'),
        sourceChecksum: 'source',
        installedChecksum: 'installed',
      }],
    }, null, 2));

    const manifest = loadHarnessManifest(consumer.root);

    expect(manifest.managedFiles[0]?.targetRelativePath).toBe('.claude/skills/demo/SKILL.md');
  });

  test('rejects manifest targets that escape the Claude target directory', () => {
    const consumer = makeConsumer();
    const manifestPath = manifestPathFor(consumer.root, 'claude');
    fs.mkdirSync(path.dirname(manifestPath), { recursive: true });
    fs.writeFileSync(manifestPath, JSON.stringify({
      ...emptyHarnessManifest(),
      managedFiles: [{
        plugin: 'tdk-core',
        sourceRelativePath: 'skills/demo/SKILL.md',
        targetRelativePath: ['.claude', '..', 'victim.txt'].join('\\\\'),
        sourceChecksum: 'source',
        installedChecksum: 'installed',
      }],
    }, null, 2));

    expect(() => loadHarnessManifest(consumer.root)).toThrow(/Unsafe managed target path/);
  });

  test('keeps legacy targetless OMP manifests readable and rejects a present invalid hook target', () => {
    const consumer = makeConsumer();
    const manifestPath = manifestPathFor(consumer.root, 'omp');
    fs.mkdirSync(path.dirname(manifestPath), { recursive: true });
    const legacyManifest = emptyHarnessManifest('omp');
    fs.writeFileSync(manifestPath, JSON.stringify(legacyManifest, null, 2));

    expect(loadHarnessManifest(consumer.root, 'omp').hookTargetPlatform).toBeUndefined();

    fs.writeFileSync(manifestPath, JSON.stringify({
      ...legacyManifest,
      hookTargetPlatform: 'windows',
    }, null, 2));
    expect(() => loadHarnessManifest(consumer.root, 'omp')).toThrow(/unexpected manifest shape/);
  });

  test('rejects invalid OMP part and managed-region checksum fields', () => {
    const consumer = makeConsumer();
    const manifestPath = manifestPathFor(consumer.root, 'omp');
    fs.mkdirSync(path.dirname(manifestPath), { recursive: true });
    const base = {
      ...emptyHarnessManifest('omp'),
      managedFiles: [{
        plugin: 'convert-flat',
        sourceRelativePath: '.claude/settings.json',
        targetRelativePath: '.omp/config.yml',
        sourceChecksum: 'source',
        installedChecksum: 'installed',
        part: 'commands',
      }],
    };
    fs.writeFileSync(manifestPath, JSON.stringify(base, null, 2));
    expect(() => loadHarnessManifest(consumer.root, 'omp')).toThrow(/unexpected manifest shape/);

    base.managedFiles[0]!.part = 'settings';
    Object.assign(base.managedFiles[0]!, { managedRegionChecksum: 'not-a-sha256' });
    fs.writeFileSync(manifestPath, JSON.stringify(base, null, 2));
    expect(() => loadHarnessManifest(consumer.root, 'omp')).toThrow(/unexpected manifest shape/);
  });
});
