# sync-docs Snapshot Parity Tests

Phase 4 verification: JSON output parity between bash `sync-docs.sh` and TypeScript `sync-docs.ts`.

## Architecture

```
tests/sync-docs/
├── snapshot.test.ts              # Main test suite (6 test cases)
├── fixture-setup.ts              # Fixture creation/teardown helpers
├── normalize-paths.ts            # Path normalization (for portability)
├── capture-snapshots.ts          # ONE-SHOT capture script (run once)
├── snapshots/                    # Committed snapshot files (canonical contract)
│   ├── from-sub-real.snapshot.json
│   ├── from-sub-dryrun.snapshot.json
│   ├── to-sub-real.snapshot.json
│   ├── to-sub-dryrun.snapshot.json
│   ├── all-real.snapshot.json
│   └── all-dryrun.snapshot.json
└── README.md                     # This file
```

## Test Modes

| Snapshot | Flags | Cycles |
|----------|-------|--------|
| `from-sub-real` | `--from-sub-workspace alpha` | real |
| `from-sub-dryrun` | `--from-sub-workspace alpha --dry-run` | dry-run |
| `to-sub-real` | `--to-sub-workspace alpha` | real |
| `to-sub-dryrun` | `--to-sub-workspace alpha --dry-run` | dry-run |
| `all-real` | `--all` | real |
| `all-dryrun` | `--all --dry-run` | dry-run |

## Running Tests

```bash
# Run snapshot tests
bun test tests/sync-docs/snapshot.test.ts

# Run all tests (includes snapshot tests)
bun test

# Typecheck
bun run typecheck
```

## Snapshot Contract

Each snapshot file is the **canonical reference** captured from bash while it still exists. The test suite compares TS output to these committed snapshots.

### Field Structure by Mode

**from-sub-workspace** (no DIRECTION field):
```json
{
  "SUCCESS": true,
  "SUB_WORKSPACE": "alpha",
  "SOURCE": "<path>",
  "TARGET": "<path>",
  "FILES_SYNCED": number,
  "DRY_RUN": boolean
}
```

**to-sub-workspace** (includes DIRECTION):
```json
{
  "SUCCESS": true,
  "DIRECTION": "to-sub-workspace",
  "SUB_WORKSPACE": "alpha",
  "SOURCE": "<path>",
  "TARGET": "<path>",
  "FILES_SYNCED": number,
  "DRY_RUN": boolean
}
```

**--all** (DIRECTION="all", no SUB_WORKSPACE):
```json
{
  "SUCCESS": true,
  "DIRECTION": "all",
  "SUB_WORKSPACES_SYNCED": number,
  "DRY_RUN": boolean
}
```

## Known Parity Notes

### DIRECTION Field Bug Fix
- **Bash bug (line 129)**: `$DIRECTION` variable never set, skip-guard never triggers
- **TS fix**: Tracks `direction` per operation; only `to-sub-workspace` sets it
- **Impact**: TS correctly prevents overwrites when `--force` not passed
- **Documented in Phase 5 CHANGELOG**

### Path Normalization
Snapshots use `<FIXTURE_ROOT>` placeholder instead of absolute paths. The `normalize-paths.ts` utility replaces fixture root with placeholder before comparison, ensuring portability across machines/CI.

### Backup File Stdout Leak
Bash `backup_file()` emits to stdout (line 105), polluting JSON. TS sends all diagnostics to stderr only. Backup logic itself is tested separately; snapshots focus on JSON output.

## Re-capturing Snapshots (if contract intentionally changes)

If the JSON output schema must change:

1. Run the capture script while bash still exists (Phase 5 at latest):
   ```bash
   bun tests/sync-docs/capture-snapshots.ts
   ```

2. Commit the new snapshot files

3. Add CHANGELOG entry explaining the contract change

**Note**: After Phase 6 (bash deletion), snapshots cannot be re-captured without restoring bash temporarily.

## Fixture Design

Minimal, deterministic fixture with 2 files in sub-workspace, 1 file in parent shared docs:

```
workspace/
├── .specify/
│   ├── .specify.yaml (bash config)
│   ├── .specify.json (TS config)
│   └── configurations/
│       ├── shared.md (parent docs)
│       └── sub-workspaces/alpha/
│           └── from-parent.md (shared for alpha)
└── sub-alpha/
    └── .specify/configurations/
        ├── doc-a.md
        └── doc-b.md
```

Config uses `docsSyncBackup: false` to eliminate timestamp noise from backup files. Backup logic is exercised in error-path and manual smoke tests, not here.

## Test Determinism

- Fixture created fresh per test (no test interdependencies)
- All timestamps/UUIDs excluded from snapshots
- Path normalization ensures portability
- 3+ consecutive runs confirm no flakiness

All 6 tests pass deterministically on every run.
