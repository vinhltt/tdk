# Delegate Routing Reference

Load project routing at Step 0.1b, then use the shared `routing phase-delegates` resolver for generation and refresh. A delegate is either a `/skill` or an `@agent`. The parsing, matching, and format notes below document the resolver's contract; they are not a second delegate-computation algorithm for the planner.

## File Resolution

1. Resolve exact path: `ROUTING_FILE = {docs.path}/custom-workflow/delegate-routing.md` (where `docs.path` comes from `.specify/.specify.json`, default `.specify/configurations`). If `docs.path` is relative, resolve it from the project root; if it is absolute (including a Windows drive path), preserve it.
2. Check existence by reading the exact resolved path. Use the Read tool on `ROUTING_FILE`, or a direct shell file test plus read such as `test -f "$ROUTING_FILE"` then `cat "$ROUTING_FILE"`.
3. **Do not use Search, Grep, Glob, or a pattern like `custom-workflow/delegate-routing.md` to prove absence.** Those tools search file contents or patterns and can return 0 results even when `{docs.path}/custom-workflow/delegate-routing.md` exists.
4. If exact-path read succeeds → parse (next section).
   An unreadable file or any read error other than absence is an error: report the exact path and diagnostic, then STOP. Never treat it as an empty route or opt-out.
5. If exact-path read fails because the file is missing, first check the legacy name `{docs.path}/custom-workflow/plan-skill-routing.md` with the same exact-path read. If that legacy file exists, emit before continuing:

   ```text
   Legacy routing file detected; rename to delegate-routing.md and migrate @agent syntax
   ```

   Do not read routes out of the legacy file and do not rename it automatically.
6. Then **AskUserQuestion**:
   - Question: "No delegate-routing file found. Do you have custom skills or agents to assign per sub-workspace?"
   - Option A: "Yes, I want to create one" → show template path (`.specify/templates/plan/delegate-routing-template.tpl`) + instructions: copy to `{docs.path}/custom-workflow/delegate-routing.md`, add your `/skill` and `@agent` delegates, then re-run `/tdk-plan`. **STOP** — do not proceed with plan generation until file exists.
   - Option B: "No, skip delegate routing" → set `SKILL_ROUTING = empty`, proceed without injection.

**Never auto-create the routing file.** User must consciously opt in.

## Parsing Rules

**Input**: markdown file at `{docs.path}/custom-workflow/delegate-routing.md`.

Parse the markdown structure:
- Each `## heading` = sub-workspace name (lowercase match against `PROJECT_CONTEXT.subWorkspaces[].name`)
- `## global` = mandatory fallback section for monolith projects or unmatched sub-workspaces
- Each bullet line under a heading: `- {domain}: {delegate} [, {delegate}]`

A delegate token is one of two kinds, and both kinds may appear on the same route line:
- `/`-prefixed → a **skill** (toolset).
- `@`-prefixed → an **agent** (executor).

Normalize each token exactly as `delegate-routing-file-contract.md` specifies — four rules:
1. Trim the token; a delegate must be a single non-empty line.
2. A token starting with `@` is an agent name; every other token is a skill name and gets a leading `/` when it is missing.
3. A well-formed skill name matches `^/[A-Za-z0-9][A-Za-z0-9._:-]*$` and a well-formed agent name matches `^@[A-Za-z0-9][A-Za-z0-9._:-]*$`. A token matching neither is **not** rejected: keep it verbatim as an unrecognized delegate rather than dropping it, so a typo stays visible in `diff` output instead of silently disappearing from the route.
4. Deduplicate delegates within a route, preserving first-seen order.

**Example input** (markdown):
```markdown
## global
- research: (default - no special skill)
- test: /your-consumer-unit-test-skill

## backend
- implement: /your-backend-skill, @your-backend-agent
- database: /your-database-skill
- test: /your-backend-unit-test-skill
```

**Resulting conceptual map** (stored as `SKILL_ROUTING` — in-memory, not a file):
- `global.test` → `["/your-consumer-unit-test-skill"]`
- `backend.implement` → `["/your-backend-skill", "@your-backend-agent"]`
- `backend.database` → `["/your-database-skill"]`
- `backend.test` → `["/your-backend-unit-test-skill"]`

Domains are freeform strings (e.g. research, implement, test, database, design, clarify, styling). The built-in unit-test implementation lookup uses the single `test` domain only. Do not introduce separate `test-plan` or `test-implement` domains.

The resolver selects the `test` route for TDD/backfill phases from the plan-level `test_mode` (see `references/modes.md`). No separate planning adapter skill reads this file on `/tdk-plan`'s behalf.

