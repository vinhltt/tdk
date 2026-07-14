import { describe, expect, it } from 'bun:test';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const SOURCE_MANIFEST_PATH = resolve(import.meta.dir, '../../../../plugins/manifest.json');
const POLICY_PATH = resolve(import.meta.dir, '../../../../plugins/plugin-dependencies.json');
const VALID_FIXTURE_PLUGIN_IDS = ['tdk-core', 'tdk-inception', 'tdk-memory', 'tdk-utils'];

type PluginDependencyPolicy = {
  version: 1;
  requiredPlugins: string[];
  dependencies: Record<string, string[]>;
};

type PluginManifest = {
  plugins?: Record<string, unknown>;
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function readStringArray(value: unknown, label: string): string[] {
  if (!Array.isArray(value) || !value.every((entry) => typeof entry === 'string')) {
    throw new Error(`${label} must be an array of plugin IDs`);
  }
  return [...value];
}

function assertUnique(ids: string[], label: string): void {
  const duplicate = ids.find((id, index) => ids.indexOf(id) !== index);
  if (duplicate) {
    throw new Error(`Duplicate ${label}: ${duplicate}`);
  }
}

function assertKnownPlugin(id: string, pluginIds: readonly string[], label: string): void {
  if (!pluginIds.includes(id)) {
    throw new Error(`Unknown plugin in ${label}: ${id}`);
  }
}

function validatePolicy(value: unknown, pluginIds: readonly string[]): PluginDependencyPolicy {
  if (!isRecord(value) || value.version !== 1 || !isRecord(value.dependencies)) {
    throw new Error('Invalid plugin dependency policy');
  }

  const requiredPlugins = readStringArray(value.requiredPlugins, 'requiredPlugins');
  assertUnique(requiredPlugins, 'requiredPlugins');
  for (const plugin of requiredPlugins) {
    assertKnownPlugin(plugin, pluginIds, 'requiredPlugins');
  }

  const dependencies: Record<string, string[]> = {};
  for (const [plugin, dependencyValue] of Object.entries(value.dependencies)) {
    const dependencyIds = readStringArray(dependencyValue, `dependencies.${plugin}`);
    assertKnownPlugin(plugin, pluginIds, 'dependency key');
    assertUnique(dependencyIds, `dependencies.${plugin}`);
    for (const dependency of dependencyIds) {
      assertKnownPlugin(dependency, pluginIds, `dependencies.${plugin}`);
      if (dependency === plugin) {
        throw new Error(`Self-dependency: ${plugin}`);
      }
    }
    dependencies[plugin] = dependencyIds;
  }

  const visiting = new Set<string>();
  const visited = new Set<string>();
  const visit = (plugin: string): void => {
    if (visiting.has(plugin)) {
      throw new Error(`Dependency cycle: ${plugin}`);
    }
    if (visited.has(plugin)) {
      return;
    }
    visiting.add(plugin);
    for (const dependency of dependencies[plugin] ?? []) {
      visit(dependency);
    }
    visiting.delete(plugin);
    visited.add(plugin);
  };

  for (const plugin of Object.keys(dependencies)) {
    visit(plugin);
  }

  return { version: 1, requiredPlugins, dependencies };
}

function resolveDependencyClosure(policy: PluginDependencyPolicy, roots: string[]): string[] {
  const closure = new Set<string>();
  const pending = [...roots].sort();

  while (pending.length > 0) {
    const plugin = pending.shift();
    if (!plugin || closure.has(plugin)) {
      continue;
    }
    closure.add(plugin);
    pending.push(...(policy.dependencies[plugin] ?? []));
    pending.sort();
  }

  return [...closure].sort();
}

function approvedPolicy(): PluginDependencyPolicy {
  return {
    version: 1,
    requiredPlugins: ['tdk-core', 'tdk-inception'],
    dependencies: {
      'tdk-core': ['tdk-utils'],
      'tdk-inception': ['tdk-utils', 'tdk-memory'],
    },
  };
}

describe('source plugin dependency policy', () => {
  it('requires the approved graph and deterministic base closure', () => {
    const manifest = JSON.parse(readFileSync(SOURCE_MANIFEST_PATH, 'utf-8')) as PluginManifest;
    const policyValue: unknown = JSON.parse(readFileSync(POLICY_PATH, 'utf-8'));
    const policy = validatePolicy(policyValue, Object.keys(manifest.plugins ?? {}));

    expect(policy).toEqual(approvedPolicy());
    expect(resolveDependencyClosure(policy, policy.requiredPlugins)).toEqual([
      'tdk-core',
      'tdk-inception',
      'tdk-memory',
      'tdk-utils',
    ]);
  });

  it('rejects duplicate roots and dependency edges plus unknown plugin IDs', () => {
    const duplicateRoot = approvedPolicy();
    duplicateRoot.requiredPlugins.push('tdk-core');
    expect(() => validatePolicy(duplicateRoot, VALID_FIXTURE_PLUGIN_IDS)).toThrow(
      'Duplicate requiredPlugins: tdk-core',
    );

    const duplicateEdge = approvedPolicy();
    duplicateEdge.dependencies['tdk-core'] = ['tdk-utils', 'tdk-utils'];
    expect(() => validatePolicy(duplicateEdge, VALID_FIXTURE_PLUGIN_IDS)).toThrow(
      'Duplicate dependencies.tdk-core: tdk-utils',
    );

    const unknownRoot = approvedPolicy();
    unknownRoot.requiredPlugins = ['tdk-unknown'];
    expect(() => validatePolicy(unknownRoot, VALID_FIXTURE_PLUGIN_IDS)).toThrow(
      'Unknown plugin in requiredPlugins: tdk-unknown',
    );

    const unknownEdge = approvedPolicy();
    unknownEdge.dependencies['tdk-core'] = ['tdk-unknown'];
    expect(() => validatePolicy(unknownEdge, VALID_FIXTURE_PLUGIN_IDS)).toThrow(
      'Unknown plugin in dependencies.tdk-core: tdk-unknown',
    );
  });

  it('rejects unknown dependency keys, self-edges, and cycles', () => {
    const unknownKey = approvedPolicy();
    unknownKey.dependencies['tdk-unknown'] = [];
    expect(() => validatePolicy(unknownKey, VALID_FIXTURE_PLUGIN_IDS)).toThrow(
      'Unknown plugin in dependency key: tdk-unknown',
    );

    const selfEdge = approvedPolicy();
    selfEdge.dependencies['tdk-core'] = ['tdk-core'];
    expect(() => validatePolicy(selfEdge, VALID_FIXTURE_PLUGIN_IDS)).toThrow(
      'Self-dependency: tdk-core',
    );

    const cycle = approvedPolicy();
    cycle.dependencies['tdk-utils'] = ['tdk-core'];
    expect(() => validatePolicy(cycle, VALID_FIXTURE_PLUGIN_IDS)).toThrow(
      'Dependency cycle: tdk-core',
    );
  });

  it('sorts closure results regardless of root ordering', () => {
    const policy = validatePolicy(approvedPolicy(), VALID_FIXTURE_PLUGIN_IDS);

    expect(resolveDependencyClosure(policy, ['tdk-inception', 'tdk-core'])).toEqual([
      'tdk-core',
      'tdk-inception',
      'tdk-memory',
      'tdk-utils',
    ]);
  });
});
