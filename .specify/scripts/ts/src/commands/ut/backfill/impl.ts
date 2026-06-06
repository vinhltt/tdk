// CLI: UT impl — feature ID + validation

import { existsSync } from 'node:fs';
import { join } from 'node:path';
import { Command } from 'commander';
import { detectConfig, parseFeatureId, loadFeatureEnv, getRepoRoot, formatAgentJson, writeAgentJson } from '../../../utils/index';
import { handleCliError } from '../cli-error-handler';

/** Create ut-impl command for CLI registration (group: tdk ut impl) */
export function createImplCommand(): Command {
  return new Command('impl')
    .description('Validate environment for UT code generation')
    .argument('<feature-id>', 'Feature ID (e.g., aa-001)')
    .option('--sub-workspace <name>', 'Target sub-workspace')
    .option('--module <name>', 'Target module')
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

    // Validate feature directory
    if (!existsSync(feature.featureDir)) {
      process.stderr.write(`Error: Feature directory not found: ${feature.featureDir}\n`);
      process.exit(1);
    }

    const planFile = join(feature.featureDir, 'ut', 'plan.md');
    if (!existsSync(planFile)) {
      process.stderr.write(`Error: ut/plan.md not found: ${planFile}\n`);
      process.exit(1);
    }

    const testSpecFile = join(feature.featureDir, 'ut-spec.md');
    const coverageFile = join(feature.featureDir, 'coverage-analysis.md');

    const output: Record<string, unknown> = {
      workspaceRoot: config.workspaceRoot || repoRoot,
      featureId,
      featureDir: feature.featureDir,
      planFile,
      testSpecFile,
      coverageFile,
      hasTestSpec: existsSync(testSpecFile),
      hasCoverage: existsSync(coverageFile),
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

// Standalone mode: bun src/commands/ut/impl.ts
if (import.meta.main) {
  createImplCommand().parse();
}
