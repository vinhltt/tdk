// CLI: feature/archive — archive a done/cancelled feature.
// Usage: bun src/commands/feature/archive.ts <feature-id>
// Writes `status: archived` + `archived_from` into plan.md and spec.md, then moves the whole
// feature dir to <specsRoot>/archive/<folder>/<id>/ with fs.renameSync (no git commands, the
// index is untouched). A failed move restores both files byte-for-byte.
// Incoming references (plans blocked by / blocking it, child specs) are reported, never blocking.

import { existsSync, mkdirSync, readFileSync, renameSync, rmdirSync } from 'node:fs';
import { dirname, join, relative, resolve } from 'node:path';
import { Command } from 'commander';
import { findConfigFile, getRepoRoot, loadFeatureEnv, writeAgentJson } from '../../utils/index';
import { parseFeatureId } from '../../utils/feature';
import { durableAtomicWriteFileSync } from '../util/durable-atomic-file';
import { extractFrontmatter } from '../util/parse-plan-frontmatter';
import { parsePhasesTable } from '../util/phases-table-parser';
import {
  derivePlanRootStatus, normalizeLifecycleStatus, readFrontmatterStatus,
} from '../util/plan-root-status';
import { replaceFrontmatterStatusLine } from '../util/phase-frontmatter';
import {
  ARCHIVE_DIR, collectIncomingReferences, type IncomingReferences,
} from './archive-incoming-references';

export type ArchivedFrom = 'done' | 'cancelled';

export interface ArchiveInput {
  featureId: string;
  repoRoot: string;
  specsRoot: string;
  defaultFolder: string;
}

export type ArchiveResult =
  | { ok: true; from: string; to: string; archived_from: ArchivedFrom; references: IncomingReferences }
  | { ok: false; error: string; references?: IncomingReferences };

export type DirMover = (from: string, to: string) => void;

const ARCHIVED_FROM_LINE_RE = /^archived_from:[^\r\n]*/m;
const STATUS_LINE_RE = /^status:[^\r\n]*/m;

/** Set `status: archived` and `archived_from: <from>` (inserted after `status:` when absent). */
export function renderArchivedFrontmatter(content: string, from: ArchivedFrom): string {
  const withStatus = replaceFrontmatterStatusLine(content, 'archived');
  const bom = withStatus.startsWith('\uFEFF') ? '\uFEFF' : '';
  const body = withStatus.slice(bom.length);
  const end = /\n---\s*(?:\n|$)/.exec(body)?.index ?? -1;
  if (end < 0) return withStatus;
  const block = body.slice(0, end);
  const eol = block.includes('\r\n') ? '\r\n' : '\n';
  const nextBlock = ARCHIVED_FROM_LINE_RE.test(block)
    ? block.replace(ARCHIVED_FROM_LINE_RE, `archived_from: ${from}`)
    : block.replace(STATUS_LINE_RE, (line) => `${line}${eol}archived_from: ${from}`);
  return bom + nextBlock + body.slice(end);
}

function toPosix(path: string): string {
  return path.split('\\').join('/');
}

/** Remove archive dirs created for a move that failed; stops at the first non-empty dir. */
function removeCreatedDirs(target: string, created: string | undefined): void {
  if (!created) return;
  for (let dir = dirname(target); ; dir = dirname(dir)) {
    try { rmdirSync(dir); } catch { return; }
    if (dir === created) return;
  }
}

/** Restore every snapshot independently; returns the paths that could not be restored. */
function restoreSnapshots(snapshots: Array<{ path: string; bytes: Buffer }>): string[] {
  return snapshots.flatMap(({ path, bytes }) => {
    try { durableAtomicWriteFileSync(path, bytes); return []; } catch { return [path]; }
  });
}

