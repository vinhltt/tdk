---
name: tdk-workflow-config-apply
description: "Interactively review and apply guarded .specify/.specify.json changes derived from workspace layout proposal JSON."
argument-hint: "[(no flags)|--dry-run|--reconcile|--yes --expect-hash <hash>] [--topology <path>]"
metadata:
  version: "5.11.0"
---

# tdk-workflow-config-apply

Review and optionally apply an approved workspace layout proposal to TDK
runtime config.

## Contract

- `workspace-layout-proposal.json` is the authoring proposal.
- `workspace-topology.json` remains a legacy fallback.
- `.specify/.specify.json` is derived runtime config.
- no flags is the default human mode: dry-run, parse `planHash` internally,
  show the review summary, ask for confirmation, then apply the exact preview.
- `--dry-run` is preview-only and writes no files.
- `--reconcile` is report-only and implies preview; it does not need `--dry-run`.
- automation apply remains explicit: `--yes --expect-hash <planHash>`.
- `--yes` without `--expect-hash` exits 1. There is no single-shot apply.
- `--expect-hash` proves preview/apply consistency, not proposal authenticity.
- apply is eligible only for proposal files under `.specify/configurations/workspace-layout/` or legacy topology files under `.specify/configurations/workspace-topology/`.
- an existing JSON `.specify/.specify.json` is required. Missing JSON and YAML-only config exit 1 with guidance; first-time creation is deferred.
- same-name overwrites, architecture type changes, and normalized path collisions require `--accept-overwrites` after explicit user approval.
- Safe report-only fields are warned and ignored for runtime config.
- shell-like routing values hard-fail.
- live writes preserve unknown top-level/plugin-owned config fields instead of writing a schema-stripped config.
- apply uses a lock, stale-hash rejection, git-first recoverability, raw pre-write backups when needed, atomic write, and parent-dir fsync.
- backups live under the selected proposal directory's `backups/`, are `0600`, self-ignored by a writer-created `.gitignore` containing `*`, and retention-bounded.
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
| no flags | Recommended human flow: preview, review, confirm, then guarded apply with the parsed `planHash`. |
| `--dry-run` | Preview only. Writes no files and stops after the summary. |
| `--topology <path>` | Use a workspace layout proposal path or legacy topology path instead of auto-detecting. |
| `--reconcile` | Brownfield reconciliation preview. Writes no config and never moves or renames folders. |
| `--yes` | Automation apply for a previously previewed plan. Requires `--expect-hash`. |
| `--expect-hash <hash>` | Hash from a prior dry-run JSON payload. Mandatory with `--yes`. |
| `--accept-overwrites` | Allow confirmation findings only after explicit user approval. |

Default proposal path:

```text
.specify/configurations/workspace-layout/workspace-layout-proposal.json
```

Legacy fallback when the new proposal file is missing:

```text
.specify/configurations/workspace-topology/workspace-topology.json
```

## Execution Steps

### Step 0 - Parse Flags

Select mode:

| Input | Mode |
|---|---|
| no flags | `interactive` |
| `--dry-run` without `--yes` | `preview-only` |
| `--reconcile` without `--yes` | `reconcile-preview` |
| `--yes --expect-hash <hash>` | `automation-apply` |

Reject directory-creation flags, source-move flags, source-rename flags, `--force`, and routing-update flags. Stop with a scoped-deferred message.

Reject `--reconcile --yes`; reconcile remains report-only.

Reject `--yes` without `--expect-hash`; tell the user to run either the no-flag
interactive flow or explicit `--dry-run` first.

Resolve `TOPOLOGY_PATH` from `--topology <path>` or use the default path above,
falling back to legacy topology when the new proposal file is absent.

### Step 1 - Resolve Project Root

Use `<agent-resolved-project-root>` from the active coding harness/session.

Ask the user for the project root if it cannot be identified confidently; do not pass the placeholder literally.

### Step 2 - Preview The CLI

```bash
bash -lc '
PROJECT_DIR="$1"
TOPOLOGY_PATH="$2"
RECONCILE_MODE="$3"
if [ -z "$PROJECT_DIR" ] || [ ! -d "$PROJECT_DIR/.specify/scripts/ts" ]; then
  echo "Invalid project root: $PROJECT_DIR" >&2
  exit 1
fi
case "$TOPOLOGY_PATH" in
  /*) TOPOLOGY_ARG="$TOPOLOGY_PATH" ;;
  *) TOPOLOGY_ARG="$PROJECT_DIR/$TOPOLOGY_PATH" ;;
esac
EXTRA_ARGS=()
if [ "$RECONCILE_MODE" = "yes" ]; then
  EXTRA_ARGS+=(--reconcile)
fi
(cd "$PROJECT_DIR/.specify/scripts/ts" && bun src/index.ts config topology apply --dry-run --topology "$TOPOLOGY_ARG" "${EXTRA_ARGS[@]}")
' -- "<agent-resolved-project-root>" "{TOPOLOGY_PATH}" "{yes|no}"
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

Show a concise review summary before any write:

- proposal path
- config path
- changed sections from `diff`
- warnings
- confirmation findings
- whether apply is eligible

In `preview-only` or `reconcile-preview` mode, stop here. Do not ask for apply
confirmation.

### Step 3 - Interactive Confirmation Gate

If `applyEligible` is not `true`, do not apply. Explain that only layout proposal
files under `.specify/configurations/workspace-layout/` or legacy topology files
under `.specify/configurations/workspace-topology/` can be applied.

If `requiresConfirmation` is true, show `confirmationFindings` and ask the user for explicit approval before passing `--accept-overwrites`.

In `interactive` mode, ask:

```text
Apply this workflow config patch to `.specify/.specify.json`?
```

If the user declines, stop after the preview and write no files.

### Step 4 - Apply The Preview

In `interactive` mode, use the parsed `planHash` from Step 2. Do not make the
user copy it manually.

In `automation-apply` mode, skip Steps 2 and 3 and call the CLI with the
provided `--expect-hash` value.

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

When `--reconcile` is present, stay in `reconcile-preview` mode:

1. Compare real folders with proposed `subWorkspaces[]` and `modules[]`.
2. Report add, update, keep, and missing-folder decisions.
3. Surface same-name overwrite/conflict candidates.
4. State that normal apply should use `/tdk-workflow-config-apply`; automation
   can still use `--dry-run` followed by `--yes --expect-hash`.

Reconcile is observe/report only. It does not move, rename, create, or delete source folders.

### Step 6 - Report

Show:

- proposal path
- config path
- dry-run patch summary
- `applyEligible`
- warnings
- whether confirmation is required
- apply result, changed files, backup path, report path, and audit status when applied
- `planHash` only when useful for automation/debug; do not make it the primary
  user action in default mode
- unresolved questions, if any

## Quality Gates

- [ ] No flags is the default interactive human flow.
- [ ] The TypeScript CLI is the validation authority.
- [ ] `--yes` always includes a parsed `--expect-hash`.
- [ ] `--accept-overwrites` is passed only after explicit user approval.
- [ ] Existing JSON config requirement is respected; YAML-only and missing JSON are not auto-created.
- [ ] External layout/topology paths are dry-run-only.
- [ ] Raw-preserving write, raw backup, lock, stale check, atomic write, and idempotency are enforced by the CLI.
- [ ] Output has one JSON object on stdout; failure audit goes to stderr.
- [ ] Shell-like routing values hard-fail.
- [ ] Safe report-only fields are not written to runtime config.
- [ ] Brownfield conflicts are visible and require explicit confirmation.
