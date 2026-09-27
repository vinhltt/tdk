// CLI: setup-plan — ensure feature directory exists and copy plan template
// Replaces: bash/setup-plan.sh

import { existsSync, mkdirSync, readFileSync, renameSync, rmSync, writeFileSync, realpathSync } from 'node:fs';
import { join, resolve, dirname, basename } from 'node:path';
import { Command } from 'commander';
import { parseDocument, stringify } from 'yaml';
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

function preserveMemoryGate(original: string, template: string): string {
  const frontmatter = /^(?:\uFEFF)?---\r?\n([\s\S]*?)\r?\n---(?:\r?\n|$)/.exec(original);
  if (/^(?:\uFEFF)?---(?:\r?\n|$)/.test(original) && !frontmatter) throw new Error('Existing plan frontmatter is malformed; refusing to erase memory gate');
  let replacement = template;
  if (frontmatter) {
    const document = parseDocument(frontmatter[1]!, { uniqueKeys: true });
    const parsed = document.toJS();
    if (document.errors.length || document.warnings.length || !parsed || typeof parsed !== 'object' || Array.isArray(parsed)) throw new Error('Existing plan frontmatter is malformed; refusing to erase memory gate');
    const gate: Record<string, unknown> = {};
    for (const key of ['memory_gate', 'memory_gate_reason', 'memory_gate_at', 'memory_gate_actor']) {
      if (Object.hasOwn(parsed, key)) gate[key] = parsed[key];
    }
    if (Object.keys(gate).length > 0) {
      const templateHeader = /^---\r?\n([\s\S]*?)\r?\n---(?:\r?\n|$)/.exec(template);
      const defaults = templateHeader ? parseDocument(templateHeader[1]!, { uniqueKeys: true }) : undefined;
      const metadata = defaults?.toJS() ?? {};
      if (defaults?.errors.length || defaults?.warnings.length || typeof metadata !== 'object' || Array.isArray(metadata)) throw new Error('Plan template frontmatter is malformed');
      replacement = `---\n${stringify({ ...metadata, ...gate })}---\n${template.slice(templateHeader?.[0].length ?? 0)}`;
    }
  }
  const heading = /^## Memory Constraints[ \t]*\r?$/m.exec(original);
  if (heading) {
    const contentStart = heading.index + heading[0].length;
    const nextHeading = /^#{1,2}[ \t]/m.exec(original.slice(contentStart));
    const constraints = original.slice(heading.index, nextHeading ? contentStart + nextHeading.index : original.length).trimEnd();
    replacement = `${replacement.trimEnd()}\n\n${constraints}\n`;
  }
  return replacement;
}

const program = new Command()
  .name('setup-plan')
  .description('Ensure feature directory exists and copy plan template')
  .argument('<task-id>', 'Task ID (e.g., pref-001, feature/aa-123)')
  .option('--json', 'Output results in JSON format', false)
  .option('--force', 'Replace plan content while preserving memory gate and constraints', false)
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
    const physicalPlan = physicalDestination(implPlan);
    if (!isWithin(realpathOrSelf(repoRoot), physicalDest) ||
        !isWithin(realpathOrSelf(repoRoot), physicalPlan)) {
      process.stderr.write(
        `ERROR: refusing to write outside the artifact host — directory '${featureDir}' resolves to '${physicalDest}'; plan '${implPlan}' resolves to '${physicalPlan}'. Check for symlinks outside '${realpathOrSelf(repoRoot)}'.\n`,
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
        const original = planExists ? readFileSync(implPlan, 'utf8') : undefined;
        const template = readFileSync(templateFile, 'utf8');
        const replacement = original === undefined ? template : preserveMemoryGate(original, template);
        const temporary = `${implPlan}.${process.pid}.${Date.now()}.tmp`;
        try {
          writeFileSync(temporary, replacement, { flag: 'wx' });
          if (original === undefined ? existsSync(implPlan) : readFileSync(implPlan, 'utf8') !== original) throw new Error('Plan changed concurrently; refusing replacement');
          renameSync(temporary, implPlan);
        } finally {
          rmSync(temporary, { force: true });
        }
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
