import * as fs from 'node:fs';
import * as path from 'node:path';
import type { Manifest, ManifestEntry } from '../changelog/checks/types';
import { claudeTargetMapper } from './claude-target-mapper';
import { validateSafeSegment } from './install-settings-paths';
import type { DiscoveredPlugin, DiscoveredPluginFile, PluginInventory } from './types';

const INSTALLABLE_PREFIXES = ['skills/', 'agents/', 'hooks/', 'commands/', 'lib/', 'scripts/'];

function readJson<T>(filePath: string): T {
  try {
    return JSON.parse(fs.readFileSync(filePath, 'utf-8')) as T;
  } catch (err) {
    throw new Error(`Failed to read ${filePath}: ${(err as Error).message}`);
  }
}

function isInstallableFile(relativePath: string): boolean {
  return INSTALLABLE_PREFIXES.some((prefix) => relativePath.startsWith(prefix));
}

function discoverPlugin(pluginsDir: string, name: string, entry: ManifestEntry): DiscoveredPlugin {
  validateSafeSegment(name, 'plugin id');
  const root = path.join(pluginsDir, name);
  if (!fs.existsSync(root) || !fs.statSync(root).isDirectory()) {
    throw new Error(`Selected plugin "${name}" is missing at ${root}. Rerun distribute.sh to sync .specify/plugins.`);
  }

  const files: DiscoveredPluginFile[] = [];
  let hookConfigChecksum: string | undefined;
  for (const [sourceRelativePath, sourceChecksum] of Object.entries(entry.files ?? {})) {
    if (!isInstallableFile(sourceRelativePath)) continue;
    if (path.isAbsolute(sourceRelativePath) || sourceRelativePath.split('/').includes('..')) {
      throw new Error(`Unsafe manifest path for plugin "${name}": ${sourceRelativePath}`);
    }
    if (sourceRelativePath === 'hooks/hooks.json') hookConfigChecksum = sourceChecksum;

    const targetRelativePath = claudeTargetMapper.mapTargetPath(name, sourceRelativePath);
    if (!targetRelativePath) continue;

    const sourcePath = path.join(root, sourceRelativePath);
    if (!fs.existsSync(sourcePath) || !fs.statSync(sourcePath).isFile()) {
      throw new Error(`Manifest file is missing for plugin "${name}": ${sourceRelativePath}. Rerun distribute.sh.`);
    }

    files.push({
      plugin: name,
      sourceRelativePath,
      sourcePath,
      sourceChecksum,
      targetRelativePath,
    });
  }

  files.sort((a, b) => a.targetRelativePath.localeCompare(b.targetRelativePath));
  return { name, version: entry.version, components: entry.components, hookConfigChecksum, root, files };
}

function readMarketplacePluginNames(pluginsDir: string): string[] {
  const marketplacePath = path.join(pluginsDir, 'marketplace.json');
  if (!fs.existsSync(marketplacePath)) return [];
  try {
    const data = readJson<{ plugins?: Record<string, unknown> | string[] }>(marketplacePath);
    if (Array.isArray(data.plugins)) return data.plugins;
    if (data.plugins && typeof data.plugins === 'object') return Object.keys(data.plugins);
  } catch {
    return [];
  }
  return [];
}

export function discoverPluginInventory(consumerRoot: string, selectedPlugins: string[]): PluginInventory {
  const pluginsDir = path.join(consumerRoot, '.specify', 'plugins');
  const manifestPath = path.join(pluginsDir, 'manifest.json');
  if (!fs.existsSync(pluginsDir)) {
    throw new Error(`Missing .specify/plugins at ${pluginsDir}. Rerun distribute.sh first.`);
  }
  if (!fs.existsSync(manifestPath)) {
    throw new Error(`Missing plugin manifest at ${manifestPath}. Rerun distribute.sh first.`);
  }

  const manifest = readJson<Manifest>(manifestPath);
  const manifestPluginNames = Object.keys(manifest.plugins ?? {}).sort();
  const names = selectedPlugins.length > 0 ? selectedPlugins : manifestPluginNames;
  const warnings: string[] = [];

  const marketplaceNames = readMarketplacePluginNames(pluginsDir).sort();
  if (marketplaceNames.length > 0 && marketplaceNames.join('\0') !== manifestPluginNames.join('\0')) {
    warnings.push('Plugin marketplace metadata differs from .specify/plugins/manifest.json; manifest plugin keys are authoritative.');
  }

  const plugins: DiscoveredPlugin[] = [];
  for (const name of names) {
    const entry = manifest.plugins?.[name];
    if (!entry) {
      throw new Error(`Unknown plugin "${name}" in .specify/plugins/manifest.json.`);
    }
    plugins.push(discoverPlugin(pluginsDir, name, entry));
  }

  return { consumerRoot, pluginsDir, manifestPath, plugins, warnings };
}

export function listManifestPluginNames(consumerRoot: string): string[] {
  const manifestPath = path.join(consumerRoot, '.specify', 'plugins', 'manifest.json');
  const manifest = readJson<Manifest>(manifestPath);
  return Object.keys(manifest.plugins ?? {}).sort();
}
