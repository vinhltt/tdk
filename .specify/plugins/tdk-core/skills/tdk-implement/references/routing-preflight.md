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
6. If the exact path is missing, check the legacy name `{docs.path}/custom-workflow/plan-skill-routing.md` with the same exact-path read. If the legacy file exists, emit this warning first:

   ```text
   Legacy routing file detected; rename to delegate-routing.md and migrate @agent syntax
   ```

   Then — warned or not — set `SKILL_ROUTING = empty` and continue. Never read routes out of the legacy file and never rename it automatically.

Never auto-create the routing file. Missing routing means no routing preflight delegate expectations.

## Step 7A - Routing Preflight

Before marking a runnable `todo` phase `in_progress`, run routing preflight. This is read-only before the first `in_progress` status transition. The only permitted write during preflight is the explicit user-selected refresh action described below; cancel stops without status mutation. Actual status writes still keep phase frontmatter first, then `plan.md`.

For each runnable phase:

1. Read `phasePath`.
2. If `SKILL_ROUTING` is empty, continue to current status transition flow.
3. Compute expected delegates:
   - Extract target paths from `## Related Code Files`.
   - Match target paths against `PROJECT_CONTEXT.subWorkspaces[].path` by prefix; the path-prefix match selects the subworkspace object.
   - Route lookup uses `subWorkspace.name` case-insensitively because routing file `##` sections are keyed by sub-workspace name, not path.
   - If no subworkspace matches, or no subWorkspaces are configured, use the `global fallback`.
   - Detect an ordered domain list from phase title, overview, and related code: test/UT/spec keywords -> `test`; database/schema/migration -> `database`; UI/component/screen/mockup -> `design`, then `implement`; API/endpoint/service -> `implement`; research/exploration -> `research`; fallback -> `implement`.
   - Look up matched subworkspace/domain entries for each domain in order, then `global`/domain.
   - Merge expected delegates and deduplicate while preserving routing order.
   - Split the merged result into two expected groups by token prefix: expected **skills** (`/`-prefixed) and expected **agents** (`@`-prefixed). Each group keeps routing order; the comparison below runs per group.
4. Parse actual `## Delegate Skills` and `## Delegate Agents` from the phase using the same parser as Step 7B — the skills section yields the actual skill group, the agents section yields the actual agent group, and a missing section means that group is empty.
5. If both expected groups are empty, continue with existing delegate/generic behavior.
6. If expected skills matches actual skills exactly **and** expected agents matches actual agents exactly, continue with existing delegate execution.
7. If either group differs, show the expected delegates and the actual phase delegates for both groups, then use AskUserQuestion:

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

## Refresh Behavior

Refresh rewrites **both** delegate sections in one pass, in this order: `## Delegate Skills` first, then `## Delegate Agents` immediately after it.

- Insert or replace `## Delegate Skills` after `## Key Insights`, then insert or replace `## Delegate Agents` directly after the `## Delegate Skills` section.
- Detect each section by scanning for `^## Delegate Skills$` and `^## Delegate Agents$`; replace from that heading until the next `^## ` heading or EOF.
- Refreshing one group never leaves the other stale: write both groups from the same expected snapshot, even when only one group drifted.
- When an expected group is empty, delete that section instead of writing an empty heading.
- Re-read the phase file, then continue.

In parallel mode, routing drift is resolved for the complete resolver candidate wave before the first
status write. Snapshot the exact routing bytes/checksum, every candidate phase hash, expected and actual
delegates for both groups, the routed agent used as each phase's `subagent_type`, test-like restrictions,
generic override decision, success criteria, declared reads, canonical
ownership, and worker command boundary. A selected refresh is controller-only: apply and verify the refresh,
then release and STOP so the user can review and clean the tree. Cancel writes nothing. Re-read every snapshot
hash immediately before admission; any drift discards and rebuilds the complete candidate wave. Workers may
not refresh routing, select replacement delegates, or broaden the immutable snapshot.

## Generic Override Behavior

- Generic override is available only when the phase is not test-like.
- Log: `User chose generic implementation despite routing delegates: {expected delegates}`.
- For any test-like phase where expected routing includes a `test` delegate, require refresh or cancel; no inline generic unit-test implementation.
