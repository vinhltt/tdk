---
name: tdk-workspace-topology-apply
description: "Preview the derived .specify/.specify.json patch from workspace-topology.json. Slice 1 is dry-run only."
argument-hint: "[--dry-run] [--reconcile] [--topology <path>]"
metadata:
  version: "5.5.0"
---

# tdk-workspace-topology-apply

Preview how an approved workspace topology proposal would derive TDK runtime config.

## Contract

- `workspace-topology.json` is the authoring proposal.
- `.specify/.specify.json` is derived runtime config.
- dry-run is the default; dry-run writes no files.
- Safe report-only fields are warned and ignored for runtime config.
- shell-like routing values hard-fail.
- This slice does not create directories, move folders, update routing, scaffold code, or mutate config.
- This slice does not create or update `.specify/.specify.json`.
- `--yes` and physical apply/write support are deferred to a future plan.

Future apply work, when approved separately, should write backups under `.specify/configurations/workspace-topology/backups/` with `topology-apply-report.md`.

## User Input

```text
$ARGUMENTS
```

Supported flags:

| Flag | Behavior |
|---|---|
| `--dry-run` | Explicit dry-run mode. This is also the default. |
| `--topology <path>` | Use a topology proposal path instead of the default. |
| `--reconcile` | Add brownfield reconciliation notes to the report; never moves or renames folders. |

Default topology path:

```text
.specify/configurations/workspace-topology/workspace-topology.json
```

## Execution Steps

### Step 0 - Parse Flags

Reject `--yes`, directory-creation flags, source-move flags, source-rename flags, and any write/apply wording. Stop with:

```text
Apply/write support is deferred. Run dry-run only: /tdk-workspace-topology-apply --dry-run
```

Resolve `TOPOLOGY_PATH` from `--topology <path>` or use the default path above.

### Step 1 - Resolve Project Root

Use `<agent-resolved-project-root>` from the active coding harness/session.

Ask the user for the project root if it cannot be identified confidently; do not pass the placeholder literally.

### Step 2 - Run The CLI

```bash
bash -lc '
PROJECT_DIR="$1"
TOPOLOGY_PATH="$2"
if [ -z "$PROJECT_DIR" ] || [ ! -d "$PROJECT_DIR/.specify/scripts/ts" ]; then
  echo "Invalid project root: $PROJECT_DIR" >&2
  exit 1
fi
case "$TOPOLOGY_PATH" in
  /*) TOPOLOGY_ARG="$TOPOLOGY_PATH" ;;
  *) TOPOLOGY_ARG="$PROJECT_DIR/$TOPOLOGY_PATH" ;;
esac
(cd "$PROJECT_DIR/.specify/scripts/ts" && bun src/index.ts config topology apply --dry-run --topology "$TOPOLOGY_ARG")
' -- "<agent-resolved-project-root>" "{TOPOLOGY_PATH}"
```

If the command exits non-zero, stop and report the stderr/stdout summary. Do not retry with writes or hand-edit config.

### Step 3 - Reconcile Notes

When `--reconcile` is present:

1. Compare real folders with proposed `subWorkspaces[]` and `modules[]`.
2. Report add, update, keep, and missing-folder decisions.
3. Surface same-name overwrite/conflict candidates.
4. State that future apply requires explicit user confirmation for conflicts.

Reconcile is observe/report only. It does not move, rename, create, or delete source folders.

### Step 4 - Report

Show:

- topology path
- config path
- dry-run patch summary
- warnings
- whether future confirmation would be required
- unresolved questions, if any

## Quality Gates

- [ ] Dry-run is the default.
- [ ] The TypeScript CLI is the validation authority.
- [ ] No write/apply flag is supported in slice 1.
- [ ] Shell-like routing values hard-fail.
- [ ] Safe report-only fields are not written to runtime config.
- [ ] Brownfield conflicts are visible and require future explicit confirmation.
