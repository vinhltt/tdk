// Incoming references to a feature that is about to be archived.
// Advisory only: callers report these, never block on them.

import { existsSync, readdirSync, statSync } from 'node:fs';
import { basename, dirname, join, resolve } from 'node:path';
import { parseFeatureId } from '../../utils/feature';
import { extractFrontmatter } from '../util/parse-plan-frontmatter';

export const ARCHIVE_DIR = 'archive';

export interface PlanReference {
  /** Cross-plan id of the referencing plan (`task_id`, else its dir basename). */
  plan: string;
  /** Path of the referencing plan.md, relative to the repo root. */
  path: string;
  field: 'blocks' | 'blockedBy';
  /** The id inside the field that matched the archived plan. */
  matched: string;
}

export interface ChildReference {
  /** Child feature id as `<folder>/<id>`. */
  child: string;
  /** Path of the child spec.md, relative to the repo root. */
  path: string;
}

export interface IncomingReferences {
  plans: PlanReference[];
  children: ChildReference[];
}

export interface CollectReferencesInput {
  repoRoot: string;
  specsRoot: string;
  defaultFolder: string;
  featureDir: string;
  /** Archived plan's frontmatter `task_id`; null when absent. */
  taskId: string | null;
}

function toPosix(path: string): string {
  return path.split('\\').join('/');
}

function listDirs(dir: string): string[] {
  if (!existsSync(dir)) return [];
  return readdirSync(dir)
    .filter((name) => !name.startsWith('.') && name !== 'node_modules')
    .filter((name) => {
      try { return statSync(join(dir, name)).isDirectory(); } catch { return false; }
    });
}

/** Active feature dirs `<specsRoot>/<folder>/<id>` (the archive tree is skipped). */
function listActiveFeatureDirs(specsDir: string): Array<{ folder: string; dir: string }> {
  const found: Array<{ folder: string; dir: string }> = [];
  for (const folder of listDirs(specsDir)) {
    if (folder === ARCHIVE_DIR) continue;
    for (const id of listDirs(join(specsDir, folder))) found.push({ folder, dir: join(specsDir, folder, id) });
  }
  return found;
}

function readParentSpec(specFile: string): string | null {
  const parent = extractFrontmatter(specFile, basename(dirname(specFile)))?.parsed['parent_spec'];
  return typeof parent === 'string' && parent.trim() !== '' ? parent.trim() : null;
}

function resolvesTo(parentSpec: string, input: CollectReferencesInput): boolean {
  try {
    const { repoRoot, specsRoot, defaultFolder, featureDir } = input;
    return parseFeatureId(parentSpec, repoRoot, specsRoot, defaultFolder).featureDir === featureDir;
  } catch {
    return false;
  }
}

export function collectIncomingReferences(input: CollectReferencesInput): IncomingReferences {
  const { repoRoot, specsRoot, featureDir, taskId } = input;
  const ids = new Set([basename(featureDir), ...(taskId ? [taskId] : [])]);
  const refs: IncomingReferences = { plans: [], children: [] };

  for (const { folder, dir } of listActiveFeatureDirs(resolve(repoRoot, specsRoot))) {
    if (dir === featureDir) continue;
    const rel = (file: string) => toPosix(file.slice(repoRoot.length).replace(/^[\\/]+/, ''));

    const planFile = join(dir, 'plan.md');
    const frontmatter = existsSync(planFile) ? extractFrontmatter(planFile, basename(dir)) : null;
    if (frontmatter) {
      for (const field of ['blocks', 'blockedBy'] as const) {
        for (const matched of frontmatter.canonical[field]) {
          if (ids.has(matched)) {
            refs.plans.push({ plan: frontmatter.canonical.task_id ?? basename(dir), path: rel(planFile), field, matched });
          }
        }
      }
    }

    const specFile = join(dir, 'spec.md');
    const parentSpec = existsSync(specFile) ? readParentSpec(specFile) : null;
    if (parentSpec && resolvesTo(parentSpec, input)) {
      refs.children.push({ child: `${folder}/${basename(dir)}`, path: rel(specFile) });
    }
  }
  return refs;
}
