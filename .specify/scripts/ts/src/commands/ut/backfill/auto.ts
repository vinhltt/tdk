// CLI: UT auto — validate environment for /tdk-ut-backfill-auto

import { existsSync, mkdirSync } from 'node:fs';
import { join } from 'node:path';
import { Command } from 'commander';
import { detectConfig, resolveRulesCascade, parseFeatureId, loadFeatureEnv, getRepoRoot } from '../../../utils/index';
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
      console.log(JSON.stringify(cliError));
      process.exit(1);
    }

    const cascade = resolveRulesCascade({
      workspaceRoot: config.workspaceRoot || repoRoot,
      docsPath: config.docsPath,
      ruleSubPath: 'rules/test/ut-rule.md',
      swName: config.targetSubWorkspace?.name ?? opts.subWorkspace,
      moduleName: config.targetModule?.name ?? opts.module,
      targetRoot: config.targetSubWorkspace?.root,
      targetDocsPath: config.targetSubWorkspace?.docsPath,
    });
    const rulesFile = cascade.primary;

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
      utRulesFile: rulesFile ?? '',
      utRulesFiles: cascade.entries,
      createdFeatureDir,
      hasSpec: existsSync(specFile),
      // Intentional TOCTOU re-probe: entries snapshot may be stale if user deletes file mid-flight.
      hasUtRules: rulesFile !== null && existsSync(rulesFile),
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

    console.log(JSON.stringify(output, null, 2));
  });
}

// Standalone mode: bun src/commands/ut/auto.ts
if (import.meta.main) {
  createAutoCommand().parse();
}
