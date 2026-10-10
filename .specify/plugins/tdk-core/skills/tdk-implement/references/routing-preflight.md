# Routing Preflight

Use this reference for Step 0.3 delegate-routing load and Step 7A delegate drift checks.

## Step 0.3 - Load Delegate Routing

Load project delegate routing after project context and before any phase status mutation.

1. Resolve docs path from `PROJECT_CONTEXT.docsPath` first, then raw project config `docs.path` if available, defaulting to `.specify/configurations`.
2. Resolve exact path: `ROUTING_FILE = {docs.path}/custom-workflow/delegate-routing.md`. If `docs.path` is relative, resolve from the project root; if absolute, preserve it.
3. Check existence by direct exact-path read: read the exact resolved path with Read, or run a direct shell file test plus read such as `test -f "$ROUTING_FILE"` then `cat "$ROUTING_FILE"`.
4. Do not use Search, Grep, Glob, or a path fragment pattern to prove absence.
5. If the exact-path read succeeds, parse:
   - each `## heading` as a routing section
   - `## global` as the global fallback
   - each bullet as `- {domain}: {delegate} [, {delegate}]`, where a `/`-prefixed token is a **skill** and an `@`-prefixed token is an **agent**; both kinds may appear on the same route line, and each group keeps its routing order
   An unreadable file or any other non-absence read error STOPs with its exact path/diagnostic; never turn a read failure into empty routing.
6. If the exact path is missing, check the legacy name `{docs.path}/custom-workflow/plan-skill-routing.md` with the same exact-path read. If the legacy file exists, emit this warning first:

   ```text
   Legacy routing file detected; rename to delegate-routing.md and migrate @agent syntax
   ```

   Then — warned or not — set `SKILL_ROUTING = empty` and continue. Never read routes out of the legacy file and never rename it automatically.

Never auto-create the routing file. Missing routing means no routing preflight delegate expectations.

## Step 7A - Routing Preflight

Before marking a runnable `todo` phase `in_progress`, run routing preflight. This is read-only before the first `in_progress` status transition. The only permitted write during preflight is the explicit user-selected refresh action described below; cancel stops without status mutation. Actual status writes still keep phase frontmatter first, then `plan.md`.

Select S before checking: the serial phase about to start, or the **whole candidate wave** in parallel mode. Normalize to sorted, unique non-negative phase numbers (`0` and `00` select the same phase) and render one `--phase N` per member. Every selected phase must still be `todo`; the plan table is authoritative and a frontmatter/table mismatch STOPs before status mutation.

1. Run the shared resolver against exactly S, even if `SKILL_ROUTING` was empty:

   ```bash
   (cd "$PROJECT_DIR/.specify/scripts/ts" && bun src/index.ts routing phase-delegates check --project-root "$PROJECT_DIR" --plan "$FEATURE_DIR/plan.md" --phase <N> [--phase <M> ...])
   ```

   Replace the selector notation with the actual repeated arguments for S. Resolver JSON owns expected/actual skills and agents, domains, anchors, drift, statuses, and `snapshotDigest`. Its `actual` groups use the shared line-based fence scan even when routing is missing; examples inside its recognized fences are not delegate sections, bullets, or boundaries. Execution uses the same scan, not a raw heading search, prose keyword table, or cached routing map. This is not full CommonMark parsing: an indented opener with mismatched closing indentation or no closer can make the scan disagree with a CommonMark reader about later delegate headings, including missing a real section after an unclosed list-item fence. That known read-only/no-op limitation remains; do not claim CommonMark equivalence.
2. Handle the returned route state:
   - `missing`: opt-out; do not propose deletion or modify manually declared delegates. Continue to the readiness gate below, not directly to a status write.
   - `unreadable`: STOP with the resolver diagnostic and no writes. Malformed output, `status_mismatch`, invalid path, or any other resolver error also STOPs before transition. A selected `[anchor_missing]`, `[anchor_in_fence]`, `[delegate_section_in_fence]`, `[delegate_section_not_clean]`, or `[fence_container_ambiguous]` warning/`excludedReason` STOPs without approval or status writes; `[anchor_missing]` names the heading to add before rerunning `check`. Insertion cannot end inside an unclosed fence. Deletion/replacement still requires blank body lines or top-level recognized delegate bullets with retained inline purposes; other body content requires manual cleanup. Any indented opener (one to three spaces) that is unclosed or closes with different indentation anywhere in the phase excludes otherwise admitted byte-changing rewrites; align/close it manually, then rerun `check`. Matching indentation remains supported. Equal tokens alone do not establish a no-op, but a valid rewrite that preserves every original byte remains accepted despite container ambiguity, including mixed LF/CRLF.
   - `present-empty`: expected groups are empty; any stale delegate sections are drift. Offer refresh to **delete both sections**, not a silent continue.
   - `present-populated`: use the resolver's exact groups and reported anchor.
3. If there is no drift, retain the selected check and proceed to readiness. Otherwise show the selected snapshot's expected delegates and actual phase delegates for both groups, plus each affected phase/anchor. Use AskUserQuestion before any apply:

