# Phase Execution

Use this reference for `/tdk-implement` Step 7 and Step 8.

## Row-Order Execution

Execution pseudo-code, ascending `row.number`:

```text
1. Run `parse-phases-table.ts "{FEATURE_DIR}/plan.md" --json` -> parse phases array from JSON output
2. If exit code 1 -> report errors -> STOP
3. PRE-LOOP: scan rows for any in_progress -> run F3 recovery gate, reparse, and restart scan
4. Build `phaseByNumber = new Map(rows.map(row => [row.number, row]))`
5. Resolve `TARGET_ROWS = PHASE_FILTER_PRESENT ? rows.filter(row => row.number === PHASE_FILTER) : rows`
6. If selected mode has no runnable row -> report why and STOP without mutation
7. For each row in TARGET_ROWS ascending # order:
   phasePath = join(FEATURE_DIR, row.file)
   a. Status === 'skipped' -> continue (bypass silently)
   b. Status === 'done' -> continue (already complete)
   c. Status !== 'todo' -> continue unless F3 gate already handled it
   d. BlockedBy check: for each id in row.blockedBy, phaseByNumber.get(id)?.status must be done or skipped
      Error: "phase NN blocked by MM which is status='X' — run phase MM first or mark phase NN skipped"
      skipped blocker satisfies dependency
   e0. Run routing preflight from 7A. If it cancels, STOP before status mutation.
   e. Run: `(cd "$PROJECT_DIR/.specify/scripts/ts" && bun src/commands/util/update-phase-frontmatter-status.ts "{phasePath}" in_progress)` -> phase file FIRST
      Run: `(cd "$PROJECT_DIR/.specify/scripts/ts" && bun src/commands/util/update-phase-status.ts "{FEATURE_DIR}/plan.md" {row.number} in_progress)` -> plan.md SECOND
   f. Execute phase per phase-NN-*.md instructions
   g. Run: `(cd "$PROJECT_DIR/.specify/scripts/ts" && bun src/commands/util/update-phase-frontmatter-status.ts "{phasePath}" done)` -> phase file FIRST
      Run: `(cd "$PROJECT_DIR/.specify/scripts/ts" && bun src/commands/util/update-phase-status.ts "{FEATURE_DIR}/plan.md" {row.number} done)` -> plan.md SECOND
```

For each phase:

1. Read the phase file referenced in `row.file` relative to `FEATURE_DIR`.
2. If the phase file contains `## Delegate Skills`, execute those delegates first.
3. If the phase appears to be a unit-test phase but has no usable `## Delegate Skills`, STOP with the unit-test guard message below.
4. Otherwise execute as a generic implementation phase.
5. Log: `"✓ Phase {N}: {name} — complete"`

## Delegate Skills Phase - Auto-continue

If the phase file contains a `## Delegate Skills` section, execute it before generic implementation.

Parsing rules:

1. Find heading `^## Delegate Skills$`.
2. Read bullet lines until the next `^## ` heading or EOF.
3. For each bullet, extract the first backticked slash-prefixed token, e.g. `` `/my-test-skill` ``.
4. If no backticked token exists, extract the first raw slash-prefixed token, e.g. `/my-test-skill`.
5. Ignore placeholder bullets containing `{`, `}`, `your-`, or `(default`.
6. Preserve bullet order and deduplicate exact skill names.

Execution context for each delegate:

```text
/{skill-name} {TASK_ID}

Context:
- FEATURE_DIR: {FEATURE_DIR}
- phasePath: {phasePath}
- phaseNumber: {row.number}
- phaseFile: {row.file}
- phaseTitle: {row.fileLabel}
- subWorkspace: {detected from PROJECT_CONTEXT if unambiguous, otherwise empty}
```

Required behavior:
- Run delegates in listed order.
- Do not invent, auto-discover, or replace missing delegate skills.
- If a listed skill is unavailable, STOP with:

```text
Delegate skill not found: /{skill-name}
Phase NN left in_progress. Add/fix the skill in plan-skill-routing.md or edit this phase's ## Delegate Skills, then rerun /tdk-implement {TASK_ID}.
```

- If a delegate fails, STOP and report the delegate's error. Leave the phase `in_progress` and emit the F3 recovery reminder.
- If every delegate completes, validate the phase success criteria if present, then mark the phase done.