export function archiveFeature(input: ArchiveInput, move: DirMover = renameSync): ArchiveResult {
  const { featureId, repoRoot, specsRoot, defaultFolder } = input;
  let resolved: ReturnType<typeof parseFeatureId>;
  try {
    resolved = parseFeatureId(featureId, repoRoot, specsRoot, defaultFolder);
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : String(err) };
  }
  const { folder, ticket, featureDir } = resolved;
  if (folder === ARCHIVE_DIR) return { ok: false, error: `feature '${featureId}' is already under ${ARCHIVE_DIR}/` };
  if (!existsSync(featureDir)) return { ok: false, error: `feature dir not found: ${featureDir}` };

  const planPath = join(featureDir, 'plan.md');
  const specPath = join(featureDir, 'spec.md');
  if (!existsSync(planPath)) return { ok: false, error: `plan.md not found: ${planPath}` };
  if (!existsSync(specPath)) return { ok: false, error: `spec.md not found: ${specPath}` };

  const planBytes = readFileSync(planPath);
  const specBytes = readFileSync(specPath);
  const planMd = planBytes.toString('utf-8');
  const specMd = specBytes.toString('utf-8');
  for (const [name, md] of [['plan.md', planMd], ['spec.md', specMd]] as const) {
    if (readFrontmatterStatus(md) === null) return { ok: false, error: `${name} has no frontmatter 'status:' key` };
  }

  const stored = normalizeLifecycleStatus(readFrontmatterStatus(planMd) ?? '', 'plan').status;
  if (stored === 'archived') return { ok: false, error: `feature '${featureId}' is already archived` };
  const parsed = parsePhasesTable(planMd);
  if (parsed.errors.length > 0) {
    return { ok: false, error: `plan.md ## Phases not parseable: ${parsed.errors.map((e) => e.message).join('; ')}` };
  }
  const derived = derivePlanRootStatus(parsed.phases, stored);
  if (derived !== 'done' && derived !== 'cancelled') {
    return { ok: false, error: `only done or cancelled features can be archived (derived status: ${derived})` };
  }

  const target = resolve(repoRoot, specsRoot, ARCHIVE_DIR, folder, ticket);
  if (existsSync(target)) return { ok: false, error: `archive target already exists: ${target}` };

  const references = collectIncomingReferences({
    repoRoot, specsRoot, defaultFolder, featureDir,
    taskId: extractFrontmatter(planPath, ticket)?.canonical.task_id ?? null,
  });
  if (references.plans.length + references.children.length > 0) {
    process.stderr.write(
      `[tdk-archive] WARNING: ${references.plans.length} plan ref(s), ${references.children.length} child spec(s) point to '${featureId}'\n`,
    );
  }

  // Archiving is irreversible: prove both renders carry the sticky status before touching disk.
  const rendered = [
    { path: planPath, text: renderArchivedFrontmatter(planMd, derived) },
    { path: specPath, text: renderArchivedFrontmatter(specMd, derived) },
  ];
  const unrendered = rendered.find(({ text }) => readFrontmatterStatus(text) !== 'archived');
  if (unrendered) {
    return { ok: false, error: `cannot rewrite the status: line of ${unrendered.path} (expected a single-token value)`, references };
  }

  let createdParent: string | undefined;
  try {
    for (const file of rendered) durableAtomicWriteFileSync(file.path, file.text);
    createdParent = mkdirSync(dirname(target), { recursive: true });
    move(featureDir, target);
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    const unrestored = restoreSnapshots([{ path: planPath, bytes: planBytes }, { path: specPath, bytes: specBytes }]);
    removeCreatedDirs(target, createdParent);
    if (unrestored.length > 0) {
      return {
        ok: false, references,
        error: `archive failed (${message}) and restore failed for ${unrestored.join(', ')}; `
          + 'restore their original status: line by hand (e.g. from git) before retrying',
      };
    }
    return { ok: false, error: `archive failed, files restored: ${message}`, references };
  }

  return {
    ok: true,
    from: toPosix(relative(repoRoot, featureDir)),
    to: toPosix(relative(repoRoot, target)),
    archived_from: derived,
    references,
  };
}

if (import.meta.main) {
  new Command()
    .name('feature-archive')
    .description('Archive a done/cancelled feature: mark plan + spec archived and move the dir under archive/.')
    .argument('<feature-id>', 'Feature ID (e.g., aa-001, hotfix/aa-123)')
    .action((featureId: string) => {
      const repoRoot = getRepoRoot();
      const env = loadFeatureEnv(findConfigFile(repoRoot));
      const result = archiveFeature({ featureId, repoRoot, specsRoot: env.specsRoot, defaultFolder: env.defaultFolder });
      if (!result.ok) {
        process.stderr.write(`✗ ${result.error}\n`);
        process.exit(1);
      }
      writeAgentJson(result);
    })
    .parse();
}
