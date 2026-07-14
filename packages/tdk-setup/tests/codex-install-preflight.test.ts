import { describe, expect, spyOn, test } from 'bun:test';
import * as fs from 'node:fs';
import * as path from 'node:path';
import { assertResolvedCodexPackages } from '../src/codex-install-preflight';
import { makeConsumer, sha256, writeMultiPluginManifest } from './fixtures';

function writeGeneratedManifest(
  consumer: ReturnType<typeof makeConsumer>,
  version = '1.0.0',
  includePluginJson = true,
  additionalFiles: Record<string, string> = {},
): void {
  const plugin = 'tdk-core';
  const pluginJson = '{"name":"tdk-core","version":"1.0.0"}\n';
  const packageRoot = path.join(consumer.root, '.specify', 'codex-plugins', plugin, '.codex-plugin');
  fs.mkdirSync(packageRoot, { recursive: true });
  fs.writeFileSync(path.join(packageRoot, 'plugin.json'), pluginJson, 'utf-8');
  fs.writeFileSync(path.join(consumer.root, '.specify', 'codex-plugins', 'manifest.json'), JSON.stringify({
    algorithm: 'sha256',
    plugins: {
      [plugin]: {
        version,
        files: {
          ...(includePluginJson ? { '.codex-plugin/plugin.json': sha256(pluginJson) } : {}),
          ...additionalFiles,
        },
      },
    },
  }, null, 2), 'utf-8');
}

function writeSourceManifest(consumer: ReturnType<typeof makeConsumer>, version = '1.0.0'): void {
  writeMultiPluginManifest(consumer, { 'tdk-core': { version, files: {} } });
}

describe('Codex install preflight', () => {
  test('accepts resolved package IDs with matching source and generated versions', () => {
    const consumer = makeConsumer();
    writeSourceManifest(consumer);
    writeGeneratedManifest(consumer);

    expect(() => assertResolvedCodexPackages({ consumerRoot: consumer.root, resolvedPlugins: ['tdk-core'] })).not.toThrow();
  });

  test('rejects missing generated packages and source entries', () => {
    const consumer = makeConsumer();
    writeSourceManifest(consumer);
    fs.mkdirSync(path.join(consumer.root, '.specify', 'codex-plugins'), { recursive: true });
    fs.writeFileSync(path.join(consumer.root, '.specify', 'codex-plugins', 'manifest.json'), '{"plugins":{}}', 'utf-8');

    expect(() => assertResolvedCodexPackages({ consumerRoot: consumer.root, resolvedPlugins: ['tdk-core'] })).toThrow(/missing generated/);
    expect(() => assertResolvedCodexPackages({ consumerRoot: consumer.root, resolvedPlugins: ['tdk-missing'] })).toThrow(/missing source/);
  });

  test('rejects generated version skew, partial packages, missing files, and stale files', () => {
    const skewed = makeConsumer();
    writeSourceManifest(skewed);
    writeGeneratedManifest(skewed, '2.0.0');
    expect(() => assertResolvedCodexPackages({ consumerRoot: skewed.root, resolvedPlugins: ['tdk-core'] })).toThrow(/version mismatch/);

    const partial = makeConsumer();
    writeSourceManifest(partial);
    writeGeneratedManifest(partial, '1.0.0', false);
    expect(() => assertResolvedCodexPackages({ consumerRoot: partial.root, resolvedPlugins: ['tdk-core'] })).toThrow(/incomplete/);

    const missing = makeConsumer();
    writeSourceManifest(missing);
    writeGeneratedManifest(missing, '1.0.0', true, { 'skills/missing/SKILL.md': sha256('# missing\n') });
    expect(() => assertResolvedCodexPackages({ consumerRoot: missing.root, resolvedPlugins: ['tdk-core'] })).toThrow(/missing skills\/missing\/SKILL.md/);

    const stale = makeConsumer();
    writeSourceManifest(stale);
    writeGeneratedManifest(stale);
    fs.writeFileSync(path.join(stale.root, '.specify', 'codex-plugins', 'tdk-core', '.codex-plugin', 'plugin.json'), 'changed', 'utf-8');
    expect(() => assertResolvedCodexPackages({ consumerRoot: stale.root, resolvedPlugins: ['tdk-core'] })).toThrow(/stale/);
  });

  test('rejects unsafe generated manifest file keys before reading outside the package root', () => {
    const consumer = makeConsumer();
    const sentinel = path.join(consumer.root, '.specify', 'codex-plugins', 'outside');
    writeSourceManifest(consumer);
    fs.mkdirSync(path.dirname(sentinel), { recursive: true });
    fs.writeFileSync(sentinel, 'outside sentinel', 'utf-8');
    writeGeneratedManifest(consumer, '1.0.0', true, { '../outside': sha256('outside sentinel') });
    const readSpy = spyOn(fs, 'readFileSync');

    try {
      expect(() => assertResolvedCodexPackages({ consumerRoot: consumer.root, resolvedPlugins: ['tdk-core'] }))
        .toThrow(/Unsafe generated Codex manifest file key: \.\.\/outside/);
      expect(readSpy.mock.calls.map(([filePath]) => String(filePath))).not.toContain(sentinel);
      expect(fs.readFileSync(sentinel, 'utf-8')).toBe('outside sentinel');
    } finally {
      readSpy.mockRestore();
    }
  });

  test('rejects absolute, backslash, empty, dot, dot-dot, and normalized generated file keys', () => {
    for (const fileKey of [
      '/absolute',
      'C:/absolute',
      'skills\\demo/SKILL.md',
      '',
      'skills//demo/SKILL.md',
      'skills/./demo/SKILL.md',
      'skills/../demo/SKILL.md',
    ]) {
      const consumer = makeConsumer();
      writeSourceManifest(consumer);
      writeGeneratedManifest(consumer, '1.0.0', true, { [fileKey]: sha256('unsafe') });

      expect(() => assertResolvedCodexPackages({ consumerRoot: consumer.root, resolvedPlugins: ['tdk-core'] }))
        .toThrow(/Unsafe generated Codex manifest file key/);
    }
  });
});
