import { Command } from 'commander';
import { blockingCollisions } from './collisions';
import { resolveConsumerRoot } from './root-resolution';
import { discoverPluginInventory, discoverPrefixRewritePlugins, listManifestPluginNames } from './plugin-discovery';
import { loadHarnessManifest } from './manifest-store';
import { readSettings } from './hook-merge';
import {
  defaultInstallSettings,
  loadInstallSettings,
  normalizePrefix,
  parseHarnessList,
  resolveClaudeSettings,
  settingsPathFor,
  type InstallSettings,
  type ResolvedClaudeSettings,
} from './install-settings';
import { buildClaudeInstallPlan } from './install-plan';
import { applyInstallPlan } from './install-writer';
import { askPrefixInteractively, confirmInstallTarget, confirmOverwrite, selectPluginsInteractively } from './prompt';
import { renderApplyResult, renderInstallPlan } from './render';
import type { PrefixMigrationPlan } from './types';

interface InstallOptions {
  harness?: string;
  plugins?: string;
  allPlugins?: boolean;
  dryRun?: boolean;
  yes?: boolean;
  prefix?: string;
  migratePrefix?: string;
}
function parsePlugins(value: string | undefined): string[] {
  if (!value) return [];
  const plugins = value.split(',').map((name) => name.trim()).filter(Boolean);
  if (plugins.length === 0) throw new Error('--plugins requires at least one plugin name');
  return [...new Set(plugins)];
}
function manifestHasState(manifest: ReturnType<typeof loadHarnessManifest>): boolean {
  return manifest.selectedPlugins.length > 0 || manifest.managedFiles.length > 0 || manifest.managedHooks.length > 0;
}
async function resolveSelection(consumerRoot: string, opts: InstallOptions, savedPlugins: string[], hasOwnershipState: boolean): Promise<string[]> {
  const explicit = parsePlugins(opts.plugins);
  if (opts.allPlugins && explicit.length > 0) {
    throw new Error('--plugins conflicts with --all-plugins');
  }
  if (opts.allPlugins) return listManifestPluginNames(consumerRoot);
  if (explicit.length > 0) return explicit;
  if (savedPlugins.length > 0) {
    if (!process.stdin.isTTY && !hasOwnershipState) {
      throw new Error('Saved plugin selection requires an ownership manifest. Use --plugins <name[,name]> or --all-plugins to reinstall explicitly.');
    }
    return savedPlugins;
  }
  if (!process.stdin.isTTY) {
    throw new Error('No plugin selector provided. Use --plugins <name[,name]> or --all-plugins.');
  }
  return selectPluginsInteractively(listManifestPluginNames(consumerRoot));
}
function resolveHarnessOption(value: string | undefined): 'claude' {
  if (!value) throw new Error('--harness is required.');
  const harnesses = parseHarnessList(value);
  const unsupported = harnesses.filter((harness) => harness !== 'claude');
  if (unsupported.length > 0) {
    throw new Error(`Harness "${unsupported.join(',')}" is recognized but not implemented yet. Current install supports --harness claude only.`);
  }
  return 'claude';
}
function buildNextInstallSettings(settings: InstallSettings | undefined, resolved: ResolvedClaudeSettings): InstallSettings {
  const base = settings ?? defaultInstallSettings();
  return {
    version: 1,
    defaults: {
      sourcePrefix: resolved.sourcePrefix,
      targetPrefix: resolved.targetPrefix,
      selectedPlugins: [...resolved.selectedPlugins].sort(),
      rewrite: resolved.rewrite,
    },
    harnesses: {
      ...base.harnesses,
      claude: {
        enabled: true,
        targetDir: resolved.targetDir,
        settingsPath: resolved.settingsPath,
      },
    },
  };
}
async function resolveTargetPrefix(opts: InstallOptions, base: ResolvedClaudeSettings): Promise<{ targetPrefix: string; migration?: PrefixMigrationPlan }> {
  if (opts.prefix && opts.migratePrefix) {
    throw new Error('--prefix conflicts with --migrate-prefix');
  }
  if (opts.migratePrefix) {
    if (!base.existingInstall) throw new Error('--migrate-prefix requires existing install settings or ownership state.');
    const toPrefix = normalizePrefix(opts.migratePrefix);
    if (toPrefix === base.targetPrefix) throw new Error('--migrate-prefix matches the current saved prefix.');
    return { targetPrefix: toPrefix, migration: { fromPrefix: base.targetPrefix, toPrefix } };
  }

  if (opts.prefix) {
    const cliPrefix = normalizePrefix(opts.prefix);
    if (base.existingInstall && cliPrefix !== base.targetPrefix) {
      throw new Error('Existing install prefix changes require --migrate-prefix <prefix>.');
    }
    return { targetPrefix: cliPrefix };
  }

  if (!base.existingInstall && process.stdin.isTTY) {
    const interactivePrefix = await askPrefixInteractively(base.targetPrefix);
    return { targetPrefix: interactivePrefix };
  }

  return { targetPrefix: base.targetPrefix };
}
export function createHarnessInstallCommand(): Command {
  return new Command('install')
    .description('Install selected TDK plugin artifacts into a Claude harness')
    .requiredOption('--harness <names>', 'target harness list (comma-separated; currently claude only)')
    .option('--plugins <names>', 'comma-separated plugin names')
    .option('--all-plugins', 'install all plugins listed in .specify/plugins/manifest.json')
    .option('--prefix <prefix>', 'target prefix for first installs')
    .option('--migrate-prefix <prefix>', 'explicitly migrate an existing install to a new prefix')
    .option('--dry-run', 'render the install plan without mutating files')
    .option('--yes', 'approve clean writes/updates/removals without prompting')
    .action(async (opts: InstallOptions) => {
      try {
        resolveHarnessOption(opts.harness);
        const root = resolveConsumerRoot(process.cwd());
        const installSettings = loadInstallSettings(root.consumerRoot);
        const previousManifest = loadHarnessManifest(root.consumerRoot);
        const baseSettings = resolveClaudeSettings({
          root: root.consumerRoot,
          settings: installSettings,
          oldManifest: previousManifest,
        });
        const selectedPlugins = await resolveSelection(
          root.consumerRoot,
          opts,
          baseSettings.selectedPlugins,
          manifestHasState(previousManifest),
        );
        const prefix = await resolveTargetPrefix(opts, baseSettings);
        const resolvedSettings: ResolvedClaudeSettings = {
          ...baseSettings,
          selectedPlugins,
          targetPrefix: prefix.targetPrefix,
        };
        if (!opts.dryRun && process.stdin.isTTY) {
          const confirmed = await confirmInstallTarget({
            consumerRoot: root.consumerRoot,
            targetDir: resolvedSettings.targetDir,
            settingsPath: resolvedSettings.settingsPath,
            targetPrefix: resolvedSettings.targetPrefix,
            selectedPlugins,
          });
          if (!confirmed) throw new Error('Install cancelled.');
        }
        const nextInstallSettings = buildNextInstallSettings(installSettings, resolvedSettings);
        const inventory = discoverPluginInventory(root.consumerRoot, selectedPlugins);
        const rewritePlugins = discoverPrefixRewritePlugins(root.consumerRoot);
        const settings = readSettings(root.consumerRoot, resolvedSettings.settingsPath);
        const plan = buildClaudeInstallPlan({
          consumerRoot: root.consumerRoot,
          selectedPlugins,
          plugins: inventory.plugins,
          rewritePlugins,
          previousManifest,
          settings,
          sourcePrefix: resolvedSettings.sourcePrefix,
          targetPrefix: resolvedSettings.targetPrefix,
          rewrite: resolvedSettings.rewrite,
          targetDir: resolvedSettings.targetDir,
          settingsPath: resolvedSettings.settingsPath,
          installSettingsPath: settingsPathFor(root.consumerRoot),
          nextInstallSettings,
          migration: prefix.migration,
        });
        plan.warnings.push(...root.warnings, ...inventory.warnings);

        process.stdout.write(renderInstallPlan(plan));
        if (opts.dryRun) {
          if (blockingCollisions(plan.collisions, plan.prompts).length > 0) process.exitCode = 1;
          return;
        }

        const result = await applyInstallPlan(plan, {
          yes: Boolean(opts.yes),
          interactive: Boolean(process.stdin.isTTY),
          approveOverwrite: confirmOverwrite,
        });
        process.stdout.write(renderApplyResult(result));
      } catch (err) {
        process.stderr.write(`[tdk harness install] error: ${(err as Error).message}\n`);
        process.exit(1);
      }
    });
}