```json
{
  "questions": [{
    "question": "Phase NN delegates do not match current routing. What should happen before implementation?",
    "header": "Routing Drift",
    "options": [
      {"label": "Refresh delegate sections", "description": "Insert current expected skills and agents, then continue"},
      {"label": "Run generic override", "description": "Skip routed delegates for this non-test phase and run generic implementation"},
      {"label": "Cancel", "description": "Stop without changing phase status"}
    ],
    "multiSelect": false
  }]
}
```

Ask once per phase covering both groups; never ask a separate question per section.

For a test-like phase where expected routing includes a `test` delegate, omit `Run generic override` from this question.

## Delegate Readiness Before Transition

After drift resolution, apply **Delegate Skill Loading Requirement, Tier 1** from `phase-execution.md` to every actual routed agent in S, including manually declared agents when routing is missing/empty. Run it before the first serial or wave `in_progress` transition. For a user-selected generic override, retain the override decision and do not dispatch the skipped routed delegates.

Keep `delegateReadiness` per agent: the exact selected dispatch primitive, resolved name binding, ordered skill locators, effective-loader/probe evidence, verdict, and failing delegates/reason codes. Agent-only routes still resolve the binding but require no skill-loader. Non-empty OMP toolsets require proven G5 and effective `read`; main-session readability or G1 autoload coverage is insufficient. Claude verdicts follow the `phase-execution.md` capability table: its exercised G3 cases are `ready`; outside them the result is `no-loader` or `unverified`. Honor explicit restrictions and the contract's supported scopes.

If any static result is not ready, report every phase/delegate and the contract's `agent-not-found`, `skill-not-found`, `no-loader`, or `unverified` evidence; STOP without dispatch or status writes. All selected phase(s) remain `todo`; emit **no F3 recovery reminder** because execution never began. Do not silently drop agents, invoke their toolsets in the controller, or request Claude `Skill` for OMP. Skill-only routes remain valid.

Immediately before admission, changed agent/skill definitions or a changed dispatch primitive invalidate `delegateReadiness`; recheck before transition. After the transition, Tier 2 belongs to the executor's `Load before writing:` contract: a load failure returns literal `Status: BLOCKED`, leaves the phase `in_progress`, and triggers F3. Readiness and route equality never substitute for that child load.

## Refresh Behavior

Apply only an explicitly approved selected check, with **identical normalized S** and its `snapshotDigest`:

```bash
(cd "$PROJECT_DIR/.specify/scripts/ts" && bun src/index.ts routing phase-delegates apply --project-root "$PROJECT_DIR" --plan "$FEATURE_DIR/plan.md" --snapshot <approved-digest> --allow-in-progress-plan --phase <N> [--phase <M> ...])
```

Pass `--allow-in-progress-plan` because an earlier wave or F3 recovery may already own an active phase elsewhere in the plan; every explicitly selected phase must still be `todo`. Never reset an existing `blocked` or other non-`todo` phase for routing; generation's provisional draft lifecycle does not apply to preflight or refresh. Keep selected non-drift phases in S: the resolver leaves them untouched. Do not substitute an all-plan check digest, drop selectors, or silently shrink the apply set to only drifted phases.

The resolver rewrites both groups at the plan-level mode's anchor: standard after Key Insights, TDD after Test Quality Gate before Regression Gate, backfill after Test Quality Gate with **test-only routing**; spikes always after Key Insights. Empty groups delete their sections. Re-read the selected phase files after apply; serial execution then runs Tier 1 readiness before continuing.

On `stale`, discard the approval, check the same selected set once, re-preview the current expected/actual groups and anchors, and obtain fresh approval. Never apply a stale diff. A second `stale` or another error STOPs without any status transition. If the user explicitly changes the selected refresh set, obtain a new matching selected-phase check and approval before applying that set; never reuse the previous digest for a subset.

In parallel mode, resolve drift for the complete candidate wave before the first status write. Resolve all per-phase decisions before applying; if not every drifted phase approves refresh, never overwrite a generic-override phase without its approval. A narrower explicitly approved refresh set requires its own selected check, final preview, and approval. A selected refresh is controller-only: apply and verify the refresh, then release and STOP so the user can review and clean the tree. Cancel writes nothing. Workers may not refresh routing or choose replacements.

For a no-refresh wave, retain an immutable admission snapshot containing the selected resolver `snapshotDigest`, routing bytes/checksum, every candidate phase hash, expected/actual groups, dispatch primitive and resolved executor binding, **delegateReadiness** with agent/skill-definition evidence, test-like restrictions, generic override decision, success criteria, declared reads, canonical ownership, and worker command boundary. Re-read every snapshot hash immediately before admission; any routing/plan/config/phase or readiness-evidence drift discards and rebuilds the complete candidate wave before status writes. Workers may not broaden that snapshot.

## Generic Override Behavior

- Generic override is available only when the phase is not test-like.
- Log: `User chose generic implementation despite routing delegates: {expected delegates}`.
- For any test-like phase where expected routing includes a `test` delegate, require refresh or cancel; no inline generic unit-test implementation.
