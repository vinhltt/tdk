---
name: tdk-implement-from-plan
description: "Primary implementation skill. Execute phases from plan.md ## Phases table. Read plan.md as source of truth for status + dependency graph."
metadata: 
  version: "3.0.0"
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
- **F3 crash recovery**: detects stale `in_progress` rows at startup and aborts with recovery instructions

---

## Outline

### Step 0 — Validate Task ID
Invoke `tdk-validate-task-id` with `$ARGUMENTS` and host skill name `/tdk-implement-from-plan`.
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


### Step 2: Parse Phases Table

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

### Step 3: F3 Pre-scan — Stale in_progress Detection

Before entering the main execution loop, scan all rows:

```
for each row in rows:
  if row.status === 'in_progress':
    EMIT: "Phase NN currently in_progress. Either (a) resume by marking status='todo' to retry, (b) mark status='done' if manually completed, or (c) mark status='skipped' to bypass. Then re-run."
    EXIT non-zero — do NOT continue execution
```

Where `NN` = `row.number` (zero-padded two digits, e.g. `01`, `02`).

If any stale `in_progress` row is found → abort with the message above. Do NOT proceed to Step 4.

On phase-work failure during execution (Step 4), before exiting emit:
```
"Phase NN left in_progress. Recover as described above."
```

### Step 4: Confirm Before Executing

Display phase list and ask user to confirm:

```
📋 Implementation Plan: {task_id}
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
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

### Step 5: Execute Phases — Row Order

Execution pseudo-code (ascending `row.number`):

```
1. Run `parse-phases-table.ts "{FEATURE_DIR}/plan.md" --json` → parse phases array from JSON output
2. If exit code 1 → report errors → STOP
3. PRE-LOOP: scan rows for any in_progress → emit F3 recovery warning + abort non-zero (stale detection)
4. For each row ascending # order:
   phasePath = join(FEATURE_DIR, row.file)
   a. Status === 'skipped' → continue (bypass silently)
   b. BlockedBy check: ∀id ∈ row.blockedBy, rows[id].status ∈ {'done', 'skipped'} else abort
      Error message: "phase NN blocked by MM which is status='X' — run phase MM first or mark phase NN skipped"
      (F14: skipped blocker satisfies dependency — no friction)
   c. Run: `bun src/commands/util/update-phase-frontmatter-status.ts "{phasePath}" in_progress` → phase file FIRST
      Run: `bun src/commands/util/update-phase-status.ts "{FEATURE_DIR}/plan.md" {row.number} in_progress` → plan.md SECOND
   d. Execute phase (per phase-NN-*.md instructions)
   e. Run: `bun src/commands/util/update-phase-frontmatter-status.ts "{phasePath}" done` → phase file FIRST
      Run: `bun src/commands/util/update-phase-status.ts "{FEATURE_DIR}/plan.md" {row.number} done` → plan.md SECOND
```

For each phase:

1. Determine phase type: **UT phase** or **Implementation phase** (see 5A / 5B below)
2. Execute accordingly
3. Log: `"✓ Phase {N}: {name} — complete"`

---

#### 5A. Phase Classification

Check if phase name contains any of these keywords (case-insensitive):
`test`, `testing`, `unit test`, `UT`, `spec`
OR phase description contains `Delegate to:` + `/tdk-ut-backfill-plan` or `/tdk-ut-backfill-auto` or `/tdk-ut-backfill-impl`

- **Match → UT phase** (go to 5B)
- **No match → Implementation phase** (go to 5C)

---

#### 5B. UT Phase — MANDATORY PAUSE (NEVER write tests inline)

⛔ **NEVER write unit tests yourself.** MUST delegate to `/tdk-ut-backfill-impl` or `/tdk-ut-backfill-auto`.
Writing tests inline defeats the purpose of structured test generation (plan → generate → execute).

**Before delegating:**

1. **Auto-detect sub-workspace** from `PROJECT_CONTEXT` (loaded in Step 0.1 via `tdk-load-project-context`):
   - Use `PROJECT_CONTEXT.subWorkspaces` list (name + path) — already parsed from `.specify.json`
   - If `PROJECT_CONTEXT.targetSubWorkspace` is set → use it directly
   - Otherwise, analyze phase content for file paths → match against sub-workspace paths
   - If ALL paths map to 1 sub-workspace → auto-resolve: `--sub-workspace {name}`
   - If ambiguous (paths span multiple sub-workspaces) → include sub-workspace choice in AskUserQuestion
   - If no sub-workspaces configured → omit `--sub-workspace` flag
2. **Check if `{FEATURE_DIR}/ut-plan.md` exists**

**Always** display and use **AskUserQuestion**:

```
⏸️  Phase {N}: {name} — Unit Test phase detected
   Sub-workspace: {auto-detected or "ambiguous"}
   UT Plan: {exists / missing}
```

**If ut-plan.md EXISTS:**
```json
{
  "questions": [{
    "question": "How do you want to handle this test phase?",
    "header": "Phase {N}: {name}",
    "options": [
      {"label": "Delegate to /tdk-ut-backfill-impl", "description": "UT plan exists — generate test code + run (recommended)"},
      {"label": "Delegate to /tdk-ut-backfill-auto", "description": "Full re-plan + generate + run"},
      {"label": "Manual test first", "description": "I will run tests manually, then report back"},
      {"label": "Skip this phase", "description": "Skip testing and continue to next phase"}
    ],
    "multiSelect": false
  }]
}
```

**If ut-plan.md MISSING:**
```json
{
  "questions": [{
    "question": "How do you want to handle this test phase?",
    "header": "Phase {N}: {name}",
    "options": [
      {"label": "Delegate to /tdk-ut-backfill-auto", "description": "Full workflow: plan → generate → run (recommended)"},
      {"label": "Manual test first", "description": "I will run tests manually, then report back"},
      {"label": "Skip this phase", "description": "Skip testing and continue to next phase"}
    ],
    "multiSelect": false
  }]
}
```

- **Delegate /tdk-ut-backfill-impl**: Invoke `/tdk-ut-backfill-impl {task_id} --sub-workspace {detected}` → wait → mark phase done: run `bun src/commands/util/update-phase-frontmatter-status.ts "{phasePath}" done` THEN `bun src/commands/util/update-phase-status.ts "{FEATURE_DIR}/plan.md" {row.number} done` → continue
- **Delegate /tdk-ut-backfill-auto**: Invoke `/tdk-ut-backfill-auto {task_id} --sub-workspace {detected}` → wait → mark phase done: run `bun src/commands/util/update-phase-frontmatter-status.ts "{phasePath}" done` THEN `bun src/commands/util/update-phase-status.ts "{FEATURE_DIR}/plan.md" {row.number} done` → continue
- **Manual**: STOP and wait for user to report back before continuing
- **Skip**: Log `"⏭️  Phase {N} skipped by user"` → run `bun src/commands/util/update-phase-frontmatter-status.ts "{phasePath}" skipped` THEN `bun src/commands/util/update-phase-status.ts "{FEATURE_DIR}/plan.md" {row.number} skipped` → continue

**If downstream skill reports sub-workspace mismatch** → AskUserQuestion to correct.

**Reminder:** This AskUserQuestion is NOT optional — even if user said "Yes, execute all phases" in Step 4, you MUST still pause here and ask.

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

### Step 6: Completion Summary

After all phases:

```
✅ Implementation complete: {task_id}
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
Phases executed: {N}
Phases skipped: {skipped_count}

Next steps:
→ /tdk-status {task_id}   — check artifact status
```
