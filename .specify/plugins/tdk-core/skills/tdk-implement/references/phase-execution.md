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
   d1. Run `(cd "$PROJECT_DIR/.specify/scripts/ts" && bun src/commands/util/validate-phase-file.ts "{phasePath}" --plan "{FEATURE_DIR}/plan.md" --phase-number {row.number} --json)`.
      Validation failure STOPs before status mutation.
   e0. Run routing preflight from 7A. If it cancels, STOP before status mutation.
   e. Run: `(cd "$PROJECT_DIR/.specify/scripts/ts" && bun src/commands/util/update-phase-frontmatter-status.ts "{phasePath}" in_progress)` -> phase file FIRST
      Run: `(cd "$PROJECT_DIR/.specify/scripts/ts" && bun src/commands/util/update-phase-status.ts "{FEATURE_DIR}/plan.md" {row.number} in_progress)` -> plan.md SECOND
   f. Execute phase per phase-NN-*.md instructions
   g. For normal phases, run: `(cd "$PROJECT_DIR/.specify/scripts/ts" && bun src/commands/util/update-phase-frontmatter-status.ts "{phasePath}" done)` -> phase file FIRST
      Run: `(cd "$PROJECT_DIR/.specify/scripts/ts" && bun src/commands/util/update-phase-status.ts "{FEATURE_DIR}/plan.md" {row.number} done)` -> plan.md SECOND
      Spike phases follow `## Spike Phase Execution` instead.
```

This is the default/selected serial path. Parallel mode also lands here: every phase the checker reports in
`conflicts` or `rejected`, plus every `parallel_safe: never`, legacy, or spike phase, runs through this same
behavior synchronously, one phase at a time. The only difference is the status write — a phase deferred from
a parallel wave writes both surfaces with a single `transition-phase-status` call per transition, as defined
in `parallel-phase-orchestration.md`, instead of the two legacy status CLIs above. Nothing is retained
between phases and no ownership is asserted; each phase runs, then writes its status, then the next begins.

For each phase:

1. Read the phase file referenced in `row.file` relative to `FEATURE_DIR`.
2. If the phase file contains `## Delegate Skills`, execute those delegates first.
3. If the phase appears to be a unit-test phase but has no usable `## Delegate Skills`, STOP with the unit-test guard message below.
4. If the phase is TDD/backfill-shaped, validate `## Test Quality Gate` after delegates and before any phase `done` write.
5. If validation returns `phaseType: spike`, follow `## Spike Phase Execution`.
6. Otherwise execute as a generic implementation phase.
7. Log: `"✓ Phase {N}: {name} — complete"`

## Spike Phase Execution

A spike is an executable exception, not a research-note phase.

1. Run the phase's reproducible `## Experiment`, obeying the same destructive,
   network-install, and secrets safety boundary as Test Quality Gate commands.
2. Produce every `## Deliverables` item and replace the heading-bounded
   `## Spike Result` body with:

   ```markdown
   | Field | Value |
   |---|---|
   | Status | proposed |
   | Decision | approve or replan |
   | Evidence | concise paths, commands, and observed results |
   | Recommendation | one concrete recommendation |
   ```
3. Run `validate-phase-file.ts` again with `--require-result`. Failure leaves
   the spike `in_progress` and STOPs.
4. AskUserQuestion with `Approve result`, `Replan`, and `Cancel`:
   - Approve: run `resolve-spike-decision.ts "{FEATURE_DIR}/plan.md"
     --phase-number {row.number} --decision approve --json`. Change result
     `Status` to `approved`. Change only phase numbers returned in `unblock`
     from `blocked` to `todo`, updating each dependent's phase frontmatter
     first and plan table second. Keep `remainBlocked` unchanged and reparse
     `plan.md` after each update. Only after every returned dependent is
     reflected in both files, mark the spike `done` using phase frontmatter
     first and plan table second. This keeps the spike `in_progress` as an F3
     recovery anchor until the multi-file transition is complete; retrying the
     same approved transition is idempotent because the helper reports prior
     `todo` transitions in `alreadyUnblocked`. Refresh `phaseByNumber` and
     remaining `TARGET_ROWS` before continuing.
   - Replan: run the same helper with `--decision replan`; it must return no
     unblocks. Change result `Status` to `replan-required`, mark the spike
     `blocked`, leave every dependent blocked, STOP, and recommend
     `/tdk-plan {TASK_ID}` to update the graph from recorded evidence.
   - Cancel: leave the spike `in_progress` and every dependent blocked.

Never mark a spike done from delegate completion, generic success criteria, or
F3 recovery. Never unblock a dependent from an unapproved result. A replan may
unblock or replace dependents only by rewriting and revalidating the phase graph.

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
- If every delegate completes for a non-test-mode phase, validate the phase success criteria if present, then mark the phase done.
- Delegate completion alone cannot mark a TDD or backfill phase done. Test-mode phases must continue through `## Test Quality Gate` enforcement first.

Unit-test guard: if the phase appears to be a unit-test phase but has no usable `## Delegate Skills`, do not write tests inline. STOP with:

