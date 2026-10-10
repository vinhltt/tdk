# Handle Existing Plan (Step 1.5)

**Trigger:** only when `planExists == "true"` from `setup-plan.ts`. Skip entirely if `planExists == "false"` (proceed to Step 2 in **NEW mode**).

For delegate-only changes, use `/tdk-plan <TASK_ID> --refresh-routing` instead of rewrite/append; that action branches immediately after project context, previews only eligible drifted `todo` phases, and refuses any `in_progress` phase. Append never refreshes existing phase delegates.

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

**Scope lock:** rewrite targets `plan.md` + `phases/phase-NN-*.md` files
**ONLY**. Do not touch conditional `research/`, `reports/`, `contracts/`, or any
legacy standalone artifact. Use `--migrate-artifacts` for explicit migration.

**On proceed:** confirm that the generation transaction's pre-mutation byte snapshots contain the prior `plan.md` and every phase to be overwritten/deleted, plus the existing-file inventory. Capture them before any destructive action, especially `setup-plan.ts --force`; STOP before writing if capture failed. Re-run
`(cd "$PROJECT_DIR/.specify/scripts/ts" && bun src/commands/util/setup-plan.ts {task_id} --force --json)`,
then continue to Step 2 with **REGENERATE mode**. Regenerate and classify every
rewritten phase; no rewritten phase receives the untouched-legacy metadata
exemption. Keep snapshots until Step 3d's resolver, readiness assessment, and ordered post-write gates finish. Any setup/write/resolver/validation failure restores the prior plan and overwritten/deleted phases byte-for-byte, removes only invocation-new files, preserves unrelated/pre-existing files, and STOPs with exact diagnostics. A static readiness failure alone retains structurally valid generated files for Step 4's NOT RUNNABLE report.
The rewrite transaction must retain `memory_gate`, `memory_gate_reason`,
`memory_gate_at`, `memory_gate_actor`, and the existing Memory Constraints
section before replacing any plan bytes. `setup-plan.ts --force` preserves them
atomically. Do not delete them while drafting or on an interrupted rewrite;
only a legitimate new Guardian outcome or live authorization may replace them.

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
6. **Resolve dependency intent before mutation:** Ask which existing earlier
   phases must complete before the appended phase. If intent is ambiguous, ask
   again or abort; never invent an edge. Normalize the answer to the same sorted,
   unique earlier-phase numbers for frontmatter `dependencies` and the new row's
   `BlockedBy` cell.
   - With no dependency, emit `dependencies: []` and `—` in both relation cells.
   - With dependencies, add the new phase number to each blocker's `Blocks` cell,
     keeping every cell sorted and unique. The appended row's `Blocks` is `—`.
7. **Classify and render before writing:** Apply the exact C-C3 matrix from
   `design-phase.md`. Populate one exact `## Related Code Files` section with
   concrete `Read`/`Modify`/`Create`/`Delete` entries, then render the template's
   dependency and parallel-safety placeholders. Uncertain eligibility emits
   `parallel_safe: never` with the first factual reason; never write an
   unclassified candidate.
8. **Apply one append:** Retain the pre-mutation `plan.md` byte snapshot and existing-file inventory before writing the phase, appending its row, or changing reciprocal `Blocks` cells. Draft the new phase without delegate sections and with matching provisional `todo` frontmatter/table status. Record its required final status before writing: a direct spike dependent must finish as `blocked`; otherwise default to `todo`. Write its file, append its row, and update only the reciprocal `Blocks` cells in `plan.md`.
   Preserve every existing phase file byte-for-byte, including its current delegates. Routing injection selects only the new phase; use `--refresh-routing` separately for stale old phases.
   The table row uses:
   - **VALID_STATUSES (enforced):** `todo | in_progress | done | skipped | blocked | cancelled`. Default for new phases = `todo`. NEVER use `not-started`, `pending`, `planned`, `new`, or any other value — the Step 3d status validator WILL reject it.
   - Draft `Status = todo` and the normalized `Blocks` / `BlockedBy` relations from Step 6. Finalize required `blocked` status after injection, before any validation/reporting; never reset an existing phase or publish the draft.
   - File column: `[phase-${NN}-${slug}](phases/phase-${NN}-${slug}.md)` (lowercase path).

   **PROHIBITED:** Do NOT add any prose, narrative, or description anywhere in `plan.md`. All phase context belongs exclusively in the phase file's `## Overview` section. The Step 3d prose validator will reject violations.
