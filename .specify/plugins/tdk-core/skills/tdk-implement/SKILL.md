---
name: tdk-implement
description: "Primary implementation skill. Execute phases from plan.md ## Phases table. Read plan.md as source of truth for status + dependency graph."
metadata: 
  version: "3.4.1"
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
- **Status tracking**: reads/writes Status column via `updatePhaseStatus` — no HTML comment markers
- **Dependency enforcement**: validates BlockedBy before each phase; aborts on unsatisfied deps
- **F3 crash recovery**: detects stale `in_progress` rows at startup and requires explicit recovery choice before any status mutation

---

## Outline

### Step 0 — Validate Task ID
Invoke `tdk-validate-task-id` with `$ARGUMENTS` and host skill name `/tdk-implement`.
If STOP → halt execution.
Store: `TASK_ID`, `TASK_ID_SOURCE`.

### Step 0.1 — Load Project Context
Invoke `tdk-load-project-context` with validated `TASK_ID`.
Store: `PROJECT_CONTEXT`, `FEATURE_DIR`.

### Step 1: Check Prerequisites

```bash
cd $CLAUDE_PROJECT_DIR/.specify/scripts/ts && bun src/commands/util/check-prerequisites.ts {task_id} --json
```

Parse JSON output. Then:

- **plan.md REQUIRED**: If `availableDocs` does not include `plan.md` → ERROR:
  ```
  ❌ plan.md not found for {task_id}
  Run /tdk-plan {task_id} first to generate the implementation plan.
  ```
  STOP.


### Step 2: Status Preflight

Run the same read-only status collector used by `/tdk-status` before reading phase files or mutating statuses:

```bash
cd $CLAUDE_PROJECT_DIR/.specify/scripts/ts && bun src/commands/feature/status.ts {TASK_ID}
```

Parse JSON output. If `error` or `phasesParseError` exists → report the exact message and STOP.

Use structured fields only. Do NOT invoke `/tdk-status` and do NOT parse formatted status output or recommendation prose.

Store:
- `feature_status`
- `phases.total`, `phases.done`, `phases.skipped`, `phases.inProgress`, `phases.todo`, `phases.blocked`, `phases.percent`
- `phases.currentPhase` — first `in_progress` phase file, or empty string
- `phases.nextPhase` — first `todo` phase file, or empty string
- `phases.rows[]`

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

### Step 3: Parse Phases Table

Parse phases table:
```bash
cd $CLAUDE_PROJECT_DIR/.specify/scripts/ts && bun src/commands/util/parse-phases-table.ts "{FEATURE_DIR}/plan.md" --json
```

Parse JSON output. If exit code 1 → report errors → STOP.

JSON shape: `{ "phases": [{ "number": 1, "file": "phase-01-x.md", "fileLabel": "...", "status": "todo", "blocks": [], "blockedBy": [], "rowLineNumber": 11 }], "errors": [] }`

Phase frontmatter sync CLI (call before plan.md write at every status transition):
```bash
cd $CLAUDE_PROJECT_DIR/.specify/scripts/ts && bun src/commands/util/update-phase-frontmatter-status.ts "{phasePath}" {status}
```

Update phase status in plan.md table:
```bash
cd $CLAUDE_PROJECT_DIR/.specify/scripts/ts && bun src/commands/util/update-phase-status.ts "{FEATURE_DIR}/plan.md" {phaseNumber} {status}
```

- If `## Phases` section is missing → ERROR: `"plan.md has no ## Phases table section. Regenerate with /tdk-plan."` → STOP.
- If `result.errors` is non-empty → report parse errors → STOP.
- Store `rows = result.phases` (sorted ascending by `row.number`).

### Step 4: F3 Recovery Gate — Stale in_progress Detection

Before entering the main execution loop, scan all rows:

```
for each row in rows:
  if row.status === 'in_progress':
    EMIT: "Phase NN currently in_progress. Likely previous run interrupted."
    ask explicit recovery action before any mutation
```

Where `NN` = `row.number` (zero-padded two digits, e.g. `01`, `02`).

Use **AskUserQuestion**:
```json
{
  "questions": [{
    "question": "Phase NN is already in_progress. How should implementation recover?",
    "header": "Recover Phase NN",
    "options": [
      {"label": "Retry this phase", "description": "Set phase NN back to todo, then continue"},
      {"label": "Mark done", "description": "Set phase NN done, then continue to next todo"},
      {"label": "Mark skipped", "description": "Set phase NN skipped, then continue"},
      {"label": "Cancel", "description": "Stop without changing status"}
    ],
    "multiSelect": false
  }]
}
```

Recovery writes MUST use the same order as normal status transitions:

Set `phasePath = join(FEATURE_DIR, row.file)` for the selected row, then:

1. `update-phase-frontmatter-status.ts "{phasePath}" {todo|done|skipped}`
2. `update-phase-status.ts "{FEATURE_DIR}/plan.md" {row.number} {todo|done|skipped}`

If user selects cancel → STOP. After any recovery write, re-run `parse-phases-table.ts` and restart this scan before proceeding.

On phase-work failure during execution (Step 6), before exiting emit:
```
"Phase NN left in_progress. Recover as described above."
```

### Step 5: Confirm Before Executing

Display compact preflight summary plus phase list from parsed rows. Do not read phase files before this confirmation.

```
📋 Implementation Plan: {task_id}
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
Status: {feature_status}
Progress: {done}/{total - skipped} ({percent}%)
Current: {currentPhase || "none"}
Next: {nextPhase || "none"}

Phases to execute (from plan.md ## Phases table):
  {#}. {phase file label} [{status}]
  ...
```

