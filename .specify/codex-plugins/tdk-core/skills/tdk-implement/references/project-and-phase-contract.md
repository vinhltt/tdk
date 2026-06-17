# Project and Phase Contract

Use this reference for `/tdk-implement` Steps 0-6 and all phase status writes.

## Step 0 - Parse Args

Accepted forms:
- `/tdk-implement <TASK_ID>`
- `/tdk-implement <TASK_ID> --phase NN`
- `/tdk-implement <TASK_ID> --phase=NN`

Contract:

```text
INPUT_TOKENS = split $ARGUMENTS
TASK_ID = first positional token
PHASE_FILTER = optional numeric value from --phase NN or --phase=NN
PHASE_FILTER_PRESENT = true when --phase is provided
```

Reject and STOP before task-id validation if any of these are present:
- missing `TASK_ID`
- unknown flags
- duplicate --phase
- missing value
- non-numeric value
- non-positive value
- extra positional tokens

Normalize `PHASE_FILTER` to a positive number. Display may use padded or unpadded phase numbers, but comparisons MUST use the numeric value.

## Task ID and Project Context

Invoke `tdk-validate-task-id` with cleaned `TASK_ID` and host skill name `/tdk-implement`, not raw `$ARGUMENTS`. If STOP -> halt execution.

Invoke `tdk-load-project-context` with validated `TASK_ID`. Store: `PROJECT_CONTEXT`, `FEATURE_DIR`.

## Script Command Contract

Before any direct TDK TypeScript script call, resolve the project root at the agent layer using the active coding harness/session context. Ask the user for the project root if you cannot identify it confidently before running the command. Replace `<agent-resolved-project-root>` with the actual absolute project root; do not pass the placeholder literally.

```bash
bash -lc '
PROJECT_DIR="$1"
if [ -z "$PROJECT_DIR" ] || [ ! -d "$PROJECT_DIR/.specify/scripts/ts" ]; then
  echo "Invalid project root: $PROJECT_DIR" >&2
  exit 1
fi
(cd "$PROJECT_DIR/.specify/scripts/ts" && bun src/commands/<path>.ts ...)
' -- "<agent-resolved-project-root>"
```

Do not run TDK scripts by changing into the scripts directory with a relative path.

## Step 1 - Check Prerequisites

Run:

```bash
bash -lc '
PROJECT_DIR="$1"
if [ -z "$PROJECT_DIR" ] || [ ! -d "$PROJECT_DIR/.specify/scripts/ts" ]; then
  echo "Invalid project root: $PROJECT_DIR" >&2
  exit 1
fi
(cd "$PROJECT_DIR/.specify/scripts/ts" && bun src/commands/util/check-prerequisites.ts {task_id} --json)
' -- "<agent-resolved-project-root>"
```

Parse JSON output. If `availableDocs` does not include `plan.md`, STOP:

```text
❌ plan.md not found for {task_id}
Run /tdk-plan {task_id} first to generate the implementation plan.
```

## Step 2 - Status Preflight

Run the same read-only status collector used by `/tdk-status` before reading phase files or mutating statuses:

```bash
bash -lc '
PROJECT_DIR="$1"
if [ -z "$PROJECT_DIR" ] || [ ! -d "$PROJECT_DIR/.specify/scripts/ts" ]; then
  echo "Invalid project root: $PROJECT_DIR" >&2
  exit 1
fi
(cd "$PROJECT_DIR/.specify/scripts/ts" && bun src/commands/feature/status.ts {TASK_ID})
' -- "<agent-resolved-project-root>"
```

Parse JSON output. If `error` or `phasesParseError` exists, report the exact message and STOP.

Use structured fields only. Do NOT invoke `/tdk-status` and do NOT parse formatted status output or recommendation prose.

Store `feature_status`, phase counts, `phases.currentPhase`, `phases.nextPhase`, and `phases.rows[]`.

Decision table:

| Status result | Behavior |
|---|---|
| `planned` | Show todo count and first todo phase; continue to parse/confirm. |
| `in_progress` + `nextPhase` + no `currentPhase` | Show progress and resume target; continue to parse/confirm from `nextPhase`. |
| `in_progress` + `currentPhase` | Continue to parse, then enter F3 recovery gate before any status mutation. |
| `blocked` | STOP. Show blocked rows and recommend `/tdk-plan {TASK_ID}` or manual dependency/status repair. |
| `complete` | STOP. Report complete. Appended phases must be present in `plan.md` `## Phases` to be detected. |
| `specified` | STOP. Recommend `/tdk-plan {TASK_ID}`. |
| `empty` | STOP. Recommend `/tdk-specify {TASK_ID}`. |

