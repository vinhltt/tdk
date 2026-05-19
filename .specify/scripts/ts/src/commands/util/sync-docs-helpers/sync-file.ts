// sync-file.ts
// Per-file skip/backup/copy logic for sync-docs
// Matches: bash/sync-docs.sh sync_file() + backup_file() (lines 94-145)

import { existsSync, readFileSync, mkdirSync, copyFileSync } from 'node:fs';
import { dirname } from 'node:path';

/** Direction controls skip-guard behavior. See bash line 129 $DIRECTION bug fix in sync-docs.ts */
export type SyncDirection = 'from-parent' | 'from-sub';

export interface SyncFileOptions {
  dryRun: boolean;
  force: boolean;
  direction: SyncDirection;
  /** When true and target exists and not dry-run, back up target before overwrite */
  doBackup: boolean;
}

/** Format timestamp for backup filename: YYYYMMDD-HHMMSS (local time, matches bash `date +%Y%m%d-%H%M%S`) */
export function makeBackupTimestamp(d: Date = new Date()): string {
  const pad = (n: number) => String(n).padStart(2, '0');
  const YYYY = d.getFullYear();
  const MM = pad(d.getMonth() + 1);
  const DD = pad(d.getDate());
  const HH = pad(d.getHours());
  const mm = pad(d.getMinutes());
  const SS = pad(d.getSeconds());
  return `${YYYY}${MM}${DD}-${HH}${mm}${SS}`;
}

/**
 * Sync a single file from source to target.
 * Returns true (bash `sync_file && ((files_synced++)) || true` always increments — match this).
 *
 * Skip rules:
 * 1. Target exists + identical → skip (log to stderr)
 * 2. Target exists + direction=from-parent + !force → skip (log to stderr)
 * 3. Otherwise → backup if needed, then copy
 *
 * NOTE: bash bug (line 105) leaks backup path to stdout via `echo "$backup"`. We do NOT replicate
 * this. All diagnostics go to stderr only.
 */
export function syncFile(source: string, target: string, opts: SyncFileOptions): void {
  const targetDir = dirname(target);

  // Create target directory
  if (opts.dryRun) {
    process.stderr.write(`[dry-run] Would create dir: ${targetDir}\n`);
  } else {
    mkdirSync(targetDir, { recursive: true });
  }

  // Check if target exists
  if (existsSync(target)) {
    // Check identical
    const srcContent = readFileSync(source);
    const tgtContent = readFileSync(target);
    if (srcContent.equals(tgtContent)) {
      process.stderr.write(`[skip] Identical: ${target}\n`);
      return;
    }

    // Skip guard: from-parent direction without force
    if (opts.direction === 'from-parent' && !opts.force) {
      process.stderr.write(`[skip] Child has file (use --force to override): ${target}\n`);
      return;
    }

    // Backup before overwrite
    if (opts.doBackup && !opts.dryRun) {
      const ts = makeBackupTimestamp(new Date());
      const backupPath = `${target}.bak.${ts}`;
      copyFileSync(target, backupPath);
      process.stderr.write(`Backed up: ${target} -> ${backupPath}\n`);
    } else if (opts.doBackup && opts.dryRun) {
      const ts = makeBackupTimestamp(new Date());
      const backupPath = `${target}.bak.${ts}`;
      process.stderr.write(`[dry-run] Would backup: ${target} -> ${backupPath}\n`);
    }
  }

  // Copy file
  if (opts.dryRun) {
    process.stderr.write(`[dry-run] Would copy: ${source} -> ${target}\n`);
  } else {
    copyFileSync(source, target);
    process.stderr.write(`[sync] ${source} -> ${target}\n`);
  }
}
