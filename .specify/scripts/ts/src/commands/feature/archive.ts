// CLI: feature/archive — archive a done/cancelled feature.
// Usage: bun src/commands/feature/archive.ts <feature-id> [--check]
// `--check` runs the same preconditions as apply, writes nothing, and exits 1 when any blocker
// is found (see archive-blockers.ts).
// Writes `status: archived` + `archived_from` into plan.md and spec.md, then moves the whole
// feature dir to <specsRoot>/archive/<folder>/<id>/ with fs.renameSync. The only git calls are the
// read-only dirty check in archive-blockers.ts; the index is never written or staged here. A failed
// move restores both files byte-for-byte.
// Incoming references (plans blocked by / blocking it, child specs) are reported, never blocking.

import { mkdirSync, renameSync, rmdirSync } from 'node:fs';
import { dirname, relative } from 'node:path';
import { Command } from 'commander';
import { findConfigFile, formatAgentJson, getRepoRoot, loadFeatureEnv, writeAgentJson } from '../../utils/index';
import { durableAtomicWriteFileSync } from '../util/durable-atomic-file';
import { readFrontmatterStatus } from '../util/plan-root-status';
import { replaceFrontmatterStatusLine } from '../util/phase-frontmatter';
import { type IncomingReferences } from './archive-incoming-references';
import {
  collectArchivePreconditions, type ArchivedFrom, type ArchiveInput,
} from './archive-blockers';

export type { ArchivedFrom, ArchiveInput } from './archive-blockers';

export type ArchiveResult =
  | { ok: true; from: string; to: string; archived_from: ArchivedFrom; references: IncomingReferences }
  | { ok: false; error: string; references?: IncomingReferences };

/** `--check` output: the same preconditions as apply, nothing written. `warnings` only when non-empty. */
export interface ArchiveCheckResult {
  ok: boolean;
  from: string | null;
  to: string | null;
  archived_from: ArchivedFrom | null;
  references: IncomingReferences;
  blockers: string[];
  warnings?: string[];
}

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

export function checkArchiveFeature(input: ArchiveInput): ArchiveCheckResult {
  const pre = collectArchivePreconditions(input);
  return {
    ok: pre.blockers.length === 0,
    from: pre.from, to: pre.to, archived_from: pre.archivedFrom,
    references: pre.references, blockers: pre.blockers,
    ...(pre.warnings.length > 0 ? { warnings: pre.warnings } : {}),
  };
}

export function archiveFeature(input: ArchiveInput, move: DirMover = renameSync): ArchiveResult {
  const { featureId, repoRoot } = input;
  const pre = collectArchivePreconditions(input);
  const { facts, references } = pre;
  if (!facts) {
    const [only] = pre.blockers;
    const error = pre.blockers.length === 1 && only ? only : `${pre.blockers.length} blockers:\n- ${pre.blockers.join('\n- ')}`;
    return { ok: false, error, references };
  }
  for (const warning of pre.warnings) process.stderr.write(`[tdk-archive] WARNING: ${warning}\n`);
  const { featureDir, target, planPath, specPath, planBytes, specBytes, derived } = facts;
  const [planMd, specMd] = [planBytes.toString('utf-8'), specBytes.toString('utf-8')];
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
    .option('--check', 'Report blockers only; write nothing, exit 1 when any blocker exists', false)
    .action((featureId: string, opts: { check: boolean }) => {
      const repoRoot = getRepoRoot();
      const configPath = findConfigFile(repoRoot);
      const env = loadFeatureEnv(configPath);
      const input = {
        featureId, repoRoot, specsRoot: env.specsRoot, defaultFolder: env.defaultFolder,
        workspaceRoot: configPath ? dirname(dirname(configPath)) : repoRoot,
      };
      if (opts.check) {
        const check = checkArchiveFeature(input);
        if (check.ok) writeAgentJson(check);
        else {
          for (const blocker of check.blockers) process.stderr.write(`✗ ${blocker}\n`);
          process.stdout.write(formatAgentJson(check));
          process.exit(1);
        }
        return;
      }
      const result = archiveFeature(input);
      if (!result.ok) {
        process.stderr.write(`✗ ${result.error}\n`);
        process.exit(1);
      }
      writeAgentJson(result);
    })
    .parse();
}