## Sub-workspace Matching

The resolver matches phase `## Related Code Files` paths against configured sub-workspace paths, then uses the matched sub-workspace names for case-insensitive routing-section lookup. The first section for each workspace name wins, including when a later section supplies a domain the first lacks. Distinct matched workspaces merge in routing order with delegate deduplication. Unmatched paths and monolith projects use `## global`; a missing sub-workspace/domain entry falls back to the global entry for that domain. Duplicate sections do not suppress fallback for a different workspace without a section. Domain detection lives only in the TS resolver.

## Injection Format

The resolver emits the ordered skill group first and the ordered agent group immediately after it:

Use the canonical, unindented headings `## Delegate Skills` and `## Delegate Agents` with no trailing spaces or tabs. Noncanonical spellings are ordinary phase content, not managed delegate sections.

```markdown
## Delegate Skills
- `/{skill-name}` - {brief purpose}

## Delegate Agents
- `@{agent-name}` - {brief purpose}
```

The resolver derives placement from `plan.md`'s `test_mode`, not from inferred section shape or a per-phase override:

- Non-test phases inject `## Delegate Skills` after `## Key Insights` and before `## Requirements`.
- TDD phases inject `## Delegate Skills` after `## Test Quality Gate` and before `## Regression Gate`.
- UT backfill phases inject `## Delegate Skills` immediately after `## Test Quality Gate`.
- Spikes (`phase_type: spike`) always inject after `## Key Insights`, whatever the plan's `test_mode`.

One bullet per delegate, ordered as listed in the routing file.

Omit a section entirely when its group is empty. A domain routed to skills only produces exactly the phase body it produces today — no empty `## Delegate Agents` heading.

## Idempotency

The shared line-based scan recognizes `^## Delegate Skills$` and `^## Delegate Agents$` outside the fences it identifies. A range ends at its next recognized unindented ATX heading (`^# ` or `^## `), or EOF. The same scan discovers titles, Overview/Related Code Files inputs, and anchors. Both backtick and tilde fences are recognized: a closer uses the same character, at least the opener's length, only spaces/tabs afterward, and at most three leading spaces. This is not a full CommonMark parser; see the container limitation below. For admitted clean ranges, the resolver emits skills before agents at the mode's real anchor and deletes empty expected groups. It reuses a clean section's original slice when ordered bullets already match routing, including inline purposes and mixed LF/CRLF; canonical unchanged sections are an exact byte no-op. Non-delegate slices are preserved verbatim. Do not hand-patch routing output or keep a section at a conflicting old anchor.

If populated routing requires insertion at an anchor endpoint still inside an unclosed fence, an otherwise unambiguous phase is excluded with `drift: true`, `eligible: false`, an `[anchor_in_fence]` warning and `excludedReason`; indented container ambiguity instead uses the guard below. A phase whose required anchor heading is absent is excluded the same way with `[anchor_missing]`, raised only when an insertion is needed: deletion-only and no-op rewrites need no anchor. For an affected selected `todo` phase, `apply` refuses with the same status/reason before any write, including safe selected siblings. Callers STOP on that exclusion (generation uses Step 3d rollback), rather than requesting ineffective approval. Never auto-close the fence, auto-insert the missing heading, or choose a different anchor. An unindented unclosed example outside both the anchor and managed ranges does not by itself prevent safe insertion before its real boundary. Empty routing needs no insertion, but existing delegate ranges must still satisfy the clean-body rule.

Write admission is whitelist-only: every line in a managed range's body must be blank or a top-level delegate bullet recognized for that group, including its retained inline purpose. Fence content is refused as `delegate_section_in_fence` whether the fence is closed, open, short-closed, or only closed by a later code example. Any other content is refused as `delegate_section_not_clean`, including prose, HTML comments, nested/unrecognized/placeholder bullets, deeper headings, indented or tab-separated ATX headings, and setext headings. Content after the last delegate bullet remains part of this conservative check until a recognized boundary; the resolver never guesses a different boundary or deletes that content.

For both present-empty deletion and populated replacement, even unchanged token groups produce `drift: true`, `eligible: false`, a warning and `excludedReason` when a range is not clean. Apply returns the identical status/reason with zero writes across the selected set if an affected phase is `todo`. Clean the section manually, then rerun `check`; the resolver does not repair, erase, or auto-close examples. Closed delegate-body fences are not writable. Untouched unambiguous examples outside managed ranges/anchor and true canonical byte no-ops remain accepted; missing routing still opts out without touching managed sections. An all-phase apply skips non-`todo` phases, including their rewrite exclusions; explicit non-`todo` selections remain refused. Snapshot identity and the todo-only boundary are unchanged.

