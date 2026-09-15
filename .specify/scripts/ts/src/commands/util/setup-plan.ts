// CLI: setup-plan — ensure feature directory exists and copy plan template
// Replaces: bash/setup-plan.sh

import { existsSync, mkdirSync, copyFileSync, writeFileSync, realpathSync } from 'node:fs';
import { join, resolve, dirname, basename } from 'node:path';
import { Command } from 'commander';
import {
  loadFeatureEnv, getRepoRoot, getFeaturePaths, writeAgentJson, parseFeatureId, findConfigFile,
  realpathOrSelf, isWithin,
} from '../../utils/index';
import { extractFrontmatter } from './parse-plan-frontmatter';

/**
 * Where `path` will physically live once created.
 *
 * `realpathSync` throws on a path that does not exist yet, and a lexical `resolve()` cannot see a
 * symlinked ancestor — so the deepest existing ancestor is resolved and the not-yet-created
 * segments are re-attached to it.
 */
function physicalDestination(path: string): string {
  const absolute = resolve(path);
  const pending: string[] = [];
  let existing = absolute;
  while (!existsSync(existing)) {
    const parent = dirname(existing);
    if (parent === existing) return absolute;
    pending.unshift(basename(existing));
    existing = parent;
  }
  return join(realpathSync.native(existing), ...pending);
}

const program = new Command()
  .name('setup-plan')
  .description('Ensure feature directory exists and copy plan template')
  .argument('<task-id>', 'Task ID (e.g., pref-001, feature/aa-123)')
  .option('--json', 'Output results in JSON format', false)
  .option('--force', 'Overwrite existing plan.md unconditionally', false)
  .action((taskId: string, opts: { json: boolean; force: boolean }) => {
    const repoRoot = getRepoRoot();
    const env = loadFeatureEnv(findConfigFile(repoRoot));

    // parseFeatureId, not a raw join: the task ID is user input and a raw join happily builds
    // `<root>/.specify/../../elsewhere`. The same guard already protected `parent_spec` below;
    // the task being created was the one path that skipped it.
    const id = taskId.toLowerCase();
    const featureDirPath = parseFeatureId(id, repoRoot, env.specsRoot, env.defaultFolder).featureDir;

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

    // A resolved-but-lexical path is not proof of location. `realpath(repoRoot)` says nothing
    // about an artifact directory *below* it: with `.specify/specs` symlinked out of the host,
    // featureDir still reads as "inside the host" while mkdir/copy land somewhere else entirely.
    // Resolve where the write physically goes, and refuse rather than repair.
    const physicalDest = physicalDestination(featureDir);
    if (!isWithin(realpathOrSelf(repoRoot), physicalDest)) {
      process.stderr.write(
        `ERROR: refusing to write outside the artifact host — '${featureDir}' physically resolves to '${physicalDest}', which is outside '${realpathOrSelf(repoRoot)}'. Check for a symlinked ${env.specsRoot} directory.\n`,
      );
      process.exit(1);
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
