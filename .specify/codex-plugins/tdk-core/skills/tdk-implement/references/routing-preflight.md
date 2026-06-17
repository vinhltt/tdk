# Routing Preflight

Use this reference for Step 0.3 skill-routing load and Step 7A delegate drift checks.

## Step 0.3 - Load Skill Routing

Load project skill routing after project context and before any phase status mutation.

1. Resolve docs path from `PROJECT_CONTEXT.docsPath` first, then raw project config `docs.path` if available, defaulting to `.specify/configurations`.
2. Resolve exact path: `ROUTING_FILE = {docs.path}/custom-workflow/plan-skill-routing.md`. If `docs.path` is relative, resolve from the project root; if absolute, preserve it.
3. Check existence by direct exact-path read: read the exact resolved path with Read, or run a direct shell file test plus read such as `test -f "$ROUTING_FILE"` then `cat "$ROUTING_FILE"`.
4. Do not use Search, Grep, Glob, or a path fragment pattern to prove absence.
5. If the exact-path read succeeds, parse:
   - each `## heading` as a routing section
   - `## global` as the global fallback
   - each bullet as `- {domain}: {skill-name} [, {skill-name}]`
6. If the exact path is missing, set `SKILL_ROUTING = empty` and continue.

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
4. Parse actual `## Delegate Skills` from the phase using the same parser as Step 7B.
5. If expected delegates is empty, continue with existing delegate/generic behavior.
6. If expected delegates matches actual phase delegates exactly, continue with existing delegate execution.
7. If expected delegates and actual phase delegates differ, show both lists and use AskUserQuestion:

```json
{
  "questions": [{
    "question": "Phase NN delegate skills do not match current routing. What should happen before implementation?",
    "header": "Routing Drift",
    "options": [
      {"label": "Refresh `## Delegate Skills`", "description": "Insert current expected delegates, then continue"},
      {"label": "Run generic override", "description": "Skip routed delegates for this non-test phase and run generic implementation"},
      {"label": "Cancel", "description": "Stop without changing phase status"}
    ],
    "multiSelect": false
  }]
}
```

For a test-like phase where expected routing includes a `test` delegate, omit `Run generic override` from this question.

## Refresh Behavior

- Insert or replace `## Delegate Skills` after `## Key Insights`.
- Detect the section by scanning for `^## Delegate Skills$`; replace from that heading until the next `^## ` heading or EOF.
- Re-read the phase file, then continue.

## Generic Override Behavior

- Generic override is available only when the phase is not test-like.
- Log: `User chose generic implementation despite routing delegates: {expected delegates}`.
- For any test-like phase where expected routing includes a `test` delegate, require refresh or cancel; no inline generic unit-test implementation.
