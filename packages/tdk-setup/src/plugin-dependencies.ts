import * as fs from 'node:fs';
import * as path from 'node:path';
import { z } from 'zod';
import { sha256Buffer } from './checksum';
import { validateSafeSegment } from './install-settings-paths';

export interface PluginDependencyPolicy {
  version: 1;
  requiredPlugins: string[];
  dependencies: Record<string, string[]>;
}

export interface ResolvedPluginSelection {
  requiredBasePlugins: string[];
  optionalPlugins: string[];
  requestedPlugins: string[];
  resolvedPlugins: string[];
}

const POLICY_RELATIVE_PATH = '.specify/plugins/plugin-dependencies.json';
const PolicySchema = z.object({
  version: z.literal(1),
  requiredPlugins: z.array(z.string()),
  dependencies: z.record(z.array(z.string())),
}).strict();
const ReleaseManifestSchema = z.object({
  algorithm: z.literal('sha256'),
  files: z.record(z.object({
    sha256: z.string().regex(/^[a-f0-9]{64}$/),
    size: z.number().int().nonnegative(),
  }).passthrough()),
}).passthrough();

function sortedUnique(values: string[], label: string): string[] {
  const seen = new Set<string>();
  for (const value of values) {
    validateSafeSegment(value, label);
    if (seen.has(value)) throw new Error(`Duplicate ${label}: ${value}`);
    seen.add(value);
  }
  return [...seen].sort();
}

function validateManifestPluginNames(manifestPluginNames: string[]): string[] {
  return sortedUnique(manifestPluginNames, 'manifest plugin id');
}

function validateGraph(policy: PluginDependencyPolicy, manifestPluginNames: string[]): void {
  const manifestIds = new Set(validateManifestPluginNames(manifestPluginNames));
  for (const plugin of policy.requiredPlugins) {
    if (!manifestIds.has(plugin)) throw new Error(`Required plugin is missing from .specify/plugins/manifest.json: ${plugin}`);
  }

  for (const [plugin, dependencies] of Object.entries(policy.dependencies).sort(([a], [b]) => a.localeCompare(b))) {
    validateSafeSegment(plugin, 'dependency plugin id');
    if (!manifestIds.has(plugin)) throw new Error(`Dependency plugin is missing from .specify/plugins/manifest.json: ${plugin}`);
    for (const dependency of dependencies) {
      if (!manifestIds.has(dependency)) throw new Error(`Dependency is missing from .specify/plugins/manifest.json: ${plugin} -> ${dependency}`);
      if (dependency === plugin) throw new Error(`Plugin dependency cannot reference itself: ${plugin}`);
    }
  }

  const visiting = new Set<string>();
  const visited = new Set<string>();
  const visit = (plugin: string, chain: string[]): void => {
    if (visiting.has(plugin)) throw new Error(`Plugin dependency cycle: ${[...chain, plugin].join(' -> ')}`);
    if (visited.has(plugin)) return;
    visiting.add(plugin);
    for (const dependency of policy.dependencies[plugin] ?? []) {
      visit(dependency, [...chain, plugin]);
    }
    visiting.delete(plugin);
    visited.add(plugin);
  };
  for (const plugin of [...manifestIds].sort()) visit(plugin, []);
}

function parsePolicy(input: unknown, manifestPluginNames: string[]): PluginDependencyPolicy {
  const parsed = PolicySchema.safeParse(input);
  if (!parsed.success) throw new Error(`Invalid plugin dependency policy: ${parsed.error.message}`);
  const policy: PluginDependencyPolicy = {
    version: parsed.data.version,
    requiredPlugins: sortedUnique(parsed.data.requiredPlugins, 'required plugin id'),
    dependencies: Object.fromEntries(Object.entries(parsed.data.dependencies).map(([plugin, dependencies]) => [
      plugin,
      sortedUnique(dependencies, `dependency of ${plugin}`),
    ])),
  };
  validateGraph(policy, manifestPluginNames);
  return policy;
}

function dependencyClosure(policy: PluginDependencyPolicy, roots: string[]): string[] {
  const visited = new Set<string>();
  const worklist = [...roots].sort();
  for (let index = 0; index < worklist.length; index += 1) {
    const plugin = worklist[index]!;
    if (visited.has(plugin)) continue;
    visited.add(plugin);
    for (const dependency of policy.dependencies[plugin] ?? []) {
      if (!visited.has(dependency)) worklist.push(dependency);
    }
  }
  return [...visited].sort();
}

export function dependencyPolicyPath(consumerRoot: string): string {
  return path.join(consumerRoot, POLICY_RELATIVE_PATH);
}

export function loadPluginDependencyPolicy(consumerRoot: string, manifestPluginNames: string[]): PluginDependencyPolicy {
  const policyPath = dependencyPolicyPath(consumerRoot);
  const releaseManifestPath = path.join(consumerRoot, '.specify', 'release-manifest.json');
  if (!fs.existsSync(policyPath) || !fs.existsSync(releaseManifestPath)) {
    throw new Error(`Missing plugin dependency policy integrity data at ${policyPath}. Rerun distribute.sh to sync the consumer payload.`);
  }

  let releaseManifest: z.infer<typeof ReleaseManifestSchema>;
  try {
    releaseManifest = ReleaseManifestSchema.parse(JSON.parse(fs.readFileSync(releaseManifestPath, 'utf-8')));
  } catch (error) {
    throw new Error(`Invalid release manifest at ${releaseManifestPath}: ${(error as Error).message}`);
  }
  const expected = releaseManifest.files[POLICY_RELATIVE_PATH];
  if (!expected) {
    throw new Error(`Release manifest is missing integrity data for ${POLICY_RELATIVE_PATH}. Rerun distribute.sh to sync the consumer payload.`);
  }

  const policyBytes = fs.readFileSync(policyPath);
  if (policyBytes.length !== expected.size || sha256Buffer(policyBytes) !== expected.sha256) {
    throw new Error(`Plugin dependency policy checksum mismatch at ${policyPath}. Rerun distribute.sh to sync the consumer payload.`);
  }
  try {
    return parsePolicy(JSON.parse(policyBytes.toString('utf-8')), manifestPluginNames);
  } catch (error) {
    throw new Error(`Invalid plugin dependency policy at ${policyPath}: ${(error as Error).message}`);
  }
}

export function resolvePluginSelection(
  policy: PluginDependencyPolicy,
  manifestPluginNames: string[],
  requestedPlugins: string[],
): ResolvedPluginSelection {
  const manifestIds = validateManifestPluginNames(manifestPluginNames);
  const validatedPolicy = parsePolicy(policy, manifestIds);
  const manifestSet = new Set(manifestIds);
  const requested = sortedUnique(requestedPlugins, 'requested plugin id');
  for (const plugin of requested) {
    if (!manifestSet.has(plugin)) throw new Error(`Requested plugin is missing from .specify/plugins/manifest.json: ${plugin}`);
  }

  const requiredBasePlugins = dependencyClosure(validatedPolicy, validatedPolicy.requiredPlugins);
  const base = new Set(requiredBasePlugins);
  const requestedOptionalPlugins = requested.filter((plugin) => !base.has(plugin));
  return {
    requiredBasePlugins,
    optionalPlugins: manifestIds.filter((plugin) => !base.has(plugin)),
    requestedPlugins: requestedOptionalPlugins,
    resolvedPlugins: dependencyClosure(validatedPolicy, [...requiredBasePlugins, ...requestedOptionalPlugins]),
  };
}
