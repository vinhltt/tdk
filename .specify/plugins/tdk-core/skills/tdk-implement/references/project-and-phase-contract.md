# Project and Phase Contract

Use this reference for `/tdk-implement` Steps 0-6 and all phase status writes.

## Step 0 - Parse Args

Accepted forms:
- `/tdk-implement <TASK_ID>`
- `/tdk-implement <TASK_ID> --phase NN`
- `/tdk-implement <TASK_ID> --phase=NN`
- `/tdk-implement <TASK_ID> --parallel`
- `/tdk-implement <TASK_ID> --no-branch`
- `/tdk-implement <TASK_ID> --phase NN --no-branch`
- `/tdk-implement <TASK_ID> --phase=NN --no-branch`
- `/tdk-implement <TASK_ID> --parallel --no-branch`
- `/tdk-implement <TASK_ID> --worktree`
- `/tdk-implement <TASK_ID> --phase NN --worktree`
- `/tdk-implement <TASK_ID> --phase=NN --worktree`
- `/tdk-implement <TASK_ID> --parallel --worktree`

Contract:

```text
INPUT_TOKENS = split $ARGUMENTS
TASK_ID = first positional token
PHASE_FILTER = optional numeric value from --phase NN or --phase=NN
PHASE_FILTER_PRESENT = true when --phase is provided
PARALLEL_MODE = true only when one --parallel token is provided
NO_BRANCH = true only when one --no-branch token is provided
WORKTREE_MODE = true only when one --worktree token is provided
```

`--no-branch` takes no value. It is valid on its own and in combination with either `--phase` form or with
`--parallel`, in any token order — `--no-branch --parallel` and `--parallel --no-branch` parse identically.

`--worktree` takes no value either. It asks branch preflight to put this task on a worktree even when the
repository's main checkout is free, for this run only — there is no config field for it. It combines with either
`--phase` form and with `--parallel`, in any token order, but never with `--no-branch`: a worktree is a branch
step.

Reject and STOP before task-id validation if any of these are present:
- missing `TASK_ID`
- unknown flags
- duplicate --phase
- missing value
- non-numeric value
- negative value
- extra positional tokens
- duplicate `--parallel`
- duplicate `--no-branch`
- a value attached to `--no-branch`
- duplicate `--worktree`
- a value attached to `--worktree`
- `--worktree` together with `--no-branch`
- any unknown value or positional after `--parallel`, where `--no-branch` and `--worktree` are known flags
  rather than unknown tokens and are therefore accepted in that position

Also reject `--parallel` with either `--phase` form before task-id validation, prerequisite collection,
capability probes, or project mutation. Do not infer a harness from environment variables,
installation metadata, paths, or canary output. Default and selected parsing otherwise stays unchanged.

Normalize `PHASE_FILTER` to a non-negative number, so `00` and `0` select phase 0. Display may use padded or unpadded phase numbers, but comparisons MUST use the numeric value.

`RERUN_FLAGS` = whichever of `--no-branch` and `--worktree` this run has, otherwise empty. Every rerun command this skill prints carries RERUN_FLAGS.

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
| `planned` | Show todo count and first todo phase; continue to parse and preview. |
| `in_progress` + `nextPhase` + no `currentPhase` | Show progress and resume target; continue to parse and preview. Without `--phase`, the run resumes at `nextPhase`; with `--phase NN`, `nextPhase` is informational and the target stays NN. |
| `in_progress` + `currentPhase` | Continue to parse, then Step 4 before any status mutation: serial mode enters the F3 recovery gate; `--parallel` only collects stale rows and STOPs at Step 6. |
| `in_progress` + no `nextPhase` + no `currentPhase` | STOP. Only blocked rows remain after done work; show blocked rows and recommend resolving them with `/tdk-plan {TASK_ID}`. |
| `blocked` | STOP. No actionable phase is left; show blocked rows and recommend resolving them with `/tdk-plan {TASK_ID}`. |
| `done` | STOP. Report done. Appended phases must be present in `plan.md` `## Phases` to be detected. |
| `cancelled` | STOP. Every phase is skipped or cancelled; nothing to implement. |
| `archived` | STOP. Feature is archived; it is no longer an active feature. |
| `ready` | STOP. No plan yet; recommend `/tdk-plan {TASK_ID}`. |
| `draft` | STOP. Spec has not passed the quality gate; recommend `/tdk-clarify {TASK_ID}`. |
| `empty` | STOP. Recommend `/tdk-specify {TASK_ID}`. |