An indented fence is conservatively **container-ambiguous** when its opener has one to three leading spaces and it is unclosed at EOF or its recognized closer has a different indentation. CommonMark list-item boundaries may then make a later apparent delegate heading code, or vice versa. If any such fence exists anywhere in the phase and an otherwise admitted insertion/replacement/deletion would change bytes, `check` excludes the phase with `[fence_container_ambiguous]`, `drift: true`, and `eligible: false`; apply returns the identical reason with zero writes, including safe selected siblings. Align opener/closer indentation or close the fence manually, then rerun `check`. Never infer container boundaries or repair indentation automatically. Matching-indent fences, including `0 == 0`, `2 == 2`, and `3 == 3`, remain supported.

**Known read-only/no-op limitation:** parsing and `check` remain line-based, not CommonMark-equivalent. For an ambiguous fence they can disagree with a CommonMark reader about whether a later `## Delegate Skills`/`## Delegate Agents` heading is real. For example, an unclosed indented list fence can swallow a real delegate section in the resolver's scan even though CommonMark ends the list item before that heading. An already valid rewrite that is a true byte no-op is accepted despite this ambiguity; the guard prevents mutation, not read-interpretation disagreement. Missing-routing opt-out also remains unchanged. This no-op exception does not relax clean-body admission.

## Red-team / Validate Inline Load

`--red-team` and `--validate` short-circuit Steps 0-4 (per `modes.md`). They do NOT run Step 0.1b.

Instead, these modes inline-load the routing file inside their own workflows:
- **Red-team (Phase 06)**: re-read `{docs.path}/custom-workflow/delegate-routing.md` into `SKILL_ROUTING` so reviewers can assess delegate-assignment quality per phase.
- **Validate (Phase 07)**: load routing file so validation interview can include delegate-routing questions (e.g. "Are skills and agents correctly assigned to sub-workspaces?").

This is a lightweight exact-path read (not full Step 0.1b) — parse the file if present, skip silently if the exact resolved file is missing. Do not AskUserQuestion and do not use Search/Grep/Glob for this inline load.

## EC-11 Mismatch Warning

After parsing, compare `PROJECT_CONTEXT.subWorkspaces[].name` against `## heading` sections in the routing file.

For each sub-workspace with no corresponding section → emit advisory warning:
```
Warning: Sub-workspace '{name}' has no skill routing section - using global defaults.
```

Non-blocking — plan generation continues. Emitted once per plan (not per phase).

Test reference: `sample_spec_kit` has 3 subWorkspaces (SampleWebPage, SampleWebApi, SampleWebSrv) — a mismatch warning should fire if any of these are missing from the routing file.

## Unit Test Phase Routing

The resolver uses the matched sub-workspace's `test` entry, falling back to `global.test`. TDD prepends that route to the phase's domain route; UT backfill uses only the test route, never an additional implementation/domain route. Each group preserves routing order and omits empty sections.

If the resolver reports no test delegate for a TDD/backfill phase, emit a planning warning and leave the resolver's output unchanged; `/tdk-implement` still STOPs when a test-like phase has no usable delegate. An agent-only test route is valid.

## Generation Routing Transaction — Step 3d

Draft all invocation-new, rewritten, or appended phase bodies **without** delegate sections in Step 3b. Record their required final statuses in memory: ordinary generated phases default to `todo`; every direct spike dependent must finish generation as `blocked`. Write only this invocation-owned draft set as `todo` in both phase frontmatter and the plan table until routing injection completes. These drafts are provisional inside the generation transaction, never executable or reportable as a completed plan. Never reset an untouched existing phase to `todo`, and never omit a generated blocked-dependent phase from injection. Run this workflow inside Step 3d using the pre-mutation byte snapshots and file inventory captured before setup (see `SKILL.md` and `handle-existing-plan.md`).

1. Build `S`, the sorted, unique non-negative numeric phase set naming exactly this invocation's new/rewritten/appended drafts. `0` and `00` identify the same phase, as do other zero-padded selectors. For append, never include an existing phase just because its routing is stale. Render one `--phase N` argument per member; an empty set means no resolver call, not an unselected all-plan call. All members must still have matching draft `todo` statuses in the table/frontmatter.
2. Run a selected-phase check:

   ```bash
   (cd "$PROJECT_DIR/.specify/scripts/ts" && bun src/index.ts routing phase-delegates check --project-root "$PROJECT_DIR" --plan "$FEATURE_DIR/plan.md" --phase <N> [--phase <M> ...])
   ```

   Replace the selector notation with the actual repeated arguments for `S`. The resolver reads current route/config/plan/phase bytes itself; do not re-read `SKILL_ROUTING` to compute delegates or skip the check merely because the Step 0.1b map was empty.
