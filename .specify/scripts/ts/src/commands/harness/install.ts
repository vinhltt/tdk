import { Command } from 'commander';
import { resolveConsumerRoot } from './root-resolution';
import { discoverPluginInventory, listManifestPluginNames } from './plugin-discovery';
import { loadHarnessManifest } from './manifest-store';
import { readSettings } from './hook-merge';
import { buildClaudeInstallPlan } from './install-plan';
import { applyInstallPlan } from './install-writer';
import { confirmDriftOverwrite, selectPluginsInteractively } from './prompt';
import { renderApplyResult, renderInstallPlan } from './render';

interface InstallOptions {
  harness?: string;
  plugins?: string;
  allPlugins?: boolean;
  dryRun?: boolean;
  yes?: boolean;
}

function parsePlugins(value: string | undefined): string[] {
  if (!value) return [];
  const plugins = value.split(',').map((name) => name.trim()).filter(Boolean);
  if (plugins.length === 0) throw new Error('--plugins requires at least one plugin name');
  return [...new Set(plugins)];
}

async function resolveSelection(consumerRoot: string, opts: InstallOptions): Promise<string[]> {
  const explicit = parsePlugins(opts.plugins);
  if (opts.allPlugins && explicit.length > 0) {
    throw new Error('--plugins conflicts with --all-plugins');
  }
  if (opts.allPlugins) return listManifestPluginNames(consumerRoot);
  if (explicit.length > 0) return explicit;
  if (!process.stdin.isTTY) {
    throw new Error('No plugin selector provided. Use --plugins <name[,name]> or --all-plugins.');
  }
  return selectPluginsInteractively(listManifestPluginNames(consumerRoot));
}

export function createHarnessInstallCommand(): Command {
  return new Command('install')
    .description('Install selected TDK plugin artifacts into a Claude harness')
    .requiredOption('--harness <name>', 'target harness (Plan 1 supports only claude)')
    .option('--plugins <names>', 'comma-separated plugin names')
    .option('--all-plugins', 'install all plugins listed in .specify/plugins/manifest.json')
    .option('--dry-run', 'render the install plan without mutating files')
    .option('--yes', 'approve clean writes/updates/removals without prompting')
    .action(async (opts: InstallOptions) => {
      try {
        if (opts.harness !== 'claude') throw new Error('Plan 1 supports only claude');
        const root = resolveConsumerRoot(process.cwd());
        const selectedPlugins = await resolveSelection(root.consumerRoot, opts);
        const inventory = discoverPluginInventory(root.consumerRoot, selectedPlugins);
        const previousManifest = loadHarnessManifest(root.consumerRoot);
        const settings = readSettings(root.consumerRoot);
        const plan = buildClaudeInstallPlan({
          consumerRoot: root.consumerRoot,
          selectedPlugins,
          plugins: inventory.plugins,
          previousManifest,
          settings,
        });
        plan.warnings.push(...root.warnings, ...inventory.warnings);

        process.stdout.write(renderInstallPlan(plan));
        if (opts.dryRun) {
          if (plan.collisions.length > 0) process.exitCode = 1;
          return;
        }

        const result = await applyInstallPlan(plan, {
          yes: Boolean(opts.yes),
          interactive: Boolean(process.stdin.isTTY),
          approveDrift: confirmDriftOverwrite,
        });
        process.stdout.write(renderApplyResult(result));
      } catch (err) {
        process.stderr.write(`[tdk harness install] error: ${(err as Error).message}\n`);
        process.exit(1);
      }
    });
}