```text
Unit-test phase has no delegate skill. Add a test entry to plan-skill-routing.md, then rerun /tdk-plan <TASK_ID> --ut-backfill or edit ## Delegate Skills manually.
```

## Test Quality Gate Enforcement

Apply this section to every TDD/backfill-shaped phase before marking the phase
done.

Old-shape TDD/backfill phase missing `## Test Quality Gate`:

```text
Old-shape TDD/backfill phase missing `## Test Quality Gate`. Phase NN left in_progress. Rerun `/tdk-plan` with the same test-mode flag or manually add `## Test Quality Gate` before rerunning `/tdk-implement`.
```

If repairing by regeneration, rerun `/tdk-plan` with the same test-mode flag.
If repairing manually, manually add `## Test Quality Gate` before rerunning
`/tdk-implement`. do not fall through to delegate completion or generic done
when this STOP condition is hit.

Run every safe runnable `Command` in `## Test Quality Gate`. A gate row can pass only when structural target evidence is satisfied and any runnable command exits 0. Do not parse coverage percentages; TDK core validates the declared command/status/evidence contract, not coverage math.

Safe command boundary:
- A runnable command must come from the committed phase file, delegate output,
  or committed project docs and run from an explicit project-relative cwd.
- STOP before execution on an unsafe command: destructive command,
  network-installing command, secrets-exposing command, shell metacharacters,
  pipes, redirection, or control operators without explicit project
  documentation or user approval.
- A non-applicable row must use `Command: -` and `Status: N/A: <reason>`.
- Bare `Command: N/A` is invalid.

Block phase completion and leave the phase `in_progress` with the F3 recovery
reminder when any required gate row is `pending` or `fail`, a command exits
non-zero, an unsafe command appears, there is missing structural evidence, a
required command is missing, invalid N/A encoding is present, or a row claims
`pass` without evidence.

Structural evidence checks:
- TDD ID reuse: every `## Tests Before` ID appears in `## Tests After`.
- TDD rubric dimensions by test ID or `N/A: <reason>`: Happy, EP, BVA,
  Branch, Error, Deps, State, and Regression are covered or explicitly
  non-applicable.
- backfill matrix rows: every non-N/A `## Test Matrix` row has `Impl` evidence.
- branch traceability: every non-trivial branch maps to a row or
  `N/A: <reason>`.
- dependency traceability: every listed dependency maps to a row or
  `N/A: <reason>`.

## TDD Phase Execution

**Detect TDD markers:** a phase is TDD-shaped when its file contains all five headings `## Tests Before`, `## Refactor / Implementation`, `## Tests After`, `## Test Quality Gate`, `## Regression Gate` (written by `/tdk-plan <TASK_ID> --tdd`, see `plan-output-contract.md` Test Mode Sections). If the phase has the old four-heading shape without `## Test Quality Gate`, STOP with the old-shape message above.

For a TDD-shaped phase:

1. Run the routed `test` delegate from `## Delegate Skills` first, covering the `## Tests Before` step (tests capturing current behavior).
2. If no usable `test` delegate exists, STOP with the unit-test guard message above — do not write tests inline.
3. After the test delegate completes, continue to the routed implementation delegate (if listed after the `test` skill in `## Delegate Skills`) or generic implementation, covering `## Refactor / Implementation`.
4. Re-run the `## Tests After` step (re-run `## Tests Before` tests, plus any new tests for new behavior).
5. Run and validate `## Test Quality Gate`.
6. Run the `## Regression Gate` command(s); all must pass.
7. **Test delegate success alone never marks a TDD phase done.** Mark done only after steps 3–6 all complete successfully.

If the implementation step or regression gate fails, leave the phase `in_progress`, report the failure, and emit the F3 recovery reminder — do not mark done on partial completion.

## UT Backfill Phase Execution

**Detect UT backfill markers:** a phase is backfill-shaped when its file contains all four headings `## Code Summary`, `## Mocks & Fixtures Required`, `## Test Matrix`, and `## Test Quality Gate` (written by `/tdk-plan <TASK_ID> --ut-backfill`, see `plan-output-contract.md` Test Mode Sections). If the phase has the old three-heading shape without `## Test Quality Gate`, STOP with the old-shape message above.

For a backfill-shaped phase:

1. Run the routed `test` delegate from `## Delegate Skills` first. If no usable `test` delegate exists, STOP with the unit-test guard message above — do not write tests inline.
2. The test delegate must implement each non-N/A `## Test Matrix` row or explicitly defer it with `N/A: <reason>` in the row.
3. Before marking the phase done, verify every non-N/A `## Test Matrix` row has the `Impl` column filled with a test file path, test name, or stable test identifier.
4. Run and validate `## Test Quality Gate`.
5. Run the phase's test command(s) from `## Success Criteria`, `## Next Steps`, or delegate output; all must pass.
6. If any required matrix row lacks `Impl`, any test command fails, any quality gate row blocks, or the delegate cannot map a row to code, leave the phase `in_progress`, report the missing ID(s), and emit the F3 recovery reminder — do not mark the phase done.

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
