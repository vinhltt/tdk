---
name: tdk-config-diff
description: "Compare Workspace and Sub-Workspace Docs."
metadata:
  version: "3.4.11"
---

# /tdk-config-diff - Compare Workspace and Sub-Workspace Docs

## Purpose

Show differences between workspace and sub-workspace documentation files. Helps identify what would change before syncing.

---

## Flags

- `--sub-workspace NAME` (required): Target sub-workspace to compare
- `--detailed`: Show actual file content differences

---

## Execution

### Step 0: Parse Arguments & Run Script

**Parse user input**:
1. Check for `--sub-workspace NAME` (required)
2. Check for `--detailed` flag

If no sub-workspace specified:
- Ask user: "Which sub-workspace do you want to compare?" with AskUserQuestion
- Show available sub-workspaces from workspace config

**Run bash script**:

```bash
# Add --detailed when needed.
bash -lc '
PROJECT_DIR="$1"
if [ -z "$PROJECT_DIR" ] || [ ! -d "$PROJECT_DIR/.specify/scripts/ts" ]; then
  echo "Invalid project root: $PROJECT_DIR" >&2
  exit 1
fi
(cd "$PROJECT_DIR/.specify/scripts/ts" && bun src/commands/config/diff.ts --sub-workspace {SUB_WORKSPACE_NAME})
' -- "<agent-resolved-project-root>"
```

Ask the user for the project root if `<agent-resolved-project-root>` cannot be identified confidently; do not pass the placeholder literally.

**CRITICAL: Handle script errors**:
- **If exit code != 0**: **STOP IMMEDIATELY**. Do NOT continue or try workarounds.
- **If "Required tools not installed"**: Show error message to user and STOP.
- **If "Sub-workspace not found"**: Show available sub-workspaces and STOP.
- **If other errors**: Show error message and STOP.

**On success only**: Parse JSON output into variables:
- `SUB_WORKSPACE_NAME` - Name of sub-workspace
- `WORKSPACE_DOCS` - Workspace docs path
- `SUB_WORKSPACE_DOCS` - Sub-workspace docs path
- `SUMMARY` - Object with counts (new, modified, identical, workspace_only)
- `FILES` - Array of file objects with path, status, details, [diff]

---

### Step 1: Display Diff Summary

**Format output as table**:

```
Diff: {SUB_WORKSPACE_NAME} <-> workspace

Direction: Sub-workspace -> Workspace
+--------------------------+-------------+---------------------+
| File                     | Status      | Details             |
+--------------------------+-------------+---------------------+
| rules/code/naming.md     | Modified    | +15 -3 lines        |
| rules/code/style.md      | New         | Sub-workspace only  |
| shared/conventions.md    | Identical   | No changes          |
| old-feature/spec.md      | Workspace   | Workspace only      |
+--------------------------+-------------+---------------------+

Summary: {modified} modified | {new} new | {identical} identical | {workspace_only} workspace-only
```

**Status meanings**:
- `New` - File exists in sub-workspace but not in workspace
- `Modified` - File exists in both but content differs
- `Identical` - File exists in both with same content
- `Workspace` - File exists in workspace but not in sub-workspace

---

### Step 2: Show Details (if --detailed)

If `--detailed` flag was specified, show diff content for modified files:

```
### Modified: rules/code/naming.md

```diff
--- workspace/rules/code/naming.md
+++ sub-workspace/rules/code/naming.md
@@ -10,3 +10,5 @@
 - Test framework: vitest
+- Coverage target: 85%
+- Mock strategy: vi.mock()
```

---

### Step 3: Suggest Actions

Based on diff results, suggest next steps:

**If there are changes to sync**:
```
Next steps:
- `/tdk-config-sync --from-sub-workspace {NAME}` to copy sub-workspace docs to workspace
- `/tdk-config-sync --to-sub-workspace {NAME}` to copy workspace docs to sub-workspace
```

**If workspace has files not in sub-workspace**:
```
Note: Workspace has {count} files not present in sub-workspace.
These files will NOT be deleted during sync (safety).
```

**If no changes**:
```
Docs are in sync. No action needed.
```

---

## Related

- `docs:index` - Generate document manager index
- `docs:sync` - Sync docs between workspace and sub-workspace
