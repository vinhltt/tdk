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

**Scope lock:** rewrite targets `plan.md` + `phases/phase-NN-*.md` files
**ONLY**. Do not touch conditional `research/`, `reports/`, `contracts/`, or any
legacy standalone artifact. Use `--migrate-artifacts` for explicit migration.

**On proceed:** re-run
`(cd "$PROJECT_DIR/.specify/scripts/ts" && bun src/commands/util/setup-plan.ts {task_id} --force --json)`,
then continue to Step 2 with **REGENERATE mode**. Regenerate and classify every
rewritten phase; no rewritten phase receives the untouched-legacy metadata
exemption. Any setup, write, or validation failure removes only invocation-new
files and STOPs with exact diagnostics.

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
8. **Apply one append:** Write the phase file, append its row, and update only
   the reciprocal `Blocks` cells in `plan.md`.
   Preserve every existing phase file byte-for-byte.
   The table row uses:
   - **VALID_STATUSES (enforced):** `todo | in_progress | done | skipped | blocked | cancelled`. Default for new phases = `todo`. NEVER use `not-started`, `pending`, `planned`, `new`, or any other value — the Step 3d status validator WILL reject it.
   - `Status = todo` and the normalized `Blocks` / `BlockedBy` relations from Step 6.
   - File column: `[phase-${NN}-${slug}](phases/phase-${NN}-${slug}.md)` (lowercase path).

   **PROHIBITED:** Do NOT add any prose, narrative, or description anywhere in `plan.md`. All phase context belongs exclusively in the phase file's `## Overview` section. The Step 3d prose validator will reject violations.
9. **Run Step 3d:** Execute the four ordered post-write gates from
   `plan-output-contract.md`. Gate 3 validates only the appended phase; gate 4
   validates write disjointness across every `parallel_safe: auto` phase in the
   plan. Accept warnings for untouched legacy metadata only. Any invalid result,
   non-zero exit, malformed JSON, or runtime/I/O error reverts the appended row
   in `plan.md`, must remove the appended phase file, and STOPs with exact
   diagnostics. Leave no orphan phase or table row. Never auto-fix, repair, or
   downgrade rejected output.

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

<!-- Insert ## Delegate Skills here only when skill routing applies. -->

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
