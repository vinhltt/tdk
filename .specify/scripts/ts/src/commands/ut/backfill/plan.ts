// CLI: UT plan — feature ID + config validation

import { existsSync, mkdirSync } from 'node:fs';
import { join } from 'node:path';
import { Command } from 'commander';
import { detectConfig, parseFeatureId, loadFeatureEnv, getRepoRoot } from '../../../utils/index';
import { handleCliError } from '../cli-error-handler';

/** Create ut-plan command for CLI registration (group: tdk ut plan) */
export function createPlanCommand(): Command {
  return new Command('plan')
    .description('Validate environment for UT plan creation')
    .argument('<feature-id>', 'Feature ID (e.g., aa-001)')
    .option('--sub-workspace <name>', 'Target sub-workspace')
    .option('--module <name>', 'Target module')
    .option('--review', 'Review existing plan', false)
    .option('--force', 'Force overwrite', false)
    .option('--standalone', 'Skip feature spec requirement', false)
    .action((featureId, opts) => {
    const env = loadFeatureEnv();
    const repoRoot = getRepoRoot();
    featureId = featureId.toLowerCase();

    const feature = parseFeatureId(featureId, repoRoot, env.specsRoot, env.defaultFolder);
    const config = detectConfig({ subWorkspace: opts.subWorkspace, module: opts.module });

    const cliError = handleCliError(config, opts);
    if (cliError) {
      console.log(JSON.stringify(cliError));
      process.exit(1);
    }

    const specFile = join(feature.featureDir, 'spec.md');
    const testSpecFile = join(feature.featureDir, 'ut-spec.md');
    const coverageFile = join(feature.featureDir, 'coverage-analysis.md');
    const planFile = join(feature.featureDir, 'ut', 'plan.md');
    const hasSpecFile = existsSync(specFile);

    // Auto-detect standalone prompt need
    let needsStandalonePrompt = false;
    if (!opts.standalone && !hasSpecFile) {
      needsStandalonePrompt = true;
      if (!existsSync(feature.featureDir)) {
        mkdirSync(feature.featureDir, { recursive: true });
      }
    }
    if (opts.standalone && !existsSync(feature.featureDir)) {
      mkdirSync(feature.featureDir, { recursive: true });
    }

    // Check existing files
    const existingFiles: string[] = [];
    if (existsSync(testSpecFile)) existingFiles.push('ut-spec.md');
    if (existsSync(planFile)) existingFiles.push('ut/plan.md');
    const mode = existingFiles.length > 0 ? 'exists' : 'create';

    const output: Record<string, unknown> = {
      workspaceRoot: config.workspaceRoot || repoRoot,
      featureId,
      featureDir: feature.featureDir,
      specFile,
      testSpecFile,
      coverageFile,
      planFile,
      hasSpecFile,
      needsStandalonePrompt,
      existingFiles: existingFiles.join(' '),
      mode,
      reviewMode: opts.review,
      forceMode: opts.force,
      standaloneMode: opts.standalone,
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

    console.log(JSON.stringify(output, null, 2));
  });
}

// Standalone mode: bun src/commands/ut/plan.ts
if (import.meta.main) {
  createPlanCommand().parse();
}
