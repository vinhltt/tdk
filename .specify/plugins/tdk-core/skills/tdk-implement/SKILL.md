---
name: tdk-implement
description: "Primary implementation skill. Execute phases from plan.md ## Phases table. Read plan.md as source of truth for status + dependency graph."
metadata:
  version: "11.1.3"
---

## ⛔ CRITICAL: Error Handling

**If ANY script returns an error, you MUST:**
1. **STOP immediately** - Do NOT attempt workarounds or auto-fixes
2. **Report the error** - Show the exact error message to the user
3. **Wait for user** - Ask user how to proceed before taking any action

---

## User Input

```text
$ARGUMENTS
```

You **MUST** consider the user input before proceeding (if not empty).

## Boundary

This skill reads plan.md and executes phases using the `## Phases` table as the single source of truth (SoT).

- **Primary implementation path**: executes all phases in row order, updating Status cells in the `## Phases` table
- **Selected phase path**: optional `--phase NN` / `--phase=NN` executes one numeric phase only
- **Parallel path**: `--parallel` executes agent-selected `auto` waves gated by the write-disjointness checker
- **Status tracking**: reads/writes Status column via `updatePhaseStatus` - no HTML comment markers
- **Dependency enforcement**: validates BlockedBy before each phase; aborts on unsatisfied deps
- **Phase validation**: validates every phase contract before status mutation;
  spike phases require executable evidence and a user decision gate
- **F3 crash recovery**: detects stale `in_progress` rows at startup and requires explicit recovery choice before any status mutation
- **Branch preflight**: on polyrepo projects, `tdk-branch-preflight` places every affected sub-workspace repository on the agreed feature branch at Step 6A; `--no-branch` skips every Git step
- **Serial by default**: default and selected modes remain serial, and no invocation locks the repository — do not run two TDK commands on the same `TASK_ID` concurrently, and two different `TASK_ID`s touching the same sub-workspace repository are equally unsupported as a concurrent run

## Core Contract

Load: `references/project-and-phase-contract.md`
Use this reference for argument parsing, portable script invocation, status preflight, phase-table parsing, F3 recovery, target resolution, and confirmation.

Load: `references/routing-preflight.md`
Use this reference for `plan-skill-routing.md` loading and delegate drift handling before status mutation.

Load: `references/phase-execution.md`
Use this reference for row-order execution, delegate skill parsing/running, generic implementation, and completion reporting.

Load: `references/parallel-phase-orchestration.md`
Load this progressive reference only when `PARALLEL_MODE` is true. It owns canaries, wave selection,
the write-disjointness gate, synchronous dispatch, worker boundaries, and all parallel status persistence.

## Outline

### Step 0 — Parse Args

Parse user input before project context loading or status mutation. Follow `references/project-and-phase-contract.md`.

### Step 0.1 — Validate Task ID

Invoke `tdk-validate-task-id` with cleaned `TASK_ID` and host skill name `/tdk-implement`.
If STOP -> halt execution. Store: `TASK_ID`, `TASK_ID_SOURCE`.

### Step 0.2 — Load Project Context

Invoke `tdk-load-project-context` with validated `TASK_ID`.
Store: `PROJECT_CONTEXT`, `FEATURE_DIR`.

### Step 0.3 — Load Skill Routing

Load routing after project context and before any phase status mutation. Follow `references/routing-preflight.md`.

### Step 0.4 — Mutation Preconditions

Follow the mutation preconditions in `references/project-and-phase-contract.md`.
Re-read status, routing, and phase inputs immediately before the first
persistent write in every mode, and stop on drift.

### Script Command Contract

Before any direct TDK TypeScript script call, resolve the project root at the agent layer using the active coding harness/session context. Ask the user for the project root if you cannot identify it confidently before running the command. Replace `<agent-resolved-project-root>` with the actual absolute project root; do not pass the placeholder literally.

```bash
bash -lc '
PROJECT_DIR="$1"
if [ -z "$PROJECT_DIR" ] || [ ! -d "$PROJECT_DIR/.specify/scripts/ts" ]; then
  echo "Invalid project root: $PROJECT_DIR" >&2
  exit 1
fi
(cd "$PROJECT_DIR/.specify/scripts/ts" && bun src/commands/...)
' -- "<agent-resolved-project-root>"
```

Do not run TDK scripts by changing into the scripts directory with a relative path.

### Step 1: Check Prerequisites