Compact preflight summary:

```text
Status preflight: {feature_status}
Progress: {done}/{total - skipped} ({percent}%)
Counts: todo={todo}, in_progress={inProgress}, blocked={blocked}, skipped={skipped}
Current: {currentPhase || "none"}
Next: {nextPhase || "none"}
```

This preflight is read-only. The phase parser below remains the execution source of truth before writes.

## Step 3 - Parse Phases Table

Run:

```bash
bash -lc '
PROJECT_DIR="$1"
if [ -z "$PROJECT_DIR" ] || [ ! -d "$PROJECT_DIR/.specify/scripts/ts" ]; then
  echo "Invalid project root: $PROJECT_DIR" >&2
  exit 1
fi
(cd "$PROJECT_DIR/.specify/scripts/ts" && bun src/commands/util/parse-phases-table.ts "{FEATURE_DIR}/plan.md" --json)
' -- "<agent-resolved-project-root>"
```

Parse JSON output. If exit code 1, report errors and STOP.

JSON shape: `{ "phases": [{ "number": 1, "file": "phase-01-x.md", "fileLabel": "...", "status": "todo", "blocks": [], "blockedBy": [], "rowLineNumber": 11 }], "errors": [] }`

Phase frontmatter sync CLI, called before plan.md write at every status transition:

```bash
bash -lc '
PROJECT_DIR="$1"
if [ -z "$PROJECT_DIR" ] || [ ! -d "$PROJECT_DIR/.specify/scripts/ts" ]; then
  echo "Invalid project root: $PROJECT_DIR" >&2
  exit 1
fi
(cd "$PROJECT_DIR/.specify/scripts/ts" && bun src/commands/util/update-phase-frontmatter-status.ts "{phasePath}" {status})
' -- "<agent-resolved-project-root>"
```

Update phase status in plan.md table:

```bash
bash -lc '
PROJECT_DIR="$1"
if [ -z "$PROJECT_DIR" ] || [ ! -d "$PROJECT_DIR/.specify/scripts/ts" ]; then
  echo "Invalid project root: $PROJECT_DIR" >&2
  exit 1
fi
(cd "$PROJECT_DIR/.specify/scripts/ts" && bun src/commands/util/update-phase-status.ts "{FEATURE_DIR}/plan.md" {phaseNumber} {status})
' -- "<agent-resolved-project-root>"
```

If `## Phases` section is missing, STOP with `"plan.md has no ## Phases table section. Regenerate with /tdk-plan."`. Store `rows = result.phases` sorted ascending by `row.number`.

## Step 4 - F3 Recovery Gate

Before resolving selected targets or entering execution, scan all rows:

```text
for each row in rows:
  if row.status === 'in_progress':
    EMIT: "Phase NN currently in_progress. Likely previous run interrupted."
    ask explicit recovery action before any mutation
```

Use AskUserQuestion with Retry this phase, Mark done, Mark skipped, and Cancel. Recovery writes MUST use the same order as normal status transitions: `update-phase-frontmatter-status.ts "{phasePath}" {todo|done|skipped}` first, then `update-phase-status.ts "{FEATURE_DIR}/plan.md" {row.number} {todo|done|skipped}`. After any recovery write, re-run `parse-phases-table.ts` and restart this scan before proceeding.

On phase-work failure during execution, emit: `"Phase NN left in_progress. Recover as described above."`

## Step 5 - Resolve Target Rows

After parsing rows and completing global F3 recovery, build:

```text
phaseByNumber = new Map(rows.map(row => [row.number, row]))
TARGET_ROWS = PHASE_FILTER_PRESENT
  ? rows.filter(row => row.number === PHASE_FILTER)
  : rows
PHASE_FILTER_PRESENT ? rows.filter(row => row.number === PHASE_FILTER) : rows
```

If `PHASE_FILTER` is set and no matching row exists, STOP with `No phase found for --phase {PHASE_FILTER}.`

If selected row is `done`, `skipped`, `blocked`, or `cancelled`, report no runnable selected phase and STOP without mutation.

Dependency checks must read blocker rows from `phaseByNumber.get(id)`. Missing blockers or blockers with status other than `done` / `skipped` stop execution. Do not auto-run dependencies for selected mode.

## Step 6 - Confirm Before Executing

Display compact preflight summary plus phase list from parsed rows. Do not read phase files before this confirmation.

If `PHASE_FILTER` exists, list only `TARGET_ROWS` and label selected phase execution. Otherwise list all rows and keep all-phase wording. Use AskUserQuestion with Yes execute all phases, Yes execute selected phase, and No cancel.
