import { Command } from 'commander';
import * as fs from 'node:fs';
import * as path from 'node:path';
import { blockingCollisions } from './collisions';
import { resolveConsumerRoot } from './root-resolution';
import { discoverPluginInventory, discoverPrefixRewritePlugins, listManifestPluginNames } from './plugin-discovery';
import { legacyManifestPathFor, loadHarnessManifest, manifestPathFor } from './manifest-store';
import { assertResolvedCodexPackages } from './codex-install-preflight';
import { loadPluginDependencyPolicy, resolvePluginSelection } from './plugin-dependencies';
import { validateInstallPlanTargets } from './target-path-safety';
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
import { claudeInstallIsStale, claudeInstallLocalModifications } from './install-drift';
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
  check?: boolean;
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
async function resolveRequestedPlugins(opts: InstallOptions, optionalPlugins: string[], savedSelection?: string[]): Promise<string[]> {
  const explicit = parsePlugins(opts.plugins);
  if (opts.allPlugins && explicit.length > 0) {
    throw new Error('--plugins conflicts with --all-plugins');
  }
  if (opts.allPlugins) return optionalPlugins;
  if (explicit.length > 0) return explicit;
  if (opts.check && savedSelection !== undefined) return savedSelection;
  if (opts.check || !process.stdin.isTTY) {
    throw new Error('No plugin selector provided. Use --plugins <name[,name]> or --all-plugins.');
  }
  return selectPluginsInteractively(optionalPlugins);
}
async function resolveHarnessOption(value: string | undefined): Promise<HarnessName[]> {
  if (value) return parseHarnessList(value);
  if (canUseCheckboxPrompt(process.stdin, process.stdout)) {
    return selectHarnessInteractively(['claude', 'codex']);
  }
  throw new Error('No harness provided. Use --harness claude.');
}
function buildNextInstallSettings(
  settings: InstallSettings | undefined,
  resolved: ResolvedClaudeSettings | ResolvedCodexSettings,
  requestedOptionalPlugins: string[],
): InstallSettings {
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
      selectedPlugins: [...requestedOptionalPlugins].sort(),
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

  if (!opts.check && !base.existingInstall && process.stdin.isTTY) {
    const interactivePrefix = await askPrefixInteractively(base.targetPrefix);
    return { targetPrefix: interactivePrefix };
  }

  return { targetPrefix: base.targetPrefix };
}
export function createInstallCommand(): Command {
  const checkIndex = process.argv.indexOf('--check');
  const terminatorIndex = process.argv.indexOf('--');
  const checkRequested = checkIndex !== -1 && (terminatorIndex === -1 || checkIndex < terminatorIndex);
  return new Command('install')
    // Parse failures occur before the action handler; they must not look stale.
    .exitOverride((error) => {
      process.exit(checkRequested && error.exitCode !== 0 ? 2 : error.exitCode);
    })
    .description('Install selected TDK plugin artifacts into a Claude harness')
    .argument('[root]', 'consumer project root')
    .option('--harness <names>', 'target harness list (comma-separated; claude or codex)')
    .option('--plugins <names>', 'comma-separated plugin names')
    .option('--all-plugins', 'install all plugins listed in .specify/plugins/manifest.json')
    .option('--prefix <prefix>', 'target prefix for first installs')
    .option('--migrate-prefix <prefix>', 'explicitly migrate an existing install to a new prefix')
    .option('--dry-run', 'render the install plan without mutating files')
    .option('--check', 'check Claude projection freshness without prompting or mutating files (0 current, 1 stale, 2 error)')
    .option('--yes', 'approve clean writes/updates/removals without prompting')
    .action(async (rootArg: string | undefined, opts: InstallOptions) => {
      try {
        if (opts.check && (opts.yes || opts.dryRun)) {
          throw new Error('--check cannot be combined with --yes or --dry-run.');
        }
        if (opts.check && !opts.harness) {
          throw new Error('--check requires --harness claude.');
        }
        const harnesses = await resolveHarnessOption(opts.harness);
        if (opts.check && (harnesses.length !== 1 || harnesses[0] !== 'claude')) {
          throw new Error('--check is available only with --harness claude.');
        }
        if (harnesses.length > 1 && harnesses.includes('codex')) {
          throw new Error('Combined Claude+Codex installs are not supported in v1. Run one harness at a time.');
        }
        const root = resolveConsumerRoot(rootArg ? path.resolve(rootArg) : process.cwd());
        const manifestPluginNames = listManifestPluginNames(root.consumerRoot);
        const policy = loadPluginDependencyPolicy(root.consumerRoot, manifestPluginNames);
        const optionalPlugins = resolvePluginSelection(policy, manifestPluginNames, []).optionalPlugins;
        const targetHarness = harnesses.includes('codex') ? 'codex' : 'claude';
        const installSettings = loadInstallSettings(root.consumerRoot);
        const previousManifest = loadHarnessManifest(root.consumerRoot, targetHarness);
        const savedSelection = opts.check
          ? fs.existsSync(manifestPathFor(root.consumerRoot, 'claude')) || fs.existsSync(legacyManifestPathFor(root.consumerRoot))
            ? previousManifest.selectedPlugins
            : installSettings?.defaults.selectedPlugins
          : undefined;
        const requestedInput = await resolveRequestedPlugins(opts, optionalPlugins, savedSelection);
        const selection = resolvePluginSelection(policy, manifestPluginNames, requestedInput);
        const baseSettings = targetHarness === 'codex' ? resolveCodexSettings({
          root: root.consumerRoot,
          settings: installSettings,
          oldManifest: previousManifest,
        }) : resolveClaudeSettings({
          root: root.consumerRoot,
          settings: installSettings,
          oldManifest: previousManifest,
        });
        const prefix = await resolveTargetPrefix(opts, baseSettings);
        const resolvedSettings = {
          ...baseSettings,
          selectedPlugins: selection.requestedPlugins,
          targetPrefix: prefix.targetPrefix,
        };
        const nextInstallSettings = buildNextInstallSettings(
          installSettings,
          resolvedSettings,
          selection.requestedPlugins,
        );
        if (targetHarness === 'codex') {
          assertResolvedCodexPackages({ consumerRoot: root.consumerRoot, resolvedPlugins: selection.resolvedPlugins });
        }
        const plan = resolvedSettings.harness === 'codex'
          ? buildCodexInstallPlan({
            consumerRoot: root.consumerRoot,
            selectedPlugins: selection.resolvedPlugins,
            previousManifest,
            sourcePrefix: resolvedSettings.sourcePrefix,
            targetPrefix: resolvedSettings.targetPrefix,
            installSettingsPath: settingsPathFor(root.consumerRoot),
            nextInstallSettings,
          })
          : (() => {
            const inventory = discoverPluginInventory(root.consumerRoot, selection.resolvedPlugins);
            const rewritePlugins = discoverPrefixRewritePlugins(root.consumerRoot);
            const settings = readSettings(root.consumerRoot, resolvedSettings.settingsPath);
            const claudePlan = buildClaudeInstallPlan({
              consumerRoot: root.consumerRoot,
              selectedPlugins: selection.resolvedPlugins,
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
        validateInstallPlanTargets(plan);
        if (!opts.check && !opts.dryRun && process.stdin.isTTY) {
          const confirmed = await confirmInstallTarget({
            consumerRoot: root.consumerRoot,
            targetDir: resolvedSettings.targetDir,
            settingsPath: resolvedSettings.harness === 'claude' ? resolvedSettings.settingsPath : '.codex/config.toml',
            targetPrefix: resolvedSettings.targetPrefix,
            requestedOptionalPlugins: selection.requestedPlugins,
            resolvedPlugins: selection.resolvedPlugins,
          });
          if (!confirmed) throw new Error('Install cancelled.');
        }

        process.stdout.write(renderInstallPlan(plan, selection.requestedPlugins));
        if (opts.check) {
          const items = claudeInstallIsStale(plan, previousManifest);
          for (const item of items) {
            process.stdout.write(`stale: ${item.path} (${item.reason})\n`);
          }
          for (const modified of claudeInstallLocalModifications(plan, previousManifest)) {
            process.stdout.write(`modified (informational): ${modified}\n`);
          }
          process.stdout.write(items.length > 0
            ? `Claude projection is stale (${items.length} item${items.length === 1 ? '' : 's'}). No files changed.\n`
            : 'Claude projection is current. No files changed.\n');
          process.exitCode = items.length > 0 ? 1 : 0;
          return;
        }
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
        process.exit(opts.check || checkRequested ? 2 : 1);
      }
    });
}
