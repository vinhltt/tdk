// CLI: UT auto — validate environment for /tdk-ut-backfill-auto

import { existsSync, mkdirSync } from 'node:fs';
import { join } from 'node:path';
import { Command } from 'commander';
import { detectConfig, parseFeatureId, loadFeatureEnv, getRepoRoot, formatAgentJson, writeAgentJson } from '../../../utils/index';
import { handleCliError } from '../cli-error-handler';

/** Create ut-auto command for CLI registration (group: tdk ut auto) */
export function createAutoCommand(): Command {
  return new Command('auto')
    .description('Validate environment for UT auto command')
    .argument('<feature-id>', 'Feature ID (e.g., aa-001)')
    .option('--sub-workspace <name>', 'Target sub-workspace')
    .option('--module <name>', 'Target module')
    .option('--skip-run', 'Skip running tests', false)
    .option('--plan-only', 'Only create plan', false)
    .option('--force', 'Force overwrite', false)
    .action((featureId, opts) => {
    const env = loadFeatureEnv();
    const repoRoot = getRepoRoot();
    featureId = featureId.toLowerCase();

    const feature = parseFeatureId(featureId, repoRoot, env.specsRoot, env.defaultFolder);
    const config = detectConfig({ subWorkspace: opts.subWorkspace, module: opts.module });

    const cliError = handleCliError(config, opts);
    if (cliError) {
      process.stdout.write(formatAgentJson(cliError));
      process.exit(1);
    }

    // Auto-create feature directory
    let createdFeatureDir = false;
    if (!existsSync(feature.featureDir)) {
      mkdirSync(feature.featureDir, { recursive: true });
      createdFeatureDir = true;
      process.stderr.write(`Created feature directory: ${feature.featureDir}\n`);
    }

    const specFile = join(feature.featureDir, 'spec.md');
    const planFile = join(feature.featureDir, 'ut', 'plan.md');

    const output: Record<string, unknown> = {
      workspaceRoot: config.workspaceRoot || repoRoot,
      featureId,
      featureDir: feature.featureDir,
      specFile,
      planFile,
      createdFeatureDir,
      hasSpec: existsSync(specFile),
      hasPlan: existsSync(planFile),
      skipRun: opts.skipRun,
      planOnly: opts.planOnly,
      force: opts.force,
      subWorkspaceName: opts.subWorkspace ?? '',
      subWorkspaces: (config.subWorkspaces ?? []).map(sw => ({
        ...sw,
        hasModules: sw.hasModules ?? ((sw.modules?.length ?? 0) > 0),
      })),
    };

    if (config.targetModule) {
      output.moduleName = config.targetModule.name;
      output.testStrategy = config.testStrategy ?? '';
    }

    writeAgentJson(output);
  });
}

// Standalone mode: bun src/commands/ut/auto.ts
if (import.meta.main) {
  createAutoCommand().parse();
}
