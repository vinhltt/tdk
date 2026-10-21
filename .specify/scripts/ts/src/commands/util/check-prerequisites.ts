// CLI: check-prerequisites — validate feature directory and docs exist before workflow steps
// Replaces: bash/check-prerequisites.sh
// Display script — outputs human-readable text (or JSON with --json)

import { existsSync, readdirSync, realpathSync, statSync } from 'node:fs';
import { isAbsolute, relative, resolve } from 'node:path';
import { Command } from 'commander';
import {
  loadFeatureEnv, getRepoRoot, getFeaturePaths, parseFeatureId, writeAgentJson, findConfigFile,
} from '../../utils/index';
import { isWithin } from '../../utils/path-within';
import { ARCHIVE_DIR } from '../feature/archive-incoming-references';

export interface PrerequisiteResolveEnv {
  repoRoot: string;
  specsRoot: string;
  defaultFolder: string;
}

export type PrerequisiteTarget =
  | { featureDir: string; taskId: string; archived: boolean }
  | { error: string };

const isArchiveFolder = (folder: string): boolean => folder.toLowerCase() === ARCHIVE_DIR;
const isDirectory = (path: string): boolean => existsSync(path) && statSync(path).isDirectory();

/** A path only when prefixed `<specsRoot>/`, `./`, or absolute; `feature/aa-123` stays an id. */
function isPathInput(input: string, specsRoot: string): boolean {
  return input.startsWith('./') || isAbsolute(input) || input.startsWith(`${specsRoot.replace(/\/+$/, '')}/`);
}

/** A path two levels under the specs root is not necessarily a feature (e.g. `.specify/scripts/ts`). */
function requireFeatureDocs(target: Extract<PrerequisiteTarget, { featureDir: string }>, input: string): PrerequisiteTarget {
  const hasDocs = ['spec.md', 'plan.md'].some((name) => existsSync(resolve(target.featureDir, name)));
  return hasDocs ? target : { error: `Not a feature directory (no spec.md or plan.md in ${target.featureDir}): ${input}` };
}

function resolveArchivedPath(input: string, env: PrerequisiteResolveEnv): PrerequisiteTarget {
  const specsAbs = resolve(env.repoRoot, env.specsRoot);
  const inputAbs = resolve(env.repoRoot, input);
  let specsReal: string;
  let inputReal: string;
  try {
    specsReal = realpathSync(specsAbs);
    inputReal = realpathSync(inputAbs);
  } catch {
    return { error: `Feature path not found or unreadable: ${input}` };
  }
  if (inputReal === specsReal || !isWithin(specsReal, inputReal)) {
    return { error: `Feature path escapes the specs root '${specsAbs}': ${input}` };
  }
  const segments = relative(specsReal, inputReal).split(/[\\/]/);
  const archived = isArchiveFolder(segments[0] ?? '');
  const [folder, ticket, ...extra] = archived ? segments.slice(1) : segments;
  if (!folder || !ticket || extra.length > 0 || (archived && isArchiveFolder(folder)) || !isDirectory(inputReal)) {
    return { error: `Not a feature directory (expected <folder>/<ticket> or archive/<folder>/<ticket> under the specs root): ${input}` };
  }
  const featureDir = resolve(specsAbs, ...(archived ? [ARCHIVE_DIR] : []), folder, ticket);
  return { featureDir, taskId: `${folder}/${ticket}`, archived };
}

function resolveArchivedId(input: string, env: PrerequisiteResolveEnv): PrerequisiteTarget {
  const { repoRoot, specsRoot, defaultFolder } = env;
  const parsed = parseFeatureId(input, repoRoot, specsRoot, defaultFolder);
  if (isArchiveFolder(parsed.folder)) {
    // The user named the archive: `archive/<folder>/<ticket>`. Look nowhere else.
    const inner = parseFeatureId(parsed.ticket, repoRoot, specsRoot, defaultFolder);
    if (isArchiveFolder(inner.folder)) return { error: `Invalid feature ID: '${input}' (nested archive folder)` };
    const featureDir = resolve(repoRoot, specsRoot, ARCHIVE_DIR, inner.folder, inner.ticket);
    if (!isDirectory(featureDir)) return { error: `Archived feature not found: ${featureDir}` };
    return { featureDir, taskId: `${inner.folder}/${inner.ticket}`, archived: true };
  }
  const archiveDir = resolve(repoRoot, specsRoot, ARCHIVE_DIR, parsed.folder, parsed.ticket);
  const hasArchive = isDirectory(archiveDir);
  const hasActive = isDirectory(parsed.featureDir);
  if (hasArchive && hasActive) {
    return { error: `Ambiguous feature '${input}' exists both archived and active:\n  ${archiveDir}\n  ${parsed.featureDir}\nPass an explicit path to choose one.` };
  }
  if (!hasArchive && !hasActive) {
    return { error: `Feature not found (checked archived and active):\n  ${archiveDir}\n  ${parsed.featureDir}` };
  }
  return { featureDir: hasArchive ? archiveDir : parsed.featureDir, taskId: parsed.branchName, archived: hasArchive };
}