This preflight is read-only. The phase parser below remains the execution source of truth before writes.

## Mutation Preconditions

No invocation holds a repo-wide mutex. Nothing fences two concurrent runs, so do
not run two TDK commands on the same `TASK_ID` at the same time.

Immediately before the first persistent write, re-read every status, phase,
routing, and dependency input used for that mutation, and stop on any drift. A
cancel before the first write leaves the project untouched. A crash after writes
begin leaves whatever was written; `plan.md` is the source of truth for what to
recover, and the F3 gate below is the entry point.

Step 6A is the one exception to the sentence above. Its Git side effects — a branch in each affected
sub-workspace repository plus `git-map.md` — happen before the remaining cancel points, so a later cancel
does not leave the project untouched. Those side effects are reclaimed by the resume and adopt paths of
`tdk-branch-preflight` on the next run, never by rolling back or deleting a branch. Do not delete a branch to
restore the untouched state. Step 6A re-reads the Mutation Precondition inputs above before it writes
`git-map.md`.

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

In serial mode, before resolving selected targets or entering execution, scan all rows:

```text
for each row in rows:
  if row.status === 'in_progress':
    EMIT: "Phase NN currently in_progress. Likely previous run interrupted."
    ask explicit recovery action before any mutation
```

Use AskUserQuestion with Retry this phase, Mark done, Mark skipped, and Cancel. Ask about one stale row per AskUserQuestion call, lowest row first, and never batch rows into one call: what the next question says depends on this answer. Each answer only writes this row's status (Retry this phase writes `todo`); none of them executes a row, and the next step below happens after every other stale row has been answered. The description of Retry this phase, Mark done, and Mark skipped must state what the run does next. Without --phase: it continues through the remaining phases in row order and STOPs at the first `todo` row with an unsatisfied blocker. With --phase NN when this row is phase NN: Retry this phase runs it if its blockers are done or skipped; Mark done and Mark skipped end the run with nothing executed. With --phase NN when this row is another phase: the answer only changes this row; then phase NN runs if it is `todo` and its blockers are done or skipped, the run ends with nothing executed if phase NN is already done or skipped, otherwise the run STOPs. The description of Cancel must say that to run only this phase after recovering it, the user cancels and reruns with --phase {row.number}, and that any other stale row is still asked. Recovery writes MUST use the same order as normal status transitions: `update-phase-frontmatter-status.ts "{phasePath}" {todo|done|skipped}` first, then `update-phase-status.ts "{FEATURE_DIR}/plan.md" {row.number} {todo|done|skipped}`. After any recovery write, re-run `parse-phases-table.ts` and restart this scan before proceeding.

For an `in_progress` spike, validate the phase file before showing recovery.
Never offer direct `Mark done` or `Mark skipped`, because either would bypass
the spike decision gate. Offer Retry experiment, Resume decision gate when a
non-pending `## Spike Result` exists, Replan, and Cancel. Approval/replan then
follows the spike lifecycle in `phase-execution.md`. Retry experiment follows the same next-step cases as Retry this phase. Resume decision gate runs that gate on this row now, then the run continues under those cases unless the gate STOPs. Cancel carries the same --phase {row.number} hint.

On phase-work failure during execution, emit: `"Phase NN left in_progress. Recover it with /tdk-implement {TASK_ID} --phase NN {RERUN_FLAGS}."`

Parallel mode performs no F3 recovery and neither of these two legacy status writes. It collects stale rows read-only for Step 6, which STOPs on any of them. Otherwise it writes every status through the single `transition-phase-status` call defined in `parallel-phase-orchestration.md`.

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

## Step 6 - Execution Preview

The preview line and how to print it are in `SKILL.md` Step 6. The invocation already chose the scope, so this step asks the user nothing. The preview is read-only.

If `PARALLEL_MODE` is true and any row has `plan.md` status `in_progress`, list those rows, then STOP before branch preflight, canaries, and any status write:

```text
Phase {NN} is in_progress. --parallel does not recover stale phases.
Run /tdk-implement {TASK_ID} --phase {NN} {RERUN_FLAGS} to recover it, then rerun with --parallel.
```

Name the lowest stale phase number. F3 in that serial run scans every row. A frontmatter/table mismatch on a `todo` row is left to routing preflight, which STOPs before any status mutation.
