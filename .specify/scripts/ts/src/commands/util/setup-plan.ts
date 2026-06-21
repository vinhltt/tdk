// CLI: setup-plan — ensure feature directory exists and copy plan template
// Replaces: bash/setup-plan.sh

import { existsSync, mkdirSync, copyFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { Command } from 'commander';
import { loadFeatureEnv, getRepoRoot, getFeaturePaths, writeAgentJson, parseFeatureId } from '../../utils/index';
import { extractFrontmatter } from './parse-plan-frontmatter';

const program = new Command()
  .name('setup-plan')
  .description('Ensure feature directory exists and copy plan template')
  .argument('<task-id>', 'Task ID (e.g., pref-001, feature/aa-123)')
  .option('--json', 'Output results in JSON format', false)
  .option('--force', 'Overwrite existing plan.md unconditionally', false)
  .action((taskId: string, opts: { json: boolean; force: boolean }) => {
    const env = loadFeatureEnv();
    const repoRoot = getRepoRoot();

    // Build feature dir path respecting folder/ticket split
    const id = taskId.toLowerCase();
    let featureDirPath: string;
    if (id.includes('/')) {
      const slash = id.indexOf('/');
      featureDirPath = join(repoRoot, env.specsRoot, id.slice(0, slash), id.slice(slash + 1));
    } else {
      featureDirPath = join(repoRoot, env.specsRoot, env.defaultFolder, id);
    }

    const paths = getFeaturePaths(featureDirPath, repoRoot, taskId) as Record<string, string | boolean>;
    const featureDir = paths['featureDir'] as string;
    const featureSpec = paths['featureSpec'] as string;
    const implPlan = paths['implPlan'] as string;
    const hasGit = paths['hasGit'] as boolean;

    // parent_spec link-integrity check: fail-loud before any filesystem side effects.
    // Uses parseFeatureId (not raw path join) to get traversal-guarded resolution
    // of the declared parent — a crafted parent_spec must never escape the repo.
    const childFm = extractFrontmatter(featureSpec, taskId);
    if (childFm !== null) {
      const parentSpec = childFm.parsed['parent_spec'];
      if (typeof parentSpec === 'string' && parentSpec.trim() !== '') {
        let parentDir: string;
        try {
          const parentPaths = parseFeatureId(parentSpec, repoRoot, env.specsRoot, env.defaultFolder);
          parentDir = parentPaths.featureDir;
        } catch (err) {
          const msg = err instanceof Error ? err.message : String(err);
          process.stderr.write(
            `ERROR: parent_spec '${parentSpec}' is invalid — ${msg}. Fix or clear parent_spec before planning.\n`,
          );
          process.exit(1);
        }
        if (!existsSync(join(parentDir, 'spec.md'))) {
          process.stderr.write(
            `ERROR: parent_spec '${parentSpec}' not found — expected spec.md at ${join(parentDir, 'spec.md')}. Demote the child (clear parent_spec) before planning, or restore the parent.\n`,
          );
          process.exit(1);
        }
      }
    }

    // Ensure feature directory exists
    mkdirSync(featureDir, { recursive: true });

    // Detect if plan already exists
    const planExists = existsSync(implPlan);

    // Copy plan template (guarded by planExists and force flag)
    const templateFile = join(repoRoot, env.specsRoot, 'templates', 'plan-template.md.tpl');
    if (existsSync(templateFile)) {
      if (!planExists || opts.force) {
        copyFileSync(templateFile, implPlan);
        if (!opts.json) console.log(`Copied plan template to ${implPlan}`);
      } else {
        if (!opts.json) console.log(`Plan already exists at ${implPlan} — skipping copy (use --force to overwrite)`);
      }
    } else {
      if (!opts.json) console.log(`Warning: Plan template not found at ${templateFile}`);
      if (!planExists) writeFileSync(implPlan, '', 'utf-8');
    }

    if (opts.json) {
      writeAgentJson({
        taskId,
        featureSpec,
        implPlan,
        featureDir,
        hasGit,
        planExists,
      });
    } else {
      console.log(`TASK_ID: ${taskId}`);
      console.log(`FEATURE_SPEC: ${featureSpec}`);
      console.log(`IMPL_PLAN: ${implPlan}`);
      console.log(`FEATURE_DIR: ${featureDir}`);
      console.log(`HAS_GIT: ${hasGit}`);
      console.log(`PLAN_EXISTS: ${planExists}`);
    }
  });

program.parse();