Unit-test guard: if the phase appears to be a unit-test phase but has no usable `## Delegate Skills`, do not write tests inline. STOP with:

```text
Unit-test phase has no delegate skill. Add a test entry to plan-skill-routing.md, then rerun /tdk-plan <TASK_ID> --ut-backfill or edit ## Delegate Skills manually.
```

## TDD Phase Execution

**Detect TDD markers:** a phase is TDD-shaped when its file contains all four headings `## Tests Before`, `## Refactor / Implementation`, `## Tests After`, `## Regression Gate` (written by `/tdk-plan <TASK_ID> --tdd`, see `plan-output-contract.md` Test Mode Sections).

For a TDD-shaped phase:

1. Run the routed `test` delegate from `## Delegate Skills` first, covering the `## Tests Before` step (tests capturing current behavior).
2. If no usable `test` delegate exists, STOP with the unit-test guard message above — do not write tests inline.
3. After the test delegate completes, continue to the routed implementation delegate (if listed after the `test` skill in `## Delegate Skills`) or generic implementation, covering `## Refactor / Implementation`.
4. Re-run the `## Tests After` step (re-run `## Tests Before` tests, plus any new tests for new behavior).
5. Run the `## Regression Gate` command(s); all must pass.
6. **Test delegate success alone never marks a TDD phase done.** Mark done only after steps 3–5 all complete successfully.

If the implementation step or regression gate fails, leave the phase `in_progress`, report the failure, and emit the F3 recovery reminder — do not mark done on partial completion.

## UT Backfill Phase Execution

**Detect UT backfill markers:** a phase is backfill-shaped when its file contains all three headings `## Code Summary`, `## Mocks & Fixtures Required`, and `## Test Matrix` (written by `/tdk-plan <TASK_ID> --ut-backfill`, see `plan-output-contract.md` Test Mode Sections).

For a backfill-shaped phase:

1. Run the routed `test` delegate from `## Delegate Skills` first. If no usable `test` delegate exists, STOP with the unit-test guard message above — do not write tests inline.
2. The test delegate must implement each non-N/A `## Test Matrix` row or explicitly defer it with `N/A: <reason>` in the row.
3. Before marking the phase done, verify every non-N/A `## Test Matrix` row has the `Impl` column filled with a test file path, test name, or stable test identifier.
4. Run the phase's test command(s) from `## Success Criteria`, `## Next Steps`, or delegate output; all must pass.
5. If any required matrix row lacks `Impl`, any test command fails, or the delegate cannot map a row to code, leave the phase `in_progress`, report the missing ID(s), and emit the F3 recovery reminder — do not mark the phase done.

Backfill phases are test implementation work only. Do not create production source changes unless the phase explicitly states a testability seam is required and the change is covered by the phase success criteria.

## Generic Implementation Phase - Auto-continue

CRITICAL: You MUST actually implement the code - not just read and summarize the plan.

Before generic implementation:
- Read `./docs/code-standards.md or the project equivalent`.
- Scout adjacent file patterns and follow local imports, logging, and error style.
- Check existing helpers before creating utilities.
- Verify public or interface contracts remain compatible unless the phase explicitly changes them.
- Re-check phase requirements and Validate phase success criteria.

For each implementation phase:

1. Read the phase file referenced in `row.file` relative to `FEATURE_DIR`.
2. Implement every step described in the phase with actual production code; no mocks, placeholders, or TODOs.
3. After each file change, run compile/lint check to verify no errors.
4. Validate against Success Criteria listed in the phase, if any.
5. Mark phase done by running `(cd "$PROJECT_DIR/.specify/scripts/ts" && bun src/commands/util/update-phase-frontmatter-status.ts "{phasePath}" done)` then `(cd "$PROJECT_DIR/.specify/scripts/ts" && bun src/commands/util/update-phase-status.ts "{FEATURE_DIR}/plan.md" {row.number} done)`.
6. Log progress: `"✓ Phase {N}: {name} — complete"`

DO NOT just read the plan and report what it says - you must write code, edit files, and produce working implementation.

## Completion Summary

After all phases:

```text
✅ Implementation complete: {task_id}
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
Phases executed: {N}
Phases skipped: {skipped_count}

Next steps:
→ /tdk-status {task_id}   — check artifact status
```
