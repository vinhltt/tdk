import { describe, expect, test } from 'bun:test';
import * as fs from 'node:fs';
import * as path from 'node:path';
import { loadPluginDependencyPolicy, resolvePluginSelection } from '../src/plugin-dependencies';
import { makeConsumer, writeMultiPluginManifest, writePluginDependencyPolicy } from './fixtures';

const names = ['tdk-core', 'tdk-epic', 'tdk-inception', 'tdk-memory', 'tdk-utils'];
const policy = {
  requiredPlugins: ['tdk-core', 'tdk-inception'],
  dependencies: {
    'tdk-core': ['tdk-utils'],
    'tdk-inception': ['tdk-memory', 'tdk-utils'],
  },
};

function writeCatalog(consumer: ReturnType<typeof makeConsumer>): void {
  writeMultiPluginManifest(consumer, Object.fromEntries(names.map((name) => [name, { version: '1.0.0', files: {} }])));
}

describe('plugin dependency policy', () => {
  test('loads a release-checksummed policy and resolves lexical closures', () => {
    const consumer = makeConsumer();
    writeCatalog(consumer);
    writePluginDependencyPolicy(consumer, policy);

    const loaded = loadPluginDependencyPolicy(consumer.root, names);
    const selection = resolvePluginSelection(loaded, names, ['tdk-epic', 'tdk-core']);

    expect(selection.requiredBasePlugins).toEqual(['tdk-core', 'tdk-inception', 'tdk-memory', 'tdk-utils']);
    expect(selection.optionalPlugins).toEqual(['tdk-epic']);
    expect(selection.requestedPlugins).toEqual(['tdk-epic']);
    expect(selection.resolvedPlugins).toEqual(['tdk-core', 'tdk-epic', 'tdk-inception', 'tdk-memory', 'tdk-utils']);
  });

  test('rejects a missing policy instead of using a hardcoded fallback', () => {
    const consumer = makeConsumer();
    writeCatalog(consumer);

    expect(() => loadPluginDependencyPolicy(consumer.root, names)).toThrow(/Rerun distribute\.sh/);
  });

  test('verifies policy bytes against the release manifest before parsing', () => {
    const consumer = makeConsumer();
    writeCatalog(consumer);
    writePluginDependencyPolicy(consumer, policy);
    fs.writeFileSync(path.join(consumer.root, '.specify', 'plugins', 'plugin-dependencies.json'), '{invalid', 'utf-8');

    expect(() => loadPluginDependencyPolicy(consumer.root, names)).toThrow(/checksum mismatch/);
  });

  test('rejects malformed graph definitions and unknown requests', () => {
    const base = { version: 1 as const, requiredPlugins: ['tdk-core'], dependencies: { 'tdk-core': ['tdk-utils'] } };

    expect(() => resolvePluginSelection({ ...base, requiredPlugins: ['tdk-core', 'tdk-core'] }, names, [])).toThrow(/Duplicate required/);
    expect(() => resolvePluginSelection({ ...base, dependencies: { 'tdk-core': ['tdk-core'] } }, names, [])).toThrow(/cannot reference itself/);
    expect(() => resolvePluginSelection({ ...base, dependencies: { 'tdk-core': ['tdk-utils'], 'tdk-utils': ['tdk-core'] } }, names, [])).toThrow(/cycle/);
    expect(() => resolvePluginSelection(base, names, ['unknown'])).toThrow(/Requested plugin/);
  });

  test('rejects duplicate dependency edges and dependencies absent from the manifest', () => {
    expect(() => resolvePluginSelection({
      version: 1,
      requiredPlugins: ['tdk-core'],
      dependencies: { 'tdk-core': ['tdk-utils', 'tdk-utils'] },
    }, names, [])).toThrow(/Duplicate dependency/);
    expect(() => resolvePluginSelection({
      version: 1,
      requiredPlugins: ['tdk-core'],
      dependencies: { 'tdk-core': ['tdk-missing'] },
    }, names, [])).toThrow(/missing from/);
  });
});
