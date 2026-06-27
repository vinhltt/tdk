---
name: tdk-workspace-topology-apply
description: "Preview or apply guarded .specify/.specify.json changes derived from workspace-topology.json."
argument-hint: "[--dry-run] [--yes --expect-hash <hash>] [--accept-overwrites] [--reconcile] [--topology <path>]"
metadata:
  version: "5.7.0"
---

# tdk-workspace-topology-apply

Preview or apply an approved workspace topology proposal to TDK runtime config.

## Contract

- `workspace-topology.json` is the authoring proposal.
- `.specify/.specify.json` is derived runtime config.
- dry-run is the default; dry-run writes no files.
- apply is a guarded two-step: dry-run emits `planHash`, then apply uses `--yes --expect-hash <planHash>`.
- `--yes` without `--expect-hash` exits 1. There is no single-shot apply.
- `--expect-hash` proves preview/apply consistency, not topology authenticity.
- apply is eligible only for topology files under `.specify/configurations/workspace-topology/`.
- an existing JSON `.specify/.specify.json` is required. Missing JSON and YAML-only config exit 1 with guidance; first-time creation is deferred.
- same-name overwrites, architecture type changes, and normalized path collisions require `--accept-overwrites` after explicit user approval.
- Safe report-only fields are warned and ignored for runtime config.
- shell-like routing values hard-fail.
- live writes preserve unknown top-level/plugin-owned config fields instead of writing a schema-stripped config.
- apply uses a lock, stale-hash rejection, git-first recoverability, raw pre-write backups when needed, atomic write, and parent-dir fsync.
- backups live under `.specify/configurations/workspace-topology/backups/`, are `0600`, self-ignored by a writer-created `.gitignore` containing `*`, and retention-bounded.
- `topology-apply-report.md` contains redacted diagnostics plus a manual revert command.
- stdout/stderr/report redact sensitive arbitrary keys and secret-looking values. Raw local backups preserve original bytes for rollback; do not store secrets in `.specify/.specify.json`.
- exit codes: 0 success, 1 validation/IO/confirmation, 2 stale preview, 3 fail-closed/no rollback path.
- deferred: first-time config creation, `--reconcile` apply, directory creation, routing updates, force apply, revert subcommand, advanced backup management.

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
| `--yes` | Apply the previously previewed plan. Requires `--expect-hash`. |
| `--expect-hash <hash>` | Hash from a prior dry-run JSON payload. Mandatory with `--yes`. |
| `--accept-overwrites` | Allow confirmation findings only after explicit user approval. |

Default topology path:

```text
.specify/configurations/workspace-topology/workspace-topology.json
```

## Execution Steps

### Step 0 - Parse Flags

Reject directory-creation flags, source-move flags, source-rename flags, `--force`, and routing-update flags. Stop with a scoped-deferred message.

Reject `--reconcile --yes`; reconcile remains report-only.

Reject `--yes` without `--expect-hash`; tell the user to run dry-run first and parse `planHash` from the JSON output.

Resolve `TOPOLOGY_PATH` from `--topology <path>` or use the default path above.

### Step 1 - Resolve Project Root

Use `<agent-resolved-project-root>` from the active coding harness/session.

Ask the user for the project root if it cannot be identified confidently; do not pass the placeholder literally.

### Step 2 - Dry-Run The CLI

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

Parse the single JSON stdout object. Capture:

- `planHash`
- `applyEligible`
- `requiresConfirmation`
- `confirmationFindings`
- `diff`
- `warnings`

Do not transcribe `planHash` by eye; parse it from JSON.

### Step 3 - Confirmation Gate

If `applyEligible` is not `true`, do not apply. Explain that only topology files under `.specify/configurations/workspace-topology/` can be applied.

If `requiresConfirmation` is true, show `confirmationFindings` and ask the user for explicit approval before passing `--accept-overwrites`.

### Step 4 - Apply The Preview

Only when the user requested apply and the gates above pass:

```bash
bash -lc '
PROJECT_DIR="$1"
TOPOLOGY_PATH="$2"
PLAN_HASH="$3"
ACCEPT_OVERWRITES="$4"
case "$TOPOLOGY_PATH" in
  /*) TOPOLOGY_ARG="$TOPOLOGY_PATH" ;;
  *) TOPOLOGY_ARG="$PROJECT_DIR/$TOPOLOGY_PATH" ;;
esac
EXTRA_ARGS=()
if [ "$ACCEPT_OVERWRITES" = "yes" ]; then
  EXTRA_ARGS+=(--accept-overwrites)
fi
(cd "$PROJECT_DIR/.specify/scripts/ts" && bun src/index.ts config topology apply --topology "$TOPOLOGY_ARG" --yes --expect-hash "$PLAN_HASH" "${EXTRA_ARGS[@]}")
' -- "<agent-resolved-project-root>" "{TOPOLOGY_PATH}" "{PLAN_HASH}" "{yes|no}"
```

If the command exits non-zero, report the exit code and stderr summary. Exit 2 means the dry-run preview is stale; rerun dry-run before applying again.

### Step 5 - Reconcile Notes

When `--reconcile` is present:

1. Compare real folders with proposed `subWorkspaces[]` and `modules[]`.
2. Report add, update, keep, and missing-folder decisions.
3. Surface same-name overwrite/conflict candidates.
4. State that apply requires `--expect-hash` and `--accept-overwrites` for conflicts.

Reconcile is observe/report only. It does not move, rename, create, or delete source folders.

### Step 6 - Report

Show:

- topology path
- config path
- dry-run patch summary
- `planHash` and `applyEligible`
- warnings
- whether confirmation is required
- apply result, changed files, backup path, report path, and audit status when applied
- unresolved questions, if any

## Quality Gates

- [ ] Dry-run is the default.
- [ ] The TypeScript CLI is the validation authority.
- [ ] `--yes` always includes a parsed `--expect-hash`.
- [ ] `--accept-overwrites` is passed only after explicit user approval.
- [ ] Existing JSON config requirement is respected; YAML-only and missing JSON are not auto-created.
- [ ] External topology paths are dry-run-only.
- [ ] Raw-preserving write, raw backup, lock, stale check, atomic write, and idempotency are enforced by the CLI.
- [ ] Output has one JSON object on stdout; failure audit goes to stderr.
- [ ] Shell-like routing values hard-fail.
- [ ] Safe report-only fields are not written to runtime config.
- [ ] Brownfield conflicts are visible and require explicit confirmation.