Use **AskUserQuestion**:
```json
{
  "questions": [{
    "question": "Proceed with implementation?",
    "header": "Confirm Execution",
    "options": [
      {"label": "Yes, execute all phases", "description": "Proceed phase by phase in row order"},
      {"label": "No, cancel", "description": "Stop without changes"}
    ],
    "multiSelect": false
  }]
}
```

If user cancels → STOP.

### Step 6: Execute Phases — Row Order

Execution pseudo-code (ascending `row.number`):

```
1. Run `parse-phases-table.ts "{FEATURE_DIR}/plan.md" --json` → parse phases array from JSON output
2. If exit code 1 → report errors → STOP
3. PRE-LOOP: scan rows for any in_progress → run F3 recovery gate, reparse, and restart scan
4. For each row ascending # order:
   phasePath = join(FEATURE_DIR, row.file)
   a. Status === 'skipped' → continue (bypass silently)
   b. Status === 'done' → continue (already complete)
   c. Status !== 'todo' → continue unless F3 gate already handled it
   d. BlockedBy check: ∀id ∈ row.blockedBy, rows[id].status ∈ {'done', 'skipped'} else abort
      Error message: "phase NN blocked by MM which is status='X' — run phase MM first or mark phase NN skipped"
      (F14: skipped blocker satisfies dependency — no friction)
   e. Run: `bun src/commands/util/update-phase-frontmatter-status.ts "{phasePath}" in_progress` → phase file FIRST
      Run: `bun src/commands/util/update-phase-status.ts "{FEATURE_DIR}/plan.md" {row.number} in_progress` → plan.md SECOND
   f. Execute phase (per phase-NN-*.md instructions)
   g. Run: `bun src/commands/util/update-phase-frontmatter-status.ts "{phasePath}" done` → phase file FIRST
      Run: `bun src/commands/util/update-phase-status.ts "{FEATURE_DIR}/plan.md" {row.number} done` → plan.md SECOND
```

For each phase:

1. Read the phase file referenced in `row.file` (relative to `FEATURE_DIR`).
2. If the phase file contains `## Delegate Skills`, execute those delegates first (see 5A).
3. If the phase appears to be a unit-test phase but has no usable `## Delegate Skills`, STOP with the unit-test guard message in 5A.
4. Otherwise execute as a generic implementation phase (see 5C).
5. Log: `"✓ Phase {N}: {name} — complete"`

---

#### 5A. Delegate Skills Phase — Auto-continue

If the phase file contains a `## Delegate Skills` section, execute it before generic implementation.

**Parsing rules:**
1. Find heading `^## Delegate Skills$`.
2. Read bullet lines until the next `^## ` heading or EOF.
3. For each bullet, extract the first backticked slash-prefixed token, e.g. `` `/my-test-skill` ``.
4. If no backticked token exists, extract the first raw slash-prefixed token, e.g. `/my-test-skill`.
5. Ignore placeholder bullets containing `{`, `}`, `your-`, or `(default`.
6. Preserve bullet order and deduplicate exact skill names.

**Execution context for each delegate:**

```
/{skill-name} {TASK_ID}

Context:
- FEATURE_DIR: {FEATURE_DIR}
- phasePath: {phasePath}
- phaseNumber: {row.number}
- phaseFile: {row.file}
- phaseTitle: {row.fileLabel}
- subWorkspace: {detected from PROJECT_CONTEXT if unambiguous, otherwise empty}
```

**Required behavior:**
- Run delegates in the order listed.
- Do not invent, auto-discover, or replace missing delegate skills.
- If a listed skill is unavailable, STOP with:
  ```
  Delegate skill not found: /{skill-name}
  Phase NN left in_progress. Add/fix the skill in plan-skill-routing.md or edit this phase's ## Delegate Skills, then rerun /tdk-implement {TASK_ID}.
  ```
- If a delegate fails, STOP and report the delegate's error. Leave the phase `in_progress` and emit the normal F3 recovery reminder.
- If every delegate completes, validate the phase success criteria if present, then mark the phase done.

**Unit-test guard:** If the phase appears to be a unit-test phase but has no usable `## Delegate Skills`, do not write tests inline. STOP with:
```
Unit-test phase has no delegate skill. Run /tdk-ut-backfill-plan {TASK_ID} after adding a test entry to plan-skill-routing.md, or add ## Delegate Skills manually.
```

---

#### 5C. Implementation Phase — Auto-continue (no confirmation gate)

**CRITICAL: You MUST actually implement the code — not just read and summarize the plan.**

For each implementation phase:

1. **Read the phase file** referenced in `row.file` (relative to `FEATURE_DIR`)
2. **Implement every step** described in the phase:
   - Create/modify files as specified
   - Write actual production code (no mocks, no placeholders, no TODOs)
   - Follow project rules loaded in Step 0.1
3. **After each file change**, run compile/lint check to verify no errors
4. **Validate against Success Criteria** listed in the phase (if any)
5. **Mark phase done**: run `bun src/commands/util/update-phase-frontmatter-status.ts "{phasePath}" done` THEN `bun src/commands/util/update-phase-status.ts "{FEATURE_DIR}/plan.md" {row.number} done`
6. Log progress: `"✓ Phase {N}: {name} — complete"`

**DO NOT** just read the plan and report what it says — you must **write code, edit files, and produce working implementation**.

### Step 7: Completion Summary

After all phases:

```
✅ Implementation complete: {task_id}
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
Phases executed: {N}
Phases skipped: {skipped_count}

Next steps:
→ /tdk-status {task_id}   — check artifact status
```
