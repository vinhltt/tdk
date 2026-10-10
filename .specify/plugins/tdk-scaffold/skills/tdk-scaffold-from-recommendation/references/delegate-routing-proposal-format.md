# Scaffold Routing Proposal Format

Build a proposal from approved routing intent plus reconciled artifact outcomes, not the number of new files.
Routing Suggestions and Executor Decisions can produce a reuse-only or route-only proposal beside the approved recommendation:

```text
delegate-routing-proposal.json
```

Keep schema v1 unchanged:

```json
{
  "version": 1,
  "sourceRecommendation": "<approved automation-recommendation.md path>",
  "entries": [
    {
      "subWorkspace": "<sub_workspace frontmatter value, or global>",
      "domain": "test",
      "delegates": ["/recommended-skill", "@recommended-agent"],
      "operation": "register",
      "reason": "<single-line evidence-backed reason>"
    }
  ]
}
```

Write only after run-level reconciliation approval. `--dry-run` previews the same JSON/path with no writes.
Never write the durable `delegate-routing.md`; proposal → diff → review → `register --approval <approvalDigest> --yes` → verify is separate.

## Intent And Outcomes

1. Take explicit `subWorkspace`, `domain`, ordered Toolset, and `create @name` / `reuse @name` executor selection from applicable approved Executor Decisions.
   Routing Suggestions carry their Why as the entry reason; when both exist, they must agree with the decision.
   A contradiction stays unresolved until clarified; keyword inference cannot override an explicit domain or `no agent`.
2. Include approved Routing Suggestions even with zero artifact writes.
   Include decisions with delegates even when no suggestion repeats them.
   For each approved recommended delegate not covered by either, derive entries using Domain Inference below.
   Coverage means the normalized token appears in approved intent, regardless of its section/domain.
3. Associate **every** intended delegate with its reconciliation outcome.
   For route-only delegates without an Artifacts row, read their canonical definitions and runtime bindings without inventing a create/patch action.
   `created | reused | patched` can be proposed normally.
   Missing/ambiguous source, `kept-unchanged` drift, and `kept-unresolved` require explicit grouped user confirmation to include each delegate.
   Default is exclude; confirmed inclusion adds `unresolved-artifact: <delegate> (<reason>)` to the entry reason and never upgrades readiness.
   Runtime-only agents remain `runtime-only; ownership ambiguous`, never written/promoted by scaffold.
4. Filter new intent and derived delegates by `--skills-only` / `--agents-only`.
   Preserve existing out-of-scope route tokens unchanged because register replaces a whole line; do not introduce, reconcile, or replace out-of-scope delegates.
   An empty filtered entry is omitted; no remaining routable intent means no proposal, not an invalid empty `entries` array.

## Delegate Tokens

- Skills are `/<skill-name>`; normalization adds a missing `/`.
- Agents are `@<agent-name>`; the prefix is kept verbatim and is never rewritten to `/`.
- Both match `^[/@][A-Za-z0-9][A-Za-z0-9._:-]*$` after normalization.
- Keep skills before the selected executor, with stable deduplication within each group.

## Domain Inference

The deterministic routing resolver owns the only keyword table. Run its domains action with the actual combined Purpose/Trigger text:

```bash
bun "<consumer-root>/.specify/scripts/ts/src/index.ts" routing phase-delegates domains --text "<purpose + trigger>"
```

Resolve and shell-quote the absolute consumer CLI and text; parse its `ok` / ordered `domains` JSON result.
Emit a separate entry for each returned domain in resolver order; do not infer domains from a second prose table.
If the resolver is unavailable or errors, report that exact prerequisite; keep derived entries unresolved instead of guessing.
Use frontmatter `sub_workspace`, or `global` when absent.
Keep provenance in `reason`: `Derived by scaffold from purpose; domain inferred from routing phase-delegates domains - verify before register.`
The automatic set is `research|implement|test|database|design`; another explicit domain needs approved rationale and its lookup warning reviewed.

## Reconcile Each Route

Combine entries for the same case-insensitive `<subWorkspace>/<domain>`; preserve first-seen ordering.
Use the skill's exact case-sensitive name and the first matching existing route, as the routing CLI does.

- **Skills:** union existing skills, suggested/decision skills, then uncovered derived skills; deduplicate in that order.
  Register replaces the whole line, so omitting an existing skill would silently delete it.
- **Explicit executor replacement:** when an approved decision selects `create @new` or `reuse @new` and the current route has a different `@old`,
  replace the old executor token(s) with the selected executor, retaining the skill union.
  Append `replaces @old (explicit)` for each replaced executor to `reason`. Never produce `@old, @new` by union.
  Preserve the old agent file. Diff must show `from` → `to`; only its reviewed approval digest authorizes registration.
- **No executor replacement decision:** do not union a new agent with a different existing executor.
  Surface the conflict for an explicit selection; existing agents otherwise stay unchanged.
  `no agent` never invents an executor or silently removes a current one: an intended removal must be explicit and reviewed.
  Multiple executor selections for one route require clarification; do not dispatch both by accident.
- **Unknown route state:** an unreadable route/config cannot be treated as empty.
  Preview intent with the warning, but withhold runnable registration until the route can be read and the proposal recomposed/reviewed.
- **Unresolved replacement:** if the selected new executor is excluded for lack of confirmation, do not silently retain the old executor under that new decision.
  Omit the affected entry and report the unresolved executor choice.

## Field Rules

- `operation` is always `"register"`: `add` is rejected once the route already exists; register permits `add`, `update`, or `noop` based on current route bytes.
- `reason` is one non-empty line without CR/LF; flatten Why, derived provenance, replacement, and unresolved-artifact notes into that field.
  Unknown fields such as `source: "derived"` are discarded by validation, so they cannot carry review evidence.
- Proposal updates need preview/approval; a kept older proposal is not evidence of this run's approved intent.
- Review every operation/reason/warning, derived domain, and intentional drop before registration.
- Never manufacture `approvalDigest`: obtain it from `routing delegate diff`. If proposal/route bytes change, re-diff and obtain fresh approval.
- `verify` with `scope: "route-equality"` checks the proposal's route lists only; it cannot prove installation, loading, or current phase delegates.
