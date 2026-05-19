#!/usr/bin/env bun
// CLI entry: compute-manifest. Mirrors Python main() + format_table().
// Orchestrates: scan → identify → compare → [seed] → [write] → output.

import * as fs from 'node:fs';
import * as path from 'node:path';
import { Command } from 'commander';
import { loadManifest, writeManifest } from './io';
import { scanPluginFiles } from './scan-files';
import { identifyComponents } from './identify-components';
import { comparePlugin, compareComponents } from './compare';
import { seedVersionsFromChecksums } from './seed-versions';
import { findProjectRoot } from './find-project-root';
import { COMPONENT_TYPES } from './types';
import type { Manifest, ManifestEntry, PluginComparison, PluginComponents } from './types';

// ---------------------------------------------------------------------------
// format_table: human-readable comparison table (mirrors Python format_table)
// ---------------------------------------------------------------------------

function formatTable(results: Record<string, PluginComparison>): string {
  const lines: string[] = [
    `${'Plugin'.padEnd(30)} ${'New'.padEnd(6)} ${'Changed'.padEnd(9)} ${'Removed'.padEnd(9)} ${'Unchanged'.padEnd(10)}`,
    '-'.repeat(64),
  ];
  for (const [pluginName, data] of Object.entries(results).sort()) {
    const n = (data.new_files ?? []).length;
    const c = (data.changed_files ?? []).length;
    const r = (data.removed_files ?? []).length;
    const u = (data.unchanged_files ?? []).length;
    lines.push(`${pluginName.padEnd(30)} ${String(n).padEnd(6)} ${String(c).padEnd(9)} ${String(r).padEnd(9)} ${String(u).padEnd(10)}`);
  }
  return lines.join('\n');
}

// ---------------------------------------------------------------------------
// main
// ---------------------------------------------------------------------------

function main(): void {
  const program = new Command()
    .name('compute-manifest')
    .description('Compute SHA-256 file hashes and track component versions for plugins/')
    .option('--project-root <path>', 'Project root (default: auto-detect via git)')
    .option('--output <format>', 'Output format (json|table)', 'json')
    .option('--write', 'Write/update manifest.json')
    .option('--check', 'Compare current files against manifest.json, exit 1 if drift')
    .option('--seed', 'One-time: read _checksums versions from plugin.json to seed manifest.json')
    .parse(process.argv);

  const opts = program.opts<{
    projectRoot?: string;
    output: string;
    write?: boolean;
    check?: boolean;
    seed?: boolean;
  }>();

  // Mirror Python: if --project-root supplied, just resolve it; else auto-detect
  const start = opts.projectRoot ?? process.cwd();
  const projectRoot = opts.projectRoot ? fs.realpathSync(start) : findProjectRoot(start);

  const marketplaceDir = path.join(projectRoot, '.specify', 'plugins');
  const manifestPath = path.join(marketplaceDir, 'manifest.json');

  // Empty plugins dir — match Python: print(json.dumps({})) and return
  if (!fs.existsSync(marketplaceDir) || !fs.statSync(marketplaceDir).isDirectory()) {
    process.stdout.write('{}\n');
    return;
  }

  const existing = loadManifest(manifestPath);
  let seededVersions: Record<string, Partial<Record<string, Record<string, string>>>> = {};
  if (opts.seed) {
    seededVersions = seedVersionsFromChecksums(marketplaceDir);
  }

  const currentManifest: Manifest = { algorithm: 'sha256', generated_at: '', plugins: {} };
  const comparisonResults: Record<string, PluginComparison> = {};

  for (const pluginDirName of fs.readdirSync(marketplaceDir).sort()) {
    const pluginDir = path.join(marketplaceDir, pluginDirName);
    if (!fs.statSync(pluginDir).isDirectory() || pluginDirName.startsWith('.')) continue;

    // Locate plugin.json — .claude-plugin/ first, then root
    let pjPath = path.join(pluginDir, '.claude-plugin', 'plugin.json');
    if (!fs.existsSync(pjPath)) pjPath = path.join(pluginDir, 'plugin.json');
    if (!fs.existsSync(pjPath)) continue;

    let pjData: Record<string, unknown> = {};
    try { pjData = JSON.parse(fs.readFileSync(pjPath, 'utf-8')) as Record<string, unknown>; } catch { /* ignore */ }
    const pluginVersion = (pjData['version'] as string | undefined) ?? '0.1.0';

    // Scan files → plain object (insertion order preserved from sorted Map)
    const fileHashes: Record<string, string> = {};
    for (const [rel, sha] of scanPluginFiles(pluginDir)) fileHashes[rel] = sha;

    // Identify components then resolve versions in-place (preserves key insertion order)
    const components: PluginComponents = identifyComponents(pluginDir, pluginDirName);
    const existingPlugin = existing.plugins[pluginDirName];
    const existingComponents = existingPlugin?.components ?? {};
    const seedPlugin = seededVersions[pluginDirName] ?? {};

    for (const compType of COMPONENT_TYPES) {
      for (const compName of Object.keys(components[compType])) {
        const version =
          (existingComponents[compType] as Record<string, { version: string }> | undefined)?.[compName]?.['version']
          ?? (seedPlugin[compType] as Record<string, string> | undefined)?.[compName]
          ?? '0.1.0';
        components[compType][compName] = { version }; // mutate in-place
      }
    }

    currentManifest.plugins[pluginDirName] = {
      version: pluginVersion,
      // Cast: version is always set after loop above; PluginComponents.ComponentMap allows undefined
      components: components as ManifestEntry['components'],
      files: fileHashes,
    };

    const fileComparison = comparePlugin(fileHashes, (existingPlugin?.files ?? {}) as Record<string, string>);
    const fc = {
      newFiles: fileComparison.new_files,
      changedFiles: fileComparison.changed_files,
      removedFiles: fileComparison.removed_files,
      unchangedFiles: fileComparison.unchanged_files,
    };
    const compComparison = compareComponents(
      components,
      (existingPlugin?.components ?? {}) as unknown as PluginComponents,
      fc,
      pluginDirName,
    );
    comparisonResults[pluginDirName] = { ...fileComparison, ...compComparison };
  }

  // --write: update manifest.json on disk
  if (opts.write) {
    writeManifest(manifestPath, currentManifest);
    process.stderr.write(`Written manifest.json (${Object.keys(currentManifest.plugins).length} plugins)\n`);
  }

  // --check: exit 1 if any drift detected
  if (opts.check) {
    const hasDrift = Object.values(comparisonResults).some(
      (c) => c.new_files.length > 0 || c.changed_files.length > 0 || c.removed_files.length > 0,
    );
    if (hasDrift) {
      process.stdout.write(opts.output === 'table' ? formatTable(comparisonResults) + '\n' : JSON.stringify(comparisonResults, null, 2) + '\n');
      process.exit(1);
    } else {
      process.stderr.write('OK: manifest.json is up to date\n');
      process.exit(0);
    }
  }

  // Default: output comparison results
  process.stdout.write(opts.output === 'table' ? formatTable(comparisonResults) + '\n' : JSON.stringify(comparisonResults, null, 2) + '\n');
}

main();