9. **Run Step 3d:** First run the selected new-phase resolver check/apply per `delegate-routing-injection.md`'s **Generation Routing Transaction**. Use the same explicit new-phase selector and digest for check/apply, passing `--allow-in-progress-plan` only because an older phase may already be active. Finalize the new phase's recorded status in both frontmatter and table (a spike dependent becomes `blocked`), then collect read-only Tier 1 readiness. The resolver still never mutates existing blocked phases. Then execute the four ordered post-write gates from
   `plan-output-contract.md`. Gate 3 validates only the appended phase; gate 4
   validates write disjointness across every `parallel_safe: auto` phase in the
   plan. Accept warnings for untouched legacy metadata only. Any invalid result,
   non-zero exit, malformed JSON, or runtime/I/O error restores the **whole prior `plan.md` bytes**, including every reciprocal `Blocks` cell, and restores any overwritten phase bytes; remove only invocation-new files, including the appended phase. This also rolls back partial resolver apply. Preserve unrelated/pre-existing files and STOP with exact diagnostics. Leave no orphan phase or table row; never auto-fix, repair, or downgrade rejected output. If only static readiness fails and all output gates pass, keep the append and report NOT RUNNABLE in Step 4.
10. **Run Step 3e:** Once Step 3d has succeeded, seed `git-map.md` exactly as the new-spec flow does.
    An appended phase can introduce a repository that appears in the plan for the first time, and
    without this that repository is never seeded — `/tdk-implement` then has no row for it.

    Step 3e is idempotent per repository: it adds the missing row and leaves every realized, cleaning
    or cleaned row — and `feature_branch` — untouched. A Step 3d failure still reverts the append and
    STOPs before reaching this point.

## Abort

Output: `Aborted. No changes made.` → **STOP**.

---

## Phase File Content Template

Used by Branch A new-spec generation and Branch B append.

Before writing, replace placeholders with concrete values:
- `{N}` -> numeric phase number (e.g., `3`, not `{N}`).
- `{NN}` -> zero-padded phase number for display (e.g., `03`).
- `{Phase Title YAML}` -> YAML string literal for the phase title (e.g., `"Add \"OAuth2\" login"`).
- `{Phase Name}` -> plain markdown phase title.
- `{Dependencies YAML}` -> sorted unique YAML array of earlier phase numbers, or `[]`.
- `{Parallel Safe}` -> `auto` or `never` after classification.
- `{Parallel Reason Field}` -> empty for `auto`; for `never`, the complete YAML
  line `parallel_reason: "<concise factual reason>"`.
- `{Related Code File Entries}` -> one or more exact concrete
  `- Read|Modify|Create|Delete: \`path\`` entries; include only actions the phase
  actually needs.

```markdown
---
phase: {N}
title: {Phase Title YAML}
status: todo
priority: P2
effort: "1h"
dependencies: {Dependencies YAML}
parallel_safe: {Parallel Safe}
{Parallel Reason Field}
---

# Phase {NN}: {Phase Name}

## Context Links

- Plan: `../plan.md`
- Spec: `../spec.md`

## Overview

[Brief description of this phase's purpose and deliverables.]

## Key Insights

- [Important finding or constraint.]

## Requirements

- Functional: [Requirement 1]
- Functional: [Requirement 2]
- Non-functional: [Quality/security/performance requirement]

## Architecture

[System design, component interaction, or data flow for this phase.]

## Related Code Files

{Related Code File Entries}

## Implementation Steps

1. [Step 1]
2. [Step 2]

## Todo List

- [ ] [Todo 1]
- [ ] [Todo 2]

## Success Criteria

- [ ] [Success criterion 1]
- [ ] [Success criterion 2]

## Risk Assessment

[Risk and mitigation.]

## Security Considerations

[Security or data protection considerations, or `None.`]

## Next Steps

[Follow-up phase or handoff.]

## Unresolved Questions

[List unresolved questions, or `None.`]
```
