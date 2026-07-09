import { Command } from 'commander';
import * as path from 'node:path';
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
  resolveCodexSettings,
  settingsPathFor,
  type InstallSettings,
  type ResolvedClaudeSettings,
  type ResolvedCodexSettings,
} from './install-settings';
import { buildCodexInstallPlan } from './codex-install-plan';
import { buildClaudeInstallPlan } from './install-plan';
import { applyInstallPlan } from './install-writer';
import { askPrefixInteractively, confirmInstallTarget, confirmOverwrite, selectHarnessInteractively, selectPluginsInteractively } from './prompt';
import { canUseCheckboxPrompt } from './checkbox-prompt';
import { renderApplyResult, renderInstallPlan } from './render';
import type { HarnessName, PrefixMigrationPlan } from './types';

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
function assertCompanionPlugins(selectedPlugins: string[]): void {
  const selected = new Set(selectedPlugins);
  const missingCompanion = ['tdk-core', 'tdk-epic']
    .filter((plugin) => selected.has(plugin) && !selected.has('tdk-utils'));
  if (missingCompanion.length === 0) return;

  const suggested = [...selectedPlugins, 'tdk-utils']
    .filter((plugin, index, plugins) => plugins.indexOf(plugin) === index)
    .join(',');
  throw new Error(
    `Selected ${missingCompanion.join(', ')} requires companion plugin tdk-utils. Use --plugins ${suggested} or --all-plugins.`,
  );
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
async function resolveHarnessOption(value: string | undefined): Promise<HarnessName[]> {
  if (value) return parseHarnessList(value);
  if (canUseCheckboxPrompt(process.stdin, process.stdout)) {
    return selectHarnessInteractively(['claude', 'codex']);
  }
  throw new Error('No harness provided. Use --harness claude.');
}
function buildNextInstallSettings(settings: InstallSettings | undefined, resolved: ResolvedClaudeSettings | ResolvedCodexSettings): InstallSettings {
  const base = settings ?? defaultInstallSettings();
  const harnesses = resolved.harness === 'claude'
    ? {
      ...base.harnesses,
      claude: {
        enabled: true,
        targetDir: resolved.targetDir,
        settingsPath: resolved.settingsPath,
      },
    }
    : {
      ...base.harnesses,
      codex: {
        enabled: true,
        targetDir: resolved.targetDir,
      },
    };
  return {
    version: 1,
    defaults: {
      sourcePrefix: resolved.sourcePrefix,
      targetPrefix: resolved.targetPrefix,
      selectedPlugins: [...resolved.selectedPlugins].sort(),
      rewrite: resolved.rewrite,
    },
    harnesses,
  };
}
async function resolveTargetPrefix(opts: InstallOptions, base: ResolvedClaudeSettings | ResolvedCodexSettings): Promise<{ targetPrefix: string; migration?: PrefixMigrationPlan }> {
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
export function createInstallCommand(): Command {
  return new Command('install')
    .description('Install selected TDK plugin artifacts into a Claude harness')
    .argument('[root]', 'consumer project root')
    .option('--harness <names>', 'target harness list (comma-separated; claude or codex)')
    .option('--plugins <names>', 'comma-separated plugin names')
    .option('--all-plugins', 'install all plugins listed in .specify/plugins/manifest.json')
    .option('--prefix <prefix>', 'target prefix for first installs')
    .option('--migrate-prefix <prefix>', 'explicitly migrate an existing install to a new prefix')
    .option('--dry-run', 'render the install plan without mutating files')
    .option('--yes', 'approve clean writes/updates/removals without prompting')
    .action(async (rootArg: string | undefined, opts: InstallOptions) => {
      try {
        const harnesses = await resolveHarnessOption(opts.harness);
        if (harnesses.length > 1 && harnesses.includes('codex')) {
          throw new Error('Combined Claude+Codex installs are not supported in v1. Run one harness at a time.');
        }
        const root = resolveConsumerRoot(rootArg ? path.resolve(rootArg) : process.cwd());
        const installSettings = loadInstallSettings(root.consumerRoot);
        const targetHarness = harnesses.includes('codex') ? 'codex' : 'claude';
        const previousManifest = loadHarnessManifest(root.consumerRoot, targetHarness);
        const baseSettings = targetHarness === 'codex' ? resolveCodexSettings({
          root: root.consumerRoot,
          settings: installSettings,
          oldManifest: previousManifest,
        }) : resolveClaudeSettings({
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
        assertCompanionPlugins(selectedPlugins);
        const prefix = await resolveTargetPrefix(opts, baseSettings);
        const resolvedSettings = {
          ...baseSettings,
          selectedPlugins,
          targetPrefix: prefix.targetPrefix,
        };
        if (!opts.dryRun && process.stdin.isTTY) {
          const confirmed = await confirmInstallTarget({
            consumerRoot: root.consumerRoot,
            targetDir: resolvedSettings.targetDir,
            settingsPath: resolvedSettings.harness === 'claude' ? resolvedSettings.settingsPath : '.codex/config.toml',
            targetPrefix: resolvedSettings.targetPrefix,
            selectedPlugins,
          });
          if (!confirmed) throw new Error('Install cancelled.');
        }
        const nextInstallSettings = buildNextInstallSettings(installSettings, resolvedSettings);
        const plan = resolvedSettings.harness === 'codex'
          ? buildCodexInstallPlan({
            consumerRoot: root.consumerRoot,
            selectedPlugins,
            previousManifest,
            sourcePrefix: resolvedSettings.sourcePrefix,
            targetPrefix: resolvedSettings.targetPrefix,
            installSettingsPath: settingsPathFor(root.consumerRoot),
            nextInstallSettings,
          })
          : (() => {
            const inventory = discoverPluginInventory(root.consumerRoot, selectedPlugins);
            const rewritePlugins = discoverPrefixRewritePlugins(root.consumerRoot);
            const settings = readSettings(root.consumerRoot, resolvedSettings.settingsPath);
            const claudePlan = buildClaudeInstallPlan({
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
            claudePlan.warnings.push(...inventory.warnings);
            return claudePlan;
          })();
        plan.warnings.push(...root.warnings);

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
        process.stderr.write(`[tdk-setup install] error: ${(err as Error).message}\n`);
        process.exit(1);
      }
    });
}
