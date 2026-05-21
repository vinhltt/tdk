// CLI: UT rule creation — module-aware rule dir creation

import { existsSync, mkdirSync } from 'node:fs';
import { join } from 'node:path';
import { Command } from 'commander';
import { type ConfigResult, detectConfig, getRepoRoot, loadFeatureEnv, validatePathContainment } from '../../utils/index';
import { handleCliError } from './cli-error-handler';

// Extracted for testability — builds rules CREATE directory path based on config targeting
// Distinct from resolveUtRules (read path) — this determines where new rules are written
export function buildRulesCreateDir(config: ConfigResult, repoRoot: string): string {
  const outputRoot = config.targetSubWorkspace?.root ?? (config.workspaceRoot || repoRoot);
  const outputDocsPath = config.targetSubWorkspace?.docsPath ?? config.docsPath;
  const wsRoot = config.workspaceRoot || repoRoot;

  // L1: module + sub-workspace → central module-level
  if (config.targetModule && config.targetSubWorkspace) {
    return join(
      wsRoot, config.docsPath,
      'sub-workspaces', config.targetSubWorkspace.name,
      'modules', config.targetModule.name,
      'rules', 'test'
    );
  }
  // L3: SW has modules but no specific module targeted → central sw-level
  if (config.targetSubWorkspace && !config.targetModule && config.targetSubWorkspace.hasModules) {
    return join(
      wsRoot, config.docsPath,
      'sub-workspaces', config.targetSubWorkspace.name,
      'rules', 'test'
    );
  }
  // L2: default fallback (includes hasModules=false SWs)
  return join(outputRoot, outputDocsPath, 'rules', 'test');
}

/** Create ut-create-rules command for CLI registration (group: tdk ut create-rules) */
export function createCreateRulesCommand(): Command {
  return new Command('create-rules')
    .description('Validate environment for UT rule creation')
    .option('--sub-workspace <name>', 'Target sub-workspace')
    .option('--module <name>', 'Target module')
    .action((opts) => {
    const repoRoot = getRepoRoot();
    const config = detectConfig({ subWorkspace: opts.subWorkspace, module: opts.module });

    // Unified JSON error output (RT5, V2-2)
    const cliError = handleCliError(config, opts);
    if (cliError) {
      console.log(JSON.stringify(cliError));
      process.exit(1);
    }

    const outputRoot = config.targetSubWorkspace?.root ?? (config.workspaceRoot || repoRoot);
    const outputDocsPath = config.targetSubWorkspace?.docsPath ?? config.docsPath;
    const rulesDir = buildRulesCreateDir(config, repoRoot);
    const rulesFile = join(rulesDir, 'ut-rule.md');

    // RT#1: Warn if L2 file exists when writing to L3 (L2 shadows L3 in read cascade)
    if (config.targetSubWorkspace && !config.targetModule && config.targetSubWorkspace.hasModules) {
      const l2Path = join(outputRoot, outputDocsPath, 'rules', 'test', 'ut-rule.md');
      if (existsSync(l2Path)) {
        process.stderr.write(`Warning: Existing L2 rule at ${l2Path} shadows L3 in read cascade. Consider deleting L2 file.\n`);
      }
    }
    const env = loadFeatureEnv();
    const templateFile = join(repoRoot, env.specsRoot, 'templates', 'ut-rule-template.md.tpl');

    // Validate .specify directory exists
    if (!existsSync(join(repoRoot, '.specify'))) {
      process.stderr.write('Error: .specify directory not found\n');
      process.exit(1);
    }

    // Validate template
    if (!existsSync(templateFile)) {
      process.stderr.write(`Error: UT rule template not found: ${templateFile}\n`);
      process.exit(1);
    }

    // Validate path containment
    try {
      validatePathContainment(repoRoot, rulesDir);
    } catch {
      process.stderr.write(`Error: Rules directory escapes repo root\n`);
      process.exit(1);
    }

    const mode = existsSync(rulesFile) ? 'exists' : 'create';
    mkdirSync(rulesDir, { recursive: true });

    const output: Record<string, unknown> = {
      workspaceRoot: config.workspaceRoot || repoRoot,
      docsPath: config.docsPath,
      outputRoot,
      outputDocsPath,
      rulesDir,
      rulesFile,
      templateFile,
      existingRules: mode === 'exists' ? rulesFile : '',
      mode,
      subWorkspaceName: opts.subWorkspace ?? '',
      subWorkspaces: (config.subWorkspaces ?? []).map(sw => ({
        ...sw,
        hasModules: sw.hasModules ?? ((sw.modules?.length ?? 0) > 0),
      })),
    };

    if (config.targetModule) {
      output.moduleName = config.targetModule.name;
      output.testStrategy = config.testStrategy ?? '';
      output.moduleRelativePath = config.targetModule.path;
      output.moduleRoot = config.targetModule.root;
    }

    console.log(JSON.stringify(output, null, 2));
  });
}

// Standalone mode: bun src/commands/ut/create-rules.ts
if (import.meta.main) {
  createCreateRulesCommand().parse();
}
