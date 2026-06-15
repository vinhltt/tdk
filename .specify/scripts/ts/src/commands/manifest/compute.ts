#!/usr/bin/env bun
// CLI entry: compute-manifest. Mirrors Python main() + format_table().
// Orchestrates: scan → identify → compare → [seed] → [write] → output.
// Runs twice: once for .specify/plugins (classic root), once for .specify/codex-plugins (codex root).

import * as fs from 'node:fs';
import * as path from 'node:path';
import { Command } from 'commander';
import { loadManifest, writeManifest } from './io';
import { scanPluginFiles } from './scan-files';
import { identifyComponents } from './identify-components';
import { comparePlugin, compareComponents } from './compare';
import { seedVersionsFromChecksums } from './seed-versions';
import { findProjectRoot } from './find-project-root';
import { readComponentVersionFromSource } from './read-component-version';
import { COMPONENT_TYPES } from './types';
import { formatAgentJson, writeAgentJson } from '../../utils/index';
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
// locatorVariant: how to find plugin.json within each package dir
// 'classic'  — .claude-plugin/plugin.json → plugin.json (used for .specify/plugins)
// 'codex'    — .codex-plugin/plugin.json → plugin.json (used for .specify/codex-plugins)
// ---------------------------------------------------------------------------

type LocatorVariant = 'classic' | 'codex';

interface RootScanResult {
  comparisonResults: Record<string, PluginComparison>;
  hasDrift: boolean;
  pluginCount: number;
}

/**
 * Scan all packages in rootDir, build/compare manifest entries, optionally write.
 * Returns comparison results + drift flag — does NOT print or exit.
 * When rootDir is absent or not a directory, returns empty results (no-op).
 */
