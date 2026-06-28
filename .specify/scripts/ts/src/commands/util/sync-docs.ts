// sync-docs.ts
// Sync documentation between parent workspace and sub-workspaces
// Replaces: bash/sync-docs.sh (370 LOC)
//
// Behavior fixes vs bash (documented for Phase 5 CHANGELOG):
//
// 1. $DIRECTION bug (bash line 129): bash never sets $DIRECTION so the skip-guard
//    "Child has file (use --force to override)" never triggers. Fixed here by tracking
//    direction per operation:
//      --to-sub-workspace  → direction='from-parent' (skip guard active)
//      --from-sub-workspace / --all → direction='from-sub' (skip guard inactive)
//
// 2. Backup stdout leak: bash backup_file() emits the backup path to stdout (line 105)
//    via bare `echo "$backup"`, polluting JSON output. All diagnostics here go to stderr.
//
// 3. YAML sub-workspace config: legacy bash read sub .specify.yaml docs.path.
//    parseConfig() only supports JSON. Falls back to parent docsPath if yaml-only.

import { Command } from 'commander';
import { detectConfig } from '../../utils/index';
import {
  syncFromSubWorkspace,
  syncToSubWorkspace,
  syncAllSubWorkspaces,
  type SyncOptions,
} from './sync-docs-helpers/sync-modes';

const program = new Command()
  .name('sync-docs')
  .description('Sync documentation between parent workspace and sub-workspaces')
  .option('--all', 'Sync all sub-workspaces docs to parent', false)
  .option('--from-sub-workspace <name>', 'Sync specific sub-workspace docs to parent')
  .option('--to-sub-workspace <name>', 'Sync parent shared docs to sub-workspace')
  .option('--dry-run', 'Preview changes without syncing', false)
  .option('--force', 'Overwrite existing files', false)
  .action((opts: SyncOptions) => {
    // Validate: at least one mode flag required (matches bash lines 58-70)
    if (!opts.all && !opts.fromSubWorkspace && !opts.toSubWorkspace) {
      process.stderr.write('ERROR: Specify --all, --from-sub-workspace NAME, or --to-sub-workspace NAME\n\n');
      process.stderr.write('Usage:\n');
      process.stderr.write('  sync-docs --all                        # Sync all sub-workspaces to parent\n');
      process.stderr.write('  sync-docs --from-sub-workspace NAME    # Sync specific sub-workspace to parent\n');
      process.stderr.write('  sync-docs --to-sub-workspace NAME      # Sync parent shared docs to sub-workspace\n\n');
      process.stderr.write('Options:\n');
      process.stderr.write('  --dry-run    Preview changes without syncing\n');
      process.stderr.write('  --force      Overwrite existing files\n');
      process.exit(1);
    }

    // Config detection via TS utils — no subprocess (matches bash lines 79-90)
    const cfg = detectConfig();
    if (!cfg.configFound) {
      process.stderr.write('ERROR: No .specify.yaml found\n');
      process.exit(1);
    }

    process.stderr.write(`Workspace: ${cfg.workspaceRoot} (${cfg.workspaceName})\n`);

    if (opts.all) {
      syncAllSubWorkspaces(cfg, opts);
    } else if (opts.fromSubWorkspace) {
      syncFromSubWorkspace(opts.fromSubWorkspace, cfg, opts);
    } else if (opts.toSubWorkspace) {
      syncToSubWorkspace(opts.toSubWorkspace, cfg, opts);
    }
  });

if (import.meta.main) {
  program.parse();
}

export { program };
