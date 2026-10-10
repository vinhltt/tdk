# Delegate Routing Proposal Format

`delegate-routing-proposal.json` is a transient review artifact derived from approved intent and reconciled outcomes, including runs that create no new files. It is not the durable route store.

Write proposals beside the approved automation recommendation:

```text
.specify/configurations/automation-recommendations/sub-workspaces/<name>/delegate-routing-proposal.json
```

Schema:

```json
{
  "version": 1,
  "sourceRecommendation": ".specify/configurations/automation-recommendations/sub-workspaces/backend/automation-recommendation.md",
  "entries": [
    {
      "subWorkspace": "backend",
      "domain": "test",
      "delegates": ["/backend-unit-test-skill", "@backend-test-agent"],
      "operation": "register",
      "reason": "Backend docs identify a separate test stack."
    }
  ]
}
```

Rules:

- `entries` must be non-empty.
- `subWorkspace` should be `global` or a `subWorkspaces[].name` value from config. Unknown sections produce review warnings and must be verified before registration.
- `domain` is the route key used by planning workflows, such as `research`, `implement`, `test`, `database`, or `design`. Domains outside that auto-detected set produce a warning, because no lookup resolves them.
- `delegates` must contain at least one delegate. A delegate is a skill name (`/` prefix preferred; a missing `/` is added) or an agent name (`@` prefix, kept verbatim).
- `operation` is optional and defaults to `register`.
- The proposal does not authorize route mutation by itself. Obtain `approvalDigest` from `diff`, approve its operations/reasons/warnings, then call `register --approval <approvalDigest> --yes`.
- The digest binds canonical proposal JSON plus route bytes; edits to either require a fresh diff and approval. Keep schema v1 unchanged; do not add an approval field to the proposal.
- Keep provenance in the single-line `reason`: keyword-derived entries retain `derived`; explicit executor swaps say `replaces @old (explicit)`; user-confirmed unresolved delegates say `unresolved-artifact`.
- Preserve stable existing skill union, but an approved `create @new` / `reuse @new` executor selection replaces a different old executor instead of unioning them. Preview the exact final list; the old definition stays untouched.
- `verify` has `scope: "route-equality"`: successful equality is not source/runtime/phase readiness.

## Operation For Inferred Entries

Inferred entries — anything a recommendation derived rather than a human dictating an exact add or update — must use `operation: "register"`.

Reason: the operation is asserted against what the route file actually contains. Declaring `add` throws when the section/domain already has a route, which is exactly what happens when an inferred entry restates a route the user already has. `register` is the legitimate escape hatch: it accepts whichever operation the file implies (`add`, `update`, or `noop`) without asserting one up front.

Reserve `add` and `update` for entries where the recommendation intentionally asserts that the route is new, or that it already exists and must change.

Domain inference is owned by `routing phase-delegates domains --text "<purpose + trigger>"`, not a copied prose keyword table.
For artifact eligibility, kind filtering, and intent precedence, use the scaffold skill's `references/delegate-routing-proposal-format.md`; for executor changes, use `update-and-conflict-policy.md`.