function computeManifestForRoot(
  rootDir: string,
  manifestPath: string,
  locatorVariant: LocatorVariant,
  opts: { write?: boolean; seed?: boolean },
  seededVersions: Record<string, Partial<Record<string, Record<string, string>>>>,
): RootScanResult {
  // Absent root is a no-op — keeps fresh/single-plugin trees working
  if (!fs.existsSync(rootDir) || !fs.statSync(rootDir).isDirectory()) {
    return { comparisonResults: {}, hasDrift: false, pluginCount: 0 };
  }

  const existing = loadManifest(manifestPath);
  const currentManifest: Manifest = { algorithm: 'sha256', generated_at: '', plugins: {} };
  const comparisonResults: Record<string, PluginComparison> = {};

  for (const pluginDirName of fs.readdirSync(rootDir).sort()) {
    const pluginDir = path.join(rootDir, pluginDirName);
    if (!fs.statSync(pluginDir).isDirectory() || pluginDirName.startsWith('.')) continue;

    // Locate plugin.json — variant-specific candidates
    let pjPath: string;
    if (locatorVariant === 'codex') {
      // Codex packages: .codex-plugin/plugin.json first, then root plugin.json
      pjPath = path.join(pluginDir, '.codex-plugin', 'plugin.json');
      if (!fs.existsSync(pjPath)) pjPath = path.join(pluginDir, 'plugin.json');
    } else {
      // Classic packages: .claude-plugin/plugin.json first, then root plugin.json
      pjPath = path.join(pluginDir, '.claude-plugin', 'plugin.json');
      if (!fs.existsSync(pjPath)) pjPath = path.join(pluginDir, 'plugin.json');
    }
    if (!fs.existsSync(pjPath)) continue;

    let pjData: Record<string, unknown> = {};
    try { pjData = JSON.parse(fs.readFileSync(pjPath, 'utf-8')) as Record<string, unknown>; } catch { /* ignore */ }
    const pluginVersion = (pjData['version'] as string | undefined) ?? '0.1.0';

    // Scan files → plain object (insertion order preserved from sorted Map)
    const fileHashes: Record<string, string> = {};
    for (const [rel, sha] of scanPluginFiles(pluginDir)) fileHashes[rel] = sha;

    const existingPlugin = existing.plugins[pluginDirName];

    if (locatorVariant === 'codex') {
      // Codex root: files-only entries — skip identifyComponents/readComponentVersionFromSource.
      // Install reader only consumes entry.files; components not needed for codex packages.
      currentManifest.plugins[pluginDirName] = {
        version: pluginVersion,
        files: fileHashes,
      };
    } else {
      // Classic root: full component identification + version resolution (existing behavior)
      const components: PluginComponents = identifyComponents(pluginDir, pluginDirName);
      const existingComponents = existingPlugin?.components ?? {};
      const seedPlugin = seededVersions[pluginDirName] ?? {};

      for (const compType of COMPONENT_TYPES) {
        for (const compName of Object.keys(components[compType])) {
          // Source-of-truth precedence: definition file frontmatter (plugin-bump writes here)
          // → existing manifest entry → --seed migration → default 0.1.0
          const version =
            readComponentVersionFromSource(pluginDir, compType, compName)
            ?? (existingComponents[compType] as Record<string, { version: string }> | undefined)?.[compName]?.['version']
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
    }

    const fileComparison = comparePlugin(fileHashes, (existingPlugin?.files ?? {}) as Record<string, string>);
    const fc = {
      newFiles: fileComparison.new_files,
      changedFiles: fileComparison.changed_files,
      removedFiles: fileComparison.removed_files,
      unchangedFiles: fileComparison.unchanged_files,
    };

    if (locatorVariant === 'codex') {
      // Components comparison uses empty maps for codex entries
      const emptyComponents: PluginComponents = { skills: {}, agents: {}, hooks: {}, commands: {} };
      const compComparison = compareComponents(emptyComponents, emptyComponents, fc, pluginDirName);
      comparisonResults[pluginDirName] = { ...fileComparison, ...compComparison };
    } else {
      const components = currentManifest.plugins[pluginDirName]!.components as unknown as PluginComponents ?? { skills: {}, agents: {}, hooks: {}, commands: {} };
      const compComparison = compareComponents(
        components,
        (existingPlugin?.components ?? {}) as unknown as PluginComponents,
        fc,
        pluginDirName,
      );
      comparisonResults[pluginDirName] = { ...fileComparison, ...compComparison };
    }
  }

  // --write: update manifest.json on disk
  if (opts.write) {
    fs.mkdirSync(path.dirname(manifestPath), { recursive: true });
    writeManifest(manifestPath, currentManifest);
    process.stderr.write(`Written manifest.json (${Object.keys(currentManifest.plugins).length} plugins) [${locatorVariant}]\n`);
  }

  const hasDrift = Object.values(comparisonResults).some(
    (c) => c.new_files.length > 0 || c.changed_files.length > 0 || c.removed_files.length > 0,
  );

  return { comparisonResults, hasDrift, pluginCount: Object.keys(currentManifest.plugins).length };
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

  const pluginsDir = path.join(projectRoot, '.specify', 'plugins');
  const pluginsManifestPath = path.join(pluginsDir, 'manifest.json');
  const codexDir = path.join(projectRoot, '.specify', 'codex-plugins');
  const codexManifestPath = path.join(codexDir, 'manifest.json');

  // Empty plugins dir — match Python: print(json.dumps({})) and return
  // Only early-exit when BOTH roots are absent (preserves codex-only trees in future)
  const pluginsExists = fs.existsSync(pluginsDir) && fs.statSync(pluginsDir).isDirectory();
  const codexExists = fs.existsSync(codexDir) && fs.statSync(codexDir).isDirectory();
  if (!pluginsExists && !codexExists) {
    process.stdout.write('{}\n');
    return;
  }

  let seededVersions: Record<string, Partial<Record<string, Record<string, string>>>> = {};
  if (opts.seed) {
    seededVersions = seedVersionsFromChecksums(pluginsDir);
  }

  // Run classic plugins root scan (always — even if dir is absent, returns empty no-op)
  const pluginsResult = computeManifestForRoot(
    pluginsDir,
    pluginsManifestPath,
    'classic',
    opts,
    seededVersions,
  );

  // Run codex plugins root scan — no-op when .specify/codex-plugins/ is absent
  const codexResult = computeManifestForRoot(
    codexDir,
    codexManifestPath,
    'codex',
    opts,
    {},
  );

  // Merge comparison results for output (plugins first, then codex — sorted within each)
  const mergedComparisons: Record<string, PluginComparison> = {
    ...pluginsResult.comparisonResults,
    ...codexResult.comparisonResults,
  };

  // --check: exit 1 if any drift in EITHER root
  if (opts.check) {
    const hasDrift = pluginsResult.hasDrift || codexResult.hasDrift;
    if (hasDrift) {
      process.stdout.write(opts.output === 'table' ? formatTable(mergedComparisons) + '\n' : formatAgentJson(mergedComparisons));
      process.exit(1);
    } else {
      process.stderr.write('OK: manifest.json is up to date\n');
      process.exit(0);
    }
  }

  // Default: output comparison results
  if (opts.output === 'table') {
    process.stdout.write(`${formatTable(mergedComparisons)}\n`);
  } else {
    writeAgentJson(mergedComparisons);
  }
}

main();
