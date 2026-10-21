# Archived Spec Handling

All three retro skills run on active and on archived specs. A spec closed out with `/tdk-archive` lives under `<specs-root>/archive/<folder>/<ticket>/`; retro is the only workflow that may still read it.

## Resolve

Pass `--allow-archived` to `check-prerequisites.ts`. Without the flag the archive folder is reserved and rejected. With it, lookup is archive-first, then active; an id that exists in both exits non-zero and lists both paths.

The JSON output carries:

| Field | Use |
|-------|-----|
| `featureDir` | Store as `FEATURE_DIR`. Already the archive directory when the spec is archived. |
| `taskId` | Store as `TASK_ID`. Canonical `<folder>/<ticket>`, never contains an `archive/` segment. |
| `archived` | Store as `ARCHIVED` (`true` or `false`). |

## Task Id Rule

After resolution, use `TASK_ID` from the JSON, never the raw argument, for:

- the `# Retro Feedback - {task-id}` and `# Learning Delta - {task-id}` headings;
- any `/tdk-*` command text printed to the user, including the `Next command` line;
- the natural-language text delegated to `/tdk-memory-update`;
- the suggested commit message.

`Source feedback` and `Feature dir` header paths use `FEATURE_DIR` as resolved (the archive directory when archived).

Reason: `archive/<folder>/<ticket>` is not a valid task id for any other workflow, so a heading or next command built from the raw argument cannot be reused.

When the example-fixture fallback is used the script did not run, so `TASK_ID` is the raw argument and `ARCHIVED` is `false`.

## Write Scope on Archived Specs

When `ARCHIVED` is `true`, write only:

- `{FEATURE_DIR}/retro-feedback.md` (collect)
- `{FEATURE_DIR}/learning-delta.md` (propose, apply status updates)

Do not create or edit any other file inside the archive directory (`spec.md`, `plan.md`, phase files, `close-out.md`, sessions, reviews). Targets of approved learning entries live outside the feature directory and are unaffected.

## Retro Status Lookup

`feature/status.ts` accepts an archived spec as `archive/{TASK_ID}`. It returns `retro_status` (`none`, `collected`, `proposed`, `done`), `retro_blocked`, and `archived`:

```bash
PROJECT_DIR="$1"
if [ -z "$PROJECT_DIR" ] || [ ! -d "$PROJECT_DIR/.specify/scripts/ts" ]; then
  echo "Invalid project root: $PROJECT_DIR"
  echo 'Ask the user for the project root and re-run with: -- "<agent-resolved-project-root>"'
  exit 1
fi
STATUS_ID="{TASK_ID}"
[ "{ARCHIVED}" = "true" ] && STATUS_ID="archive/{TASK_ID}"
(cd "$PROJECT_DIR/.specify/scripts/ts" && bun src/commands/feature/status.ts "$STATUS_ID")
```