Run prerequisite check per `references/project-and-phase-contract.md`. `plan.md` is required; if missing, STOP and tell the user to run `/tdk-plan {task_id}` first.

### Step 2: Status Preflight

Run the read-only status collector before reading phase files or mutating statuses. Use structured fields only; do NOT invoke `/tdk-status`. See `references/project-and-phase-contract.md`.

### Step 3: Parse Phases Table

Parse `## Phases` with `parse-phases-table.ts "{FEATURE_DIR}/plan.md" --json`. This parser remains the execution source of truth before writes.

### Step 4: F3 Recovery Gate

In serial mode, scan all rows for stale `in_progress` status and use AskUserQuestion recovery. Any recovery
write must update phase frontmatter first, then `plan.md`, then reparse. In parallel mode, collect stale rows
read-only and defer recovery to the fenced recovery-only controller branch.

### Step 5: Resolve Target Rows

Build `phaseByNumber` and `TARGET_ROWS` after global F3 recovery. Selected mode never auto-runs dependencies.

### Step 6: Confirm Before Executing

Display compact status + phase list from parsed rows. Do not read phase files before this confirmation.

### Step 6A: Branch Preflight

Skip when `--no-branch` was passed, when `PROJECT_CONTEXT.subWorkspaces` is empty
or absent, or when no target row is runnable after Step 5.
Invoke `tdk-branch-preflight` with `PROJECT_DIR`, `TASK_ID`, `FEATURE_DIR`,
`PROJECT_CONTEXT`, `TARGET_ROWS`.
Passing `TARGET_ROWS` keeps preflight scoped to the phases this run executes, so `--phase NN` does not create
branches in repositories it never touches.
If STOP -> halt execution before any status mutation.
Store: `GIT_MAP`.

`PROJECT_DIR` is the agent-resolved project root already used for every script call in this skill; pass it
down rather than letting the invoked skill guess a working directory.

The "no runnable target row" condition matters because Step 2 is not the only way a finished task reaches
this point: an `in_progress` task can pass Step 4 recovery with the last phase marked done, and recovery
re-runs the phase scan without returning to Step 2. Without this condition, Step 6A would fetch, prompt, and
create branches for a task that then executes nothing.

### Step 6.1: Branch by Execution Mode

When `PARALLEL_MODE` is true, load and execute `references/parallel-phase-orchestration.md`, then STOP;
do not enter the serial Step 7 loop. Otherwise continue with existing default/selected serial execution.

### Step 7: Execute Phases — Row Order

Run phases in ascending row order. Before each `todo` phase status transition:

#### 7A. Routing Preflight

Load routing expectations from `references/routing-preflight.md`. This is read-only before the first `in_progress` status transition; cancel stops without status mutation. Actual status writes still keep phase frontmatter first, then `plan.md`.

Before routing preflight, run `validate-phase-file.ts` for the current phase as
defined in `references/phase-execution.md`. Validation failure stops before
status mutation.

#### 7B. Delegate Skills Phase — Auto-continue

If the phase contains usable `## Delegate Skills`, run listed delegates in order. Delegate failures leave the phase `in_progress` and emit the F3 recovery reminder.

#### 7C. Implementation Phase — Auto-continue (no confirmation gate)

If no delegate section applies, execute the phase as generic implementation. You MUST actually implement the code, not just read and summarize the plan.

For every normal phase, validate success criteria when present, mark done with
phase frontmatter first and `plan.md` second, then log completion. For a spike,
write `## Spike Result`, run its decision gate, and keep dependents blocked
until approval or a replan updates the graph.

### Step 8: Completion Summary

After all phases, report executed/skipped counts and suggest `/tdk-status {task_id}`.

## Required Reference Load Contract

For every internal `Load: references/X.md` directive, resolve the target from `SKILL_BASE_DIR`, the directory containing this `SKILL.md`, to the expected absolute path `SKILL_BASE_DIR/references/X.md`. Before proceeding with the current step:

1. Verify the expected absolute path exists and is readable.
2. Read the first line and STOP if it begins with `<!-- DO NOT LOAD`.
3. Read the full file successfully before using any instruction from that reference.

On missing, unreadable, or stubbed internal references, STOP and report the expected absolute path and current step. Do not try alternate paths, fallback layouts, or partial reconstruction from memory.

This contract applies only to internal `references/*.md` loads. Project-specific files governed by `references/routing-preflight.md` keep their documented exact-path missing-file behavior.