3. Treat its JSON as authoritative: `state`, per-phase expected/actual groups, `domains`, `anchor`, `status`, `eligible`, `drift`, `routeSha256`, `phaseSha256`, and `snapshotDigest`. The plan table is the status source of truth; `status_mismatch`, unreadable routing, invalid anchors/paths, malformed JSON, or another resolver error invokes Step 3d rollback. `missing` means opt-out: leave delegates unchanged and skip plan delegate readiness. `present-empty` means authoritative empty groups, not missing routing.
4. For present routing, apply the checked injection using the **identical normalized S**:

   ```bash
   (cd "$PROJECT_DIR/.specify/scripts/ts" && bun src/index.ts routing phase-delegates apply --project-root "$PROJECT_DIR" --plan "$FEATURE_DIR/plan.md" --snapshot <snapshotDigest> --allow-in-progress-plan --phase <N> [--phase <M> ...])
   ```

   Use only the digest from that selected check. Generation owns these selected provisional `todo` drafts; `--allow-in-progress-plan` permits an append when an older phase is already `in_progress`, never modification of that older phase or any existing `blocked` phase. The resolver remains strictly todo-only. A `stale` result permits exactly one fresh check and apply with the same S and new digest, while preserving the drafts' final-status intent. A second `stale` or any other resolver failure rolls back and STOPs, including a failure after partial apply.