/**
 * Resolve a task id (or, with `allowArchived`, a feature path) to its directory.
 *
 * The folder of a prefixed id is kept. The `archive` folder is reserved: it is only reachable
 * with `allowArchived`, where lookup is archive-first and `taskId` is canonical `<folder>/<ticket>`.
 */
export function resolvePrerequisiteTarget(
  input: string,
  env: PrerequisiteResolveEnv,
  { allowArchived }: { allowArchived: boolean },
): PrerequisiteTarget {
  try {
    if (allowArchived) {
      const target = isPathInput(input, env.specsRoot) ? resolveArchivedPath(input, env) : resolveArchivedId(input, env);
      return 'error' in target ? target : requireFeatureDocs(target, input);
    }
    const parsed = parseFeatureId(input, env.repoRoot, env.specsRoot, env.defaultFolder);
    if (isArchiveFolder(parsed.folder)) {
      return { error: `Folder '${ARCHIVE_DIR}' is reserved for archived specs and cannot be used here: ${input}` };
    }
    return { featureDir: parsed.featureDir, taskId: parsed.branchName, archived: false };
  } catch (err) {
    return { error: err instanceof Error ? err.message : String(err) };
  }
}

const program = new Command()
  .name('check-prerequisites')
  .description('Validate feature directory and required docs exist before workflow steps')
  .argument('<task-id>', 'Task ID (e.g., pref-001, feature/aa-123)')
  .option('--json', 'Output in JSON format', false)
  .option('--require-tasks', '[deprecated] Require tasks.md to exist (for implementation phase)', false)
  .option('--include-tasks', '[deprecated] Include tasks.md in available docs list', false)
  .option('--paths-only', 'Only output path variables, no validation', false)
  .option('--allow-archived', 'For retro skills and /tdk-archive (read-only consumers of archived specs): also resolve archived specs (id or path); the directory must hold spec.md or plan.md', false)
  .action((inputId: string, opts: {
    json: boolean; requireTasks: boolean; includeTasks: boolean; pathsOnly: boolean; allowArchived: boolean;
  }) => {
    const repoRoot = getRepoRoot();
    const env = loadFeatureEnv(findConfigFile(repoRoot));
    // Resolve and reject the reserved folder before any mode branch: --paths-only returns early.
    const target = resolvePrerequisiteTarget(inputId, { repoRoot, ...env }, { allowArchived: opts.allowArchived });
    if ('error' in target) {
      process.stderr.write(`ERROR: ${target.error}\n`);
      process.exit(1);
    }
    // Canonical id only on the archive-aware path; otherwise echo the caller's id unchanged.
    const taskId = opts.allowArchived ? target.taskId : inputId;
    const archivedField = opts.allowArchived ? { archived: target.archived } : {};
    const paths = getFeaturePaths(target.featureDir, repoRoot, taskId) as Record<string, string | boolean>;

    const featureDir = paths['featureDir'] as string;
    const featureSpec = paths['featureSpec'] as string;
    const implPlan = paths['implPlan'] as string;
    const tasks = paths['tasks'] as string;

    // Paths-only mode
    if (opts.pathsOnly) {
      if (opts.json) {
        writeAgentJson({ taskId, ...archivedField, repoRoot, featureDir, featureSpec, implPlan, tasks });
      } else {
        console.log(`TASK_ID: ${taskId}`);
        if (opts.allowArchived) console.log(`ARCHIVED: ${target.archived}`);
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
      writeAgentJson({ taskId, ...archivedField, featureDir, availableDocs: docs });
    } else {
      console.log(`TASK_ID: ${taskId}`);
      if (opts.allowArchived) console.log(`ARCHIVED: ${target.archived}`);
      console.log(`FEATURE_DIR: ${featureDir}`);
      console.log('AVAILABLE_DOCS:');
      if (docs.length === 0) console.log('  (none)');
      for (const doc of docs) console.log(`  ✓ ${doc}`);
    }
  });

if (import.meta.main) program.parse();
