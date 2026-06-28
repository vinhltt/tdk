// CLI: check-prerequisites — validate feature directory and docs exist before workflow steps
// Replaces: bash/check-prerequisites.sh
// Display script — outputs human-readable text (or JSON with --json)

import { existsSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { Command } from 'commander';
import { loadFeatureEnv, getRepoRoot, getFeaturePaths, writeAgentJson } from '../../utils/index';

function checkFile(file: string, label: string): void {
  console.log(existsSync(file) ? `  ✓ ${label}` : `  ✗ ${label}`);
}

function checkDir(dir: string, label: string): void {
  console.log(existsSync(dir) ? `  ✓ ${label}` : `  ✗ ${label}`);
}

const program = new Command()
  .name('check-prerequisites')
  .description('Validate feature directory and required docs exist before workflow steps')
  .argument('<task-id>', 'Task ID (e.g., pref-001, feature/aa-123)')
  .option('--json', 'Output in JSON format', false)
  .option('--require-tasks', '[deprecated] Require tasks.md to exist (for implementation phase)', false)
  .option('--include-tasks', '[deprecated] Include tasks.md in available docs list', false)
  .option('--paths-only', 'Only output path variables, no validation', false)
  .action((taskId: string, opts: { json: boolean; requireTasks: boolean; includeTasks: boolean; pathsOnly: boolean }) => {
    const env = loadFeatureEnv();
    const repoRoot = getRepoRoot();
    const paths = getFeaturePaths(
      join(repoRoot, env.specsRoot, env.defaultFolder, taskId.includes('/') ? taskId.slice(taskId.indexOf('/') + 1) : taskId),
      repoRoot,
      taskId,
    ) as Record<string, string | boolean>;

    const featureDir = paths['featureDir'] as string;
    const featureSpec = paths['featureSpec'] as string;
    const implPlan = paths['implPlan'] as string;
    const tasks = paths['tasks'] as string;
    const researchDir = join(featureDir, 'research');
    const dataModel = paths['dataModel'] as string;
    const contractsDir = paths['contractsDir'] as string;
    const quickstart = paths['quickstart'] as string;

    // Paths-only mode
    if (opts.pathsOnly) {
      if (opts.json) {
        writeAgentJson({ taskId, repoRoot, featureDir, featureSpec, implPlan, tasks });
      } else {
        console.log(`TASK_ID: ${taskId}`);
        console.log(`REPO_ROOT: ${repoRoot}`);
        console.log(`FEATURE_DIR: ${featureDir}`);
        console.log(`FEATURE_SPEC: ${featureSpec}`);
        console.log(`IMPL_PLAN: ${implPlan}`);
        console.log(`TASKS: ${tasks}`);
      }
      return;
    }

    // Validate required directories and files
    if (!existsSync(featureDir)) {
      process.stderr.write(`ERROR: Feature directory not found: ${featureDir}\n`);
      process.stderr.write('Run /tdk-specify first to create the feature structure.\n');
      process.exit(1);
    }
    if (!existsSync(featureSpec)) {
      process.stderr.write(`ERROR: spec.md not found in ${featureDir}\n`);
      process.stderr.write('Run /tdk-specify first to create the specification.\n');
      process.exit(1);
    }
    if (!existsSync(implPlan)) {
      process.stderr.write(`ERROR: plan.md not found in ${featureDir}\n`);
      process.stderr.write('Run /tdk-plan first to create the implementation plan.\n');
      process.exit(1);
    }
    if (opts.requireTasks && !existsSync(tasks)) {
      process.stderr.write(`ERROR: tasks.md not found in ${featureDir}\n`);
      process.stderr.write('[deprecated] Run /tdk-tasks first (legacy) or /tdk-plan to create plan.md with ## Phases table.\n');
      process.exit(1);
    }

    // Build available docs list from feature directory (top-level only)
    const docs: string[] = [];
    try {
      const entries = readdirSync(featureDir, { withFileTypes: true }).sort((a, b) => a.name.localeCompare(b.name));
      for (const entry of entries) {
        if (entry.name.startsWith('.')) continue;
        if (entry.isDirectory()) {
          docs.push(`${entry.name}/`);
        } else if (entry.name.endsWith('.md')) {
          if (entry.name === 'tasks.md' && !opts.includeTasks) continue;
          docs.push(entry.name);
        }
      }
    } catch { /* ignore */ }

    if (opts.json) {
      writeAgentJson({ taskId, featureDir, availableDocs: docs });
    } else {
      console.log(`TASK_ID: ${taskId}`);
      console.log(`FEATURE_DIR: ${featureDir}`);
      console.log('AVAILABLE_DOCS:');
      checkDir(researchDir, 'research/');
      checkFile(dataModel, 'data-model.md');
      checkDir(contractsDir, 'contracts/');
      checkFile(quickstart, 'quickstart.md');
      if (opts.includeTasks) checkFile(tasks, 'tasks.md');
    }
  });

program.parse();
