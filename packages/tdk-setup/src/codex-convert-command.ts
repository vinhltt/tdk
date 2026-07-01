import * as fs from 'node:fs';
import * as path from 'node:path';
import { Command } from 'commander';
import { checkCodexPluginFreshness, renderFreshnessMismatches } from './codex-convert-check';
import { codexPackageRoot } from './codex-package-root';
import { buildCodexPluginArtifacts, ensureInterfaceSidecar } from './codex-plugin-emitter';
import { discoverCodexConvertPlugins, listCodexConvertArtifactPaths } from './codex-plugin-tree-adapter';
import { listManifestPluginNames } from './plugin-discovery';
import { resolveConsumerRoot } from './root-resolution';

interface ConvertOptions {
  plugins?: string;
  allPlugins?: boolean;
  dryRun?: boolean;
  check?: boolean;
}

function parsePlugins(value: string | undefined): string[] {
  if (!value) return [];
  const plugins = value.split(',').map((name) => name.trim()).filter(Boolean);
  if (plugins.length === 0) throw new Error('--plugins requires at least one plugin name');
  return [...new Set(plugins)].sort();
}

function writeArtifact(pluginRoot: string, relativePath: string, content: Buffer): void {
  const filePath = path.join(pluginRoot, relativePath);
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, content);
}

export function createConvertCommand(): Command {
  return new Command('convert')
    .description('Maintainer-only: emit generated Codex packages under .specify/codex-plugins/ from TDK plugin source trees')
    .option('--plugins <names>', 'comma-separated plugin names')
    .option('--all-plugins', 'convert all plugins listed in .specify/plugins/manifest.json')
    .option('--dry-run', 'list planned Codex package artifacts without writing')
    .option('--check', 're-emit in memory and fail if committed Codex packages differ')
    .action(async (opts: ConvertOptions) => {
      try {
        const root = resolveConsumerRoot(process.cwd());
        const explicit = parsePlugins(opts.plugins);
        if (opts.allPlugins && explicit.length > 0) throw new Error('--plugins conflicts with --all-plugins');
        const selectedPlugins = opts.allPlugins || explicit.length === 0 ? listManifestPluginNames(root.consumerRoot) : explicit;
        const plugins = discoverCodexConvertPlugins(root.consumerRoot, selectedPlugins);

        if (opts.dryRun) {
          const lines = ['Codex harness convert dry run'];
          for (const plugin of plugins) {
            lines.push(`${plugin.name}:`);
            for (const artifactPath of listCodexConvertArtifactPaths(plugin)) lines.push(`  ${artifactPath}`);
          }
          process.stdout.write(`${lines.join('\n')}\n`);
          return;
        }

        if (opts.check) {
          const mismatches = await checkCodexPluginFreshness(root.consumerRoot, plugins);
          process.stdout.write(renderFreshnessMismatches(mismatches));
          if (mismatches.length > 0) process.exitCode = 1;
          return;
        }

        const lines = ['Codex harness convert'];
        for (const plugin of plugins) {
          const seeded = ensureInterfaceSidecar(plugin);
          const refreshedPlugin = seeded ? discoverCodexConvertPlugins(root.consumerRoot, [plugin.name])[0]! : plugin;
          const result = await buildCodexPluginArtifacts(refreshedPlugin);
          const pkgRoot = codexPackageRoot(root.consumerRoot, refreshedPlugin.name);
          for (const artifact of result.artifacts) writeArtifact(pkgRoot, artifact.artifactRelativePath, artifact.content);
          lines.push(`${refreshedPlugin.name}: wrote ${result.artifacts.length} artifacts${seeded ? ' + interface sidecar' : ''}`);
          for (const warning of result.warnings) lines.push(`  warning: ${warning}`);
        }
        process.stdout.write(`${lines.join('\n')}\n`);
      } catch (err) {
        process.stderr.write(`[tdk-setup convert] error: ${(err as Error).message}\n`);
        process.exit(1);
      }
    });
}
