// sync-modes.ts
// Three sync mode implementations for sync-docs: from-sub, to-sub, all
// JSON output shapes match bash/sync-docs.sh heredocs exactly (field order matters for Phase 4 snapshots)

import { existsSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { parseConfig, type ConfigResult } from '../../../utils/index';
import { syncFile, type SyncDirection } from './sync-file';
import { walkFiles } from './walk-files';

export interface SyncOptions {
  all: boolean;
  fromSubWorkspace?: string;
  toSubWorkspace?: string;
  dryRun: boolean;
  force: boolean;
}

/**
 * Resolve docs path for a sub-workspace.
 * Reads sub's .specify/.specify.json if present; falls back to parent docsPath.
 * NOTE: .specify.yaml not supported by parseConfig (YAML→JSON migration assumed).
 * If sub has yaml-only config, falls back silently — see Phase 5 CHANGELOG.
 */
export function resolveSubDocsPath(subFullPath: string, parentDocsPath: string): string {
  const jsonConfig = join(subFullPath, '.specify', '.specify.json');
  if (existsSync(jsonConfig)) {
    const { config } = parseConfig(jsonConfig);
    if (config?.docs?.path) return config.docs.path;
  }
  return parentDocsPath;
}

function buildSyncFileOpts(direction: SyncDirection, opts: SyncOptions, doBackup: boolean) {
  return { dryRun: opts.dryRun, force: opts.force, direction, doBackup };
}

function exitUnknownSub(name: string, cfg: ConfigResult): never {
  process.stderr.write(`ERROR: Sub-workspace '${name}' not found\n`);
  process.stderr.write(`Available: ${cfg.subWorkspaces.map(s => s.name).join(', ')}\n`);
  process.exit(1);
}

/**
 * --from-sub-workspace: sync sub's docs → parent's sub-workspaces/{name}/ dir.
 * Output: no DIRECTION field (matches bash lines 198-207).
 */
export function syncFromSubWorkspace(subWorkspaceName: string, cfg: ConfigResult, opts: SyncOptions): void {
  const sw = cfg.subWorkspaces.find(s => s.name === subWorkspaceName);
  if (!sw) exitUnknownSub(subWorkspaceName, cfg);

  const subFullPath = resolve(cfg.workspaceRoot, sw.path);
  const sourceDir = join(subFullPath, resolveSubDocsPath(subFullPath, cfg.docsPath));

  if (!existsSync(sourceDir)) {
    process.stderr.write(`ERROR: No docs found for sub-workspace: ${subWorkspaceName}\n`);
    process.stderr.write(`Expected: ${sourceDir}\n`);
    process.exit(1);
  }

  const targetDir = join(cfg.workspaceRoot, cfg.docsPath, 'sub-workspaces', subWorkspaceName);
  process.stderr.write(`Syncing sub-workspace: ${subWorkspaceName}\n`);

  // from-sub direction: skip guard inactive — overwrite parent
  const syncOpts = buildSyncFileOpts('from-sub', opts, cfg.docsSyncBackup);
  const files = walkFiles(sourceDir);
  for (const file of files) {
    syncFile(file, join(targetDir, file.slice(sourceDir.length + 1)), syncOpts);
  }

  // No DIRECTION field for from-sub-workspace (matches bash heredoc)
  process.stdout.write(JSON.stringify({
    SUCCESS: true,
    SUB_WORKSPACE: subWorkspaceName,
    SOURCE: sourceDir,
    TARGET: targetDir,
    FILES_SYNCED: files.length,
    DRY_RUN: opts.dryRun,
  }, null, 2) + '\n');
}

/**
 * --to-sub-workspace: sync parent's sub-workspaces/{name}/ → sub's docs dir.
 * Output: includes DIRECTION field (matches bash lines 273-283 and 249-260).
 */
export function syncToSubWorkspace(subWorkspaceName: string, cfg: ConfigResult, opts: SyncOptions): void {
  const sw = cfg.subWorkspaces.find(s => s.name === subWorkspaceName);
  if (!sw) exitUnknownSub(subWorkspaceName, cfg);

  const subFullPath = resolve(cfg.workspaceRoot, sw.path);
  const targetDir = join(subFullPath, resolveSubDocsPath(subFullPath, cfg.docsPath));
  const sourceDir = join(cfg.workspaceRoot, cfg.docsPath, 'sub-workspaces', subWorkspaceName);

  if (!existsSync(sourceDir)) {
    process.stderr.write(`No shared docs found for sub-workspace: ${subWorkspaceName}\n`);
    process.stderr.write(`Expected: ${sourceDir}\n`);
    // Source missing — emit JSON with MESSAGE (matches bash lines 249-260)
    process.stdout.write(JSON.stringify({
      SUCCESS: true,
      DIRECTION: 'to-sub-workspace',
      SUB_WORKSPACE: subWorkspaceName,
      SOURCE: sourceDir,
      TARGET: targetDir,
      FILES_SYNCED: 0,
      MESSAGE: 'No shared docs found in parent',
      DRY_RUN: opts.dryRun,
    }, null, 2) + '\n');
    return;
  }

  process.stderr.write(`Syncing to sub-workspace: ${subWorkspaceName}\n`);

  // from-parent direction: skip guard active — don't overwrite child files unless --force
  const syncOpts = buildSyncFileOpts('from-parent', opts, cfg.docsSyncBackup);
  const files = walkFiles(sourceDir);
  for (const file of files) {
    syncFile(file, join(targetDir, file.slice(sourceDir.length + 1)), syncOpts);
  }

  // With DIRECTION field (matches bash lines 273-283)
  process.stdout.write(JSON.stringify({
    SUCCESS: true,
    DIRECTION: 'to-sub-workspace',
    SUB_WORKSPACE: subWorkspaceName,
    SOURCE: sourceDir,
    TARGET: targetDir,
    FILES_SYNCED: files.length,
    DRY_RUN: opts.dryRun,
  }, null, 2) + '\n');
}

/**
 * --all: sync all sub-workspaces' docs → parent.
 * Output: DIRECTION="all" + SUB_WORKSPACES_SYNCED (matches bash lines 347-354 and 293-300).
 */
export function syncAllSubWorkspaces(cfg: ConfigResult, opts: SyncOptions): void {
  if (cfg.subWorkspaces.length === 0) {
    process.stderr.write('No sub-workspaces defined in workspace config\n');
    // No DRY_RUN field in no-subs shape — matches bash lines 293-300 exactly
    process.stdout.write(JSON.stringify({
      SUCCESS: true,
      DIRECTION: 'all',
      MESSAGE: 'No sub-workspaces defined',
      SUB_WORKSPACES_SYNCED: 0,
    }, null, 2) + '\n');
    return;
  }

  // all = from-sub: overwrite parent
  const syncOpts = buildSyncFileOpts('from-sub', opts, cfg.docsSyncBackup);
  let subWorkspacesSynced = 0;

  for (const sw of cfg.subWorkspaces) {
    const subFullPath = resolve(cfg.workspaceRoot, sw.path);
    const sourceDir = join(subFullPath, resolveSubDocsPath(subFullPath, cfg.docsPath));

    if (!existsSync(sourceDir)) {
      process.stderr.write(`[skip] No docs found for sub-workspace: ${sw.name}\n`);
      continue;
    }

    const targetDir = join(cfg.workspaceRoot, cfg.docsPath, 'sub-workspaces', sw.name);
    process.stderr.write(`Syncing sub-workspace: ${sw.name}\n`);

    for (const file of walkFiles(sourceDir)) {
      syncFile(file, join(targetDir, file.slice(sourceDir.length + 1)), syncOpts);
    }
    subWorkspacesSynced++;
  }

  // Matches bash lines 347-354
  process.stdout.write(JSON.stringify({
    SUCCESS: true,
    DIRECTION: 'all',
    SUB_WORKSPACES_SYNCED: subWorkspacesSynced,
    DRY_RUN: opts.dryRun,
  }, null, 2) + '\n');
}
