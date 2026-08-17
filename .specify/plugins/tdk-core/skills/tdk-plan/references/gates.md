# Quality Gates

## Skip Conditions

- **Skip research if:** repository evidence, supplied technical context, or
  researcher reports settle every external/technical question. Do not create
  a research phase as a substitute.
- **Skip design phase if:** architecture already documented in spec.
- **Skip constitution check if:** constitution not configured for project.

## Before Design Phase

- [ ] All NEEDS CLARIFICATION resolved
- [ ] `research/` reports complete with decisions / rationale
- [ ] Dependencies identified

## Before Completion

- [ ] All phases have success criteria
- [ ] No unresolved unknowns
- [ ] Constitution check passed (if required)

## Constitution Check

Read `.specify/memory/constitution.md` (if present) and evaluate the plan against each binding rule. ERROR on unjustified gate failure.

Re-evaluate after phase-owned data-model/interface sections and any declared
machine contracts are written (post-design).

## UPDATE vs REGENERATE Mode (Step 2)

Step 1.5 selects the mode. Step 2 honors it.

**UPDATE mode** (existing plan preserved — Step 1.5 picked Append, or there was no Step 1.5 because `planExists == false` but a `plan.md` written by another command exists):

1. Read the current `plan.md` **in full** before writing anything.
2. For each section:
   - Value is a placeholder (`[FEATURE]`, `NEEDS CLARIFICATION`, empty brackets `[]`) → fill / refine.
   - Value already populated with real content → **PRESERVE as-is**.
3. **Never overwrite** sections filled by previous commands (e.g. `/tdk-consistency-check`) or human edits.

**REGENERATE mode** (Step 1.5 picked Rewrite — `setup-plan.ts --force` already overwrote `plan.md` with the fresh template):

- Proceed normally. The template is the authoritative starting point; no preservation work needed.

## Phase 0.guardian — Business Logic Validation

Run after `plan.md` is drafted (Step 3 complete) and **only if** `.specify/memory/memory-index.md` exists.

0. **Guardian preconditions.** Evaluate in order; the first match wins. On any
   skip, append one line stating the reason to the `## Memory Constraints`
   section of `plan.md`, creating that section immediately before
   `## Complexity Tracking` when it does not already exist, then proceed to
   Step 4. Never write a skip marker to `plan.md` frontmatter; that schema is
   closed.

   a. **Binding coverage.** Read the `Binding coverage:` line from the
      `.specify/memory/memory-index.md` already loaded in Step 0.memory — do not
      re-read the file. Resolve `BINDING_COVERAGE`:
      - `BINDING_COVERAGE` never set, because Step 0.memory was skipped or
        failed → `unknown`
      - line absent, or the index tables have no `Binding` column → `unknown`
      - `Binding coverage: 0 of N typed files` → `none`
      - otherwise → the reported count

      Skip when `BINDING_COVERAGE` is `unknown` or `none`. Do not ask the user:
      there is no admissible evidence to validate against, so the question has
      no meaningful answer. Reason line:
      `Guardian skipped — memory-index reports no binding: true coverage. Run /tdk-memory-update to regenerate the index if memory was recently updated.`

   b. **Fast mode.** Skip when `--fast` is in `FLAGS`. Do not ask. Reason line:
      `Guardian skipped — fast mode.`

   c. **Task-level decision.** Read `memory_validation` from the `spec.md`
      frontmatter of the current feature when a spec exists.
      - `disabled` → skip. Do not ask again; this decision was made once for the
        whole task at `/tdk-specify`. Reason line:
        `Guardian skipped — memory validation disabled for this task at /tdk-specify.`
      - `enabled` → proceed to Step 1.
      - Any other value, including an unreplaced `[enabled/disabled]`
        placeholder → treat exactly as absent and fall through to `d`. Never
        guess an intent from a malformed value.

   d. **Fallback question.** Only when no `spec.md` exists, or it carries no
      usable `memory_validation` field (a standalone `/tdk-plan` run).
      - **No `spec.md` at all** → skip without asking. There is no
        `## 3. Impact Surface` to derive a default from, and a plan run outside a
        spec has no task-lifecycle decision to honor. Reason line:
        `Guardian skipped — no spec.md for this feature, so no memory-validation decision exists.`
      - **`spec.md` exists but carries no usable field** → ask with
        `AskUserQuestion`, header `"Memory Validation"`, question
        `"Validate this plan against project memory?"`. Preselect the default from
        that spec's `## 3. Impact Surface`: one distinct subworkspace or
        `N/A — monolith` → default the skip option; two or more distinct
        subworkspaces → default the validate option. Skip choice → reason line
        `Guardian skipped — user declined memory validation for this run.`
        Non-interactive context → use the computed default without prompting.

