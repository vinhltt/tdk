---
name: tdk-config-sync
description: "Synchronize documentation files between workspace and sub-workspaces."
metadata:
  version: "2.0.0"
---

# /tdk-config-sync - Sync Documentation Between Workspace and Sub-Workspaces

## Purpose

Synchronize documentation files between parent workspace and sub-workspaces. Shows diff preview before syncing (unless --force).

---

## Flags

- `--from-sub-workspace NAME`: Sync sub-workspace docs to parent workspace
- `--to-sub-workspace NAME`: Sync parent shared docs to sub-workspace
- `--all`: Sync all sub-workspaces docs to parent
- `--force`: Skip diff preview, direct sync
- `--dry-run`: Preview what would happen without making changes

---

## Execution

### Step 0: Parse Arguments

**Parse user input**:
1. Check for direction: `--from-sub-workspace NAME`, `--to-sub-workspace NAME`, or `--all`
2. Check for `--force` flag
3. Check for `--dry-run` flag

If no direction specified:
- Ask user which direction with AskUserQuestion
- Options: "From sub-workspace to workspace", "From workspace to sub-workspace", "All sub-workspaces"

---

### Step 1: Show Diff Preview (unless --force)

**Skip this step if --force is specified.**

**For --from-sub-workspace or --to-sub-workspace**:

Run diff script first:
```bash
cd $CLAUDE_PROJECT_DIR/.specify/scripts/ts && bun src/commands/config/diff.ts --sub-workspace {SUB_WORKSPACE_NAME}
```

**CRITICAL: Handle script errors**:
- **If exit code != 0**: **STOP IMMEDIATELY**. Do NOT continue or try workarounds.
- **If "Required tools not installed"**: Show error message to user and STOP.
- **If "Sub-workspace not found"**: Show available sub-workspaces and STOP.

**Display diff summary**:
```
Diff Preview: {SUB_WORKSPACE_NAME} <-> workspace

+--------------------------+-------------+---------------------+
| File                     | Status      | Details             |
+--------------------------+-------------+---------------------+
| rules/code/naming.md     | Modified    | +15 -3 lines        |
| rules/code/style.md      | New         | Sub-workspace only  |
+--------------------------+-------------+---------------------+

Summary: {modified} modified | {new} new | {identical} identical
```

---

### Step 2: Confirm with User

**Ask user to proceed** with AskUserQuestion:
- **Proceed**: Continue with sync
- **Show Details**: Show detailed diff content for modified files
- **Cancel**: Abort sync operation

If user selects "Show Details":
- Run diff script with `--detailed` flag
- Show diff content for modified files
- Ask again: Proceed / Cancel

If user selects "Cancel":
- Output: "Sync cancelled."
- STOP

---

### Step 3: Execute Sync

**Run sync script**:

```bash
# From sub-workspace to parent:
bun $CLAUDE_PROJECT_DIR/.specify/scripts/ts/src/commands/util/sync-docs.ts --from-sub-workspace {NAME} [--dry-run] [--force]

# From parent to sub-workspace:
bun $CLAUDE_PROJECT_DIR/.specify/scripts/ts/src/commands/util/sync-docs.ts --to-sub-workspace {NAME} [--dry-run] [--force]

# All sub-workspaces:
bun $CLAUDE_PROJECT_DIR/.specify/scripts/ts/src/commands/util/sync-docs.ts --all [--dry-run] [--force]
```

**CRITICAL: Handle script errors**:
- **If exit code != 0**: **STOP IMMEDIATELY**. Show error message.

---

### Step 4: Handle Deleted Files Warning

**If workspace has files not in sub-workspace** (when syncing from sub-workspace):

```
Files in target not found in source:
  - old-feature/spec.md
  - deprecated/config.md

These files will NOT be deleted automatically.
Action: [K] Keep all  [D] Delete manually (show paths)
```

If user selects "Delete manually":
- List full paths for manual deletion
- Suggest: "rm {path}" commands

---

### Step 5: Output & Suggestions

**Output**:
```
Sync completed successfully!
Direction: {direction}
Files synced: {count}
  - New: {new_count}
  - Updated: {modified_count}

Suggestion: Run /tdk-config-index to refresh document index.
```

---

## Examples

### Sync sub-workspace docs to parent workspace
```
/tdk-config-sync --from-sub-workspace frontend
```

### Sync parent shared docs to sub-workspace
```
/tdk-config-sync --to-sub-workspace frontend
```

### Sync all sub-workspaces
```
/tdk-config-sync --all
```

### Force sync without preview
```
/tdk-config-sync --from-sub-workspace frontend --force
```

### Preview changes only
```
/tdk-config-sync --from-sub-workspace frontend --dry-run
```

---

## Related

- `docs:diff` - Compare workspace vs sub-workspace docs (without syncing)
- `docs:index` - Generate document manager index
