# Quality Gates

## Skip Conditions

- **Skip research phase if:** user provides technical context or researcher reports.
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

Re-evaluate after `data-model.md` + `contracts/` are written (post-design).

## UPDATE vs REGENERATE Mode (Step 2)

Step 1.5 selects the mode. Step 2 honors it.

**UPDATE mode** (existing plan preserved — Step 1.5 picked Append, or there was no Step 1.5 because `planExists == false` but a `plan.md` written by another command exists):

1. Read the current `plan.md` **in full** before writing anything.
2. For each section:
   - Value is a placeholder (`[FEATURE]`, `NEEDS CLARIFICATION`, empty brackets `[]`) → fill / refine.
   - Value already populated with real content → **PRESERVE as-is**.
3. **Never overwrite** sections filled by previous commands (e.g. `/tdk-analyze`) or human edits.

**REGENERATE mode** (Step 1.5 picked Rewrite — `setup-plan.ts --force` already overwrote `plan.md` with the fresh template):

- Proceed normally. The template is the authoritative starting point; no preservation work needed.

## Phase 0.guardian — Business Logic Validation

Run after `plan.md` is drafted (Step 3 complete) and **only if** `.specify/memory/memory-index.md` exists.

1. Spawn `memory-guardian` agent with:
   - `plan.md` content
   - the Context Block already loaded in Step 0.memory (pass it directly to avoid double preload)
   - **TOOL PRIORITY instruction:** `"Use mcp__smart-obsidian__search_vault_smart for vault-wide claim verification; fall back to get_vault_file/Read only for known paths. See agent's Tool Priority section."`
1.5. **Handle MCP availability:**
   - If guardian output contains line `STATUS: MCP_UNAVAILABLE`:
     - **`--fast` mode:** re-spawn guardian with `--no-mcp` flag, log warning: `"MCP smart-obsidian unavailable; using file-based search. Fix MCP for next run."` Skip user prompt.
     - **Default mode:** AskUserQuestion with 2 options:
       - **A) Continue with file-based search** → re-spawn guardian with `--no-mcp` flag
       - **B) Fix MCP smart-obsidian first** → STOP. Output:
         ```
         MCP smart-obsidian server unavailable. To fix:
         1. Verify MCP config: ~/.claude.json or .mcp.json
         2. Restart Claude Code
         3. Re-run /tdk-plan after fix
         ```
   - If no `STATUS:` line → proceed to Step 2 (Read Guardian Report).
2. Read the Guardian Report:
   - `Action required: BLOCK_IMPL` → STOP. Report all CONFLICTS to user. Do not proceed to Step 4.
   - `Action required: REVIEW` → add `## Memory Constraints` section to `plan.md` listing the warnings. Proceed to Step 4.
   - `Action required: CLEAR` or memory not initialized → proceed to Step 4.

**`--fast` interaction:** memory-guardian still runs (Key Constraint #2 + S2.F7). Negligible token cost (~500) vs. regression risk from bypassing binding invariants. See `references/modes.md`. When MCP_UNAVAILABLE in --fast: auto re-spawn with --no-mcp + warning log (no AskUserQuestion, to preserve speed).

## Memory Pre-load (Step 0.memory)

Run **only if** `.specify/memory/memory-index.md` exists (check silently, non-blocking).

1. Invoke `tdk-memory-preload` skill with feature description from `$ARGUMENTS` or from `spec.md` if already loaded.
2. If a Context Block is returned: use it as reference throughout plan writing.
   - Respect all CONSTRAINTS & WARNINGS listed in the Context Block.
   - Note in `plan.md` frontmatter: `memory_context_loaded: true`.
   - **Keep the Context Block in memory** — pass it to `memory-guardian` in Phase 0.guardian.
3. If memory not initialized or no relevant context: proceed normally.
   - Note in `plan.md` frontmatter: `memory_context_loaded: false`.

**This step MUST NOT block or error.** If `tdk-memory-preload` fails for any reason, skip and continue.