5. After injection (also for `missing` or `present-empty` routing), finalize the recorded statuses for S using the status-update commands in `plan-output-contract.md`, updating both phase frontmatter and the plan table. Set every generated direct spike dependent to `blocked`; keep the spike itself and ordinary generated phases `todo`. This is generation initialization, never a readiness or refresh status transition. A status-write failure uses the same rollback; never leave a dependent `todo`, skip it, or publish/report the provisional drafts.
6. Re-read the finalized selected phase files and collect the read-only readiness results below. Then run all four ordered post-write gates against the final plan and phases, including the existing spike blocked-dependent validator. Keep the snapshots until those gates succeed. A structural/script/I/O failure restores the previous plan bytes (including append's reciprocal `Blocks` cells), restores overwritten/deleted phase bytes, and removes only invocation-new files. A plan absent before the invocation becomes absent again; preserve unrelated and pre-existing files.
7. A static readiness failure is **not** a resolver/validation error: still run the post-write gates. If they pass, keep the finalized generated files and carry every failure to Step 4 as `NOT RUNNABLE: delegate readiness`. Do not dispatch executors or run remediation. Readiness never changes the finalized statuses, including required `blocked` spike dependents.

## Plan Delegate Readiness

Load `../tdk-implement/references/phase-execution.md` relative to the directory containing this skill's `SKILL.md`; apply its **Delegate Skill Loading Requirement, Tier 1** after injection. Use the exact exposed subagent-dispatch primitive (`task` for OMP, `Agent` or `Task` for Claude); any other or unresolved primitive is `unverified`. Do not infer a harness from directory names or installation metadata.

For every selected phase, resolve each routed agent by exact frontmatter `name` in that rule set's supported project/user scopes and check every routed skill's rule-set-specific locator. Retain the contract's `delegateReadiness` evidence. Skill-only routes check skill availability without inventing an executor. Agent-only routes require a resolved agent binding but no skill-loader. Missing routing skips this planning gate as opt-out; present routing is assessed even when the earlier in-memory map was empty.

For a non-empty OMP delegated toolset, require proven G5 custom-child `skill://` loading plus effective `read` (explicit or inherited by omitted `tools` under G2). G1 `autoloadSkills` coverage or main-session readability alone is not a loader receipt. Honor explicit restrictions. Claude's explicit effective `Skill` grant follows the existing contract; inherited `Skill` (omitted `tools`) and complete `skills:` preload are `ready` only in the exercised G3 cases of the loading contract. With explicit tools and no `Skill`, a delegate that is not preloaded or has `disable-model-invocation: true` is `no-loader`; wildcard/unknown tools stay `unverified`.

Report each failing phase/delegate, verdict/reason code, resolved/scanned paths, and missing evidence in Step 4. Do not label generated files runnable until the static checks pass; static readiness is not proof of Tier 2 dispatch-time loading.

| Reason | User-run remediation |
|---|---|
| `agent-not-found` / `skill-not-found` | Run `/tdk-scaffold-from-recommendation` against canonical consumer `.claude/` source. For OMP, then run source-checkout `convert-flat --harness omp`. |
| `no-loader` | Edit the executor frontmatter: grant effective OMP `read`, or Claude `Skill` not denied by restrictions; full Claude preload is an alternative only with complete coverage and no `disable-model-invocation` delegate. Convert the canonical source again for OMP. |
| `unverified` | Fix the specific cited evidence gap (unsupported dispatch/scope, unresolved frontmatter/tool semantics, unproven G3/G5, or unreadable/ambiguous skill evidence). Do not prescribe a blanket agent move or call missing evidence incompatible. |
| Route mismatch | Review and update routing through `/tdk-delegate-routing`, then rerun generation or the explicit refresh action. |

For OMP remediation, resolve the actual TDK source-checkout CLI before printing a command: `bun <absolute-source-checkout>/packages/tdk-setup/src/index.ts convert-flat <absolute-consumer-root> --harness omp`. If the checkout location is unknown, report that prerequisite instead of printing a consumer-relative or fabricated path. Never auto-run scaffold, conversion, registration, or frontmatter edits.

## Refresh Routing Only — Step 0.refresh

Use only for `/tdk-plan <TASK_ID> --refresh-routing`, immediately after project context. Reject every speed, test, targeting, red-team, validate, and migrate flag combination in Step 0 before mutation. Skip Step 0.1b's opt-in prompt and every generation/review step; this action never enters the generation transaction.

1. Read the existing `"$FEATURE_DIR/plan.md"` without setup. If absent, STOP with `No plan to refresh.` Do not create a plan.
2. Run `routing phase-delegates check` with `--project-root "$PROJECT_DIR" --plan "$FEATURE_DIR/plan.md"` and **no phase selectors** as an eligibility/drift scan, using the same Bun invocation contract as above. Errors, including `unreadable` or `status_mismatch`, STOP without writes. `present-empty` may propose deletion of both stale sections; never skip it as opt-out.
3. Use the plan-table statuses returned by the scan. If any phase is `in_progress`, refuse with `Refresh refused: phase NN is in_progress. Finish or recover it with /tdk-implement first.` List the active phases and STOP with zero writes. Otherwise, `missing` emits an opt-out notice and ends with no changes. For present routing, collect S from exactly the drifted `todo` phases, and summarize every excluded `in_progress | done | skipped | blocked | cancelled` phase with its status. If S is empty, report no changes and do not call apply.
4. Run a fresh `check --phase N [--phase M ...]` for **exactly S**, even though the all-phase scan already has a digest. Present that selected check's final expected/actual groups, anchors, and `snapshotDigest`, together with the excluded-phase summary. The preliminary all-phase digest must never authorize subset apply.
5. Ask one **AskUserQuestion**: `Apply refresh to N todo phases?` Only an affirmative answer authorizes:

   ```bash
   (cd "$PROJECT_DIR/.specify/scripts/ts" && bun src/index.ts routing phase-delegates apply --project-root "$PROJECT_DIR" --plan "$FEATURE_DIR/plan.md" --snapshot <selected-check-digest> --phase <N> [--phase <M> ...])
   ```

   Pass the **identical normalized S** from the approved selected check. Never pass `--allow-in-progress-plan` for this action. A decline/cancel ends with no writes.
6. On `stale`, discard the approval, repeat the all-phase eligibility scan and selected-phase final check once, re-preview, and ask for fresh approval. If refreshed eligibility changes S, use that new S consistently for its check and apply. Never apply the stale diff; a second `stale` STOPs. An active phase or any other error in the retry still refuses without writes.
7. For each phase in `changedPhases`, run `(cd "$PROJECT_DIR/.specify/scripts/ts" && bun src/commands/util/validate-phase-file.ts "<phasePath>" --plan "$FEATURE_DIR/plan.md" --phase-number <N> --json)` using the resolver's exact phase path/number. Report the changed phases and any validator diagnostics. Do not run Step 3d's generation gates on untouched content or claim readiness from routing equality.

Only resolver-selected delegate sections may change. Preserve `plan.md`, spec, requirements, success criteria, related files, dependencies, parallel metadata, statuses, and every excluded phase byte-for-byte. Never refresh old phases incidentally during append; point users to this explicit action instead.
