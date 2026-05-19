# Handle Existing Plan (Step 1.5)

**Trigger:** only when `planExists == "true"` from `setup-plan.ts`. Skip entirely if `planExists == "false"` (proceed to Step 2 in **NEW mode**).

## Branch B (re-run) — prompt user 2 options

Use **AskUserQuestion** tool:

```json
{
  "questions": [{
    "question": "A plan already exists at {implPlan}. How would you like to proceed?",
    "header": "Existing Plan",
    "options": [
      {
        "label": "(a) Rewrite — regenerate plan.md + all phase files from spec",
        "description": "Overwrites plan.md and all phases/phase-NN-*.md files. DANGEROUS if you have uncommitted edits."
      },
      {
        "label": "(b) Append phase — add a new phase to the existing plan",
        "description": "Prompts for phase description, generates a new phases/phase-NN-{slug}.md, appends a row to the Phases table."
      },
      {
        "label": "Abort",
        "description": "Stop now, make no changes."
      }
    ],
    "multiSelect": false
  }]
}
```

## Option (a) Rewrite

### F13 Soft Dirty Guard — run before any destructive action

1. Run: `git diff --name-only | grep -E '(plan\.md|phases/phase-.*\.md)'`.
2. If the command returns any lines (dirty files detected):
   - Prompt the user: `"Uncommitted changes detected in: {list of dirty files}. Option (a) rewrite will DISCARD these edits. Proceed? [y/N]"`.
   - Default = `N` (abort). Only an explicit `y` response proceeds.
   - If `N` or empty → output: `Aborted. Uncommitted changes preserved.` → **STOP**.
3. If clean (no dirty plan/phase files) → show standard confirm: `"Rewrite plan.md and all phases/phase-NN-*.md? This cannot be undone. [y/N]"` → default `N`, explicit `y` proceeds.

**Scope lock:** rewrite targets `plan.md` + `phases/phase-NN-*.md` files **ONLY**. Do NOT touch `research.md`, `data-model.md`, `contracts/`, or any other files.

**On proceed:** re-run `cd $CLAUDE_PROJECT_DIR/.specify/scripts/ts && bun src/commands/util/setup-plan.ts {task_id} --force --json` from repo root, then continue to Step 2 with **REGENERATE mode** (fresh template).

## Option (b) Append Phase

### Interactive append flow

1. Prompt user: `"Describe the phase to append (e.g., 'Add OAuth2 login flow'):"`.
2. **F4 Extended AI Context** — generate phase content with the following context items:
   - User description (from step 1 above).
   - Full contents of `spec.md` for this feature.
   - Current `## Phases` table from `plan.md`.
   - First H1 heading + first paragraph of each existing `phase-NN-*.md` (prevents semantic duplicates).
3. **Compute phase number:**
   - Read all existing `phase-NN-*.md` files in the `phases/` subdir.
   - Extract phase numbers from filenames (e.g., `phases/phase-03-foo.md` → 3).
   - `N = max(existing_phase_numbers) + 1`. Format: `String(N).padStart(2, '0')` (e.g., 3 → `03`, 10 → `10`).
   - If no existing phases: `N = 1`, formatted as `01`.
4. **F19 Lowercase Enforcement:**
   - Convert phase name to slug: `phaseName.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '')`.
   - Slug MUST be all-lowercase. Reject any user input that would produce uppercase characters in the filename path.
   - File path: `phases/phase-${NN}-${slug}.md` (all lowercase, no exceptions).
5. **Collision check:** if `phases/phase-${NN}-${slug}.md` already exists → **error + abort** (do NOT overwrite).
   - Output: `Error: phases/phase-${NN}-${slug}.md already exists. Aborting to prevent data loss.`
6. **Write phase file** using the phase-file-content template (below).
7. **Append ONLY a table row** to `## Phases` in `plan.md` with defaults:
   - `Status = todo`, `Blocks = —`, `BlockedBy = —`.
   - File column: `[phase-${NN}-${slug}](phases/phase-${NN}-${slug}.md)` (lowercase path).

   Before writing, snapshot current `plan.md` content into memory (`planMdBefore`) — Step 8 validator may roll back.

   **PROHIBITED:** Do NOT add any prose, narrative, or description anywhere in `plan.md`. All phase context belongs exclusively in the phase file's `## Overview` section. Step 8 validator will reject violations and restore the snapshot.
8. **Validate no prose injected** — run:
   `cd $CLAUDE_PROJECT_DIR/.specify/scripts/ts && bun src/commands/util/plan-prose-validator.ts <plan-md-path> --json`
   Parse JSON output.
   - If `ok === false`:
     - Restore `plan.md` from the Step 7 snapshot (write `planMdBefore` back to disk).
     - Keep `phases/phase-${NN}-${slug}.md` (no data loss on the phase file).
     - Output violations to user (section, line, snippet for each).
     - **ABORT** the append.
   - If `ok === true`: continue to Step 9.
9. **Run `validateDependencies`** (from `phases-table-parser.ts`) against the updated table.
   - If errors → report to user and abort the append (row + file already written — user must manually clean up).

## Abort

Output: `Aborted. No changes made.` → **STOP**.

---

## Phase File Content Template

Used by Branch A new-spec generation and Branch B append.

```markdown
# Phase NN: {Phase Name}

**Status:** todo
**Depends on:** —
**Blocks:** —

## Overview

[Brief description of this phase's purpose and deliverables.]

## Requirements

- [ ] [Requirement 1]
- [ ] [Requirement 2]

## Implementation Steps

1. [Step 1]
2. [Step 2]

## Acceptance Criteria (AC)

- [ ] [AC 1]
- [ ] [AC 2]
```