1. Spawn `tdk-memory-agent` agent with `--mode validate` and:
   - `plan.md` content
   - the Context Block already loaded in Step 0.memory (pass it directly to avoid double preload)
   - When `MCP_STATE` from Step 0.memory already recorded MCP as unavailable,
     spawn with `--no-mcp` directly and log the warning below. This is what
     "reuse `MCP_STATE`, do not probe again" means in practice: it saves the
     wasted probe spawn rather than rediscovering the same unavailability.
   - Otherwise pass the **Obsidian MCP instruction:** `"Use the Obsidian MCP action contract: vault(action=\"search\") for candidate discovery, vault(action=\"read\") for evidence files, and file tools only after fallback is selected. See agent's Obsidian MCP Action Contract section."`
1.5. **Handle MCP availability:**
    - If agent output still contains line `STATUS: MCP_UNAVAILABLE` (MCP dropped
      between Step 0.memory and now), re-spawn the agent with `--no-mcp` and log
      the warning `"Obsidian MCP unavailable; using file-based search. Fix MCP for next run."`
      Do not prompt and do not STOP. Transport availability is not a reason to
      block a plan; the gate degrades to file-based search instead. Note that
      file-based search has lower recall than MCP, so a `BLOCK_IMPL` can be
      missed in fallback mode — the warning log is the signal to fix MCP.
   - If no `STATUS:` line → proceed to Step 2 (Read Guardian Report).
2. Read the Guardian Report:
   - `Action required: BLOCK_IMPL` → STOP. Report all CONFLICTS to user. Do not proceed to Step 4.
   - `Action required: REVIEW` → add `## Memory Constraints` section to `plan.md` listing the warnings. Proceed to Step 4.
   - `Action required: CLEAR` or memory not initialized → proceed to Step 4.

**`--fast` interaction:** `--fast` skips Phase 0.guardian entirely (precondition
`0.b`) and keeps Step 0.memory. Guardian spawns a second full subagent pass over
the drafted plan, making it the most expensive step in the flow, while
`--mode load` returns content the plan is actually written from — so load stays
and guardian goes. The skip is reported by the single mode banner in
`references/modes.md`; do not emit a second log line for it.

## Memory Pre-load (Step 0.memory)

Run **only if** `.specify/memory/memory-index.md` exists (check silently, non-blocking).

1. Spawn `tdk-memory-agent` agent with `--mode load` and the feature description.
   - Record the Obsidian MCP availability observed during this step as
     `MCP_STATE`. Phase 0.guardian reuses `MCP_STATE` and must not probe again.
   - Read the `Binding coverage:` line from `.specify/memory/memory-index.md`
     once and keep it as `BINDING_COVERAGE` for the Phase 0.guardian
     precondition. Do not re-read the index later in the flow.
2. If a Context Block is returned: use it as reference throughout plan writing.
   - Respect all CONSTRAINTS & WARNINGS listed in the Context Block.
   - Record the outcome as one line in the `## Memory Constraints` section of
     `plan.md`: `Memory context loaded.` Create that section immediately before
     `## Complexity Tracking` when it does not already exist. Do not write it to
     `plan.md` frontmatter; that schema is closed.
   - **Keep the Context Block in memory** — pass it to `tdk-memory-agent` `--mode validate` in Phase 0.guardian.
3. If memory not initialized or no relevant context: proceed normally.
   - Record one line in `## Memory Constraints`: `Memory context not loaded.`

**This step MUST NOT block or error.** If `tdk-memory-agent` fails for any reason, skip and continue.
