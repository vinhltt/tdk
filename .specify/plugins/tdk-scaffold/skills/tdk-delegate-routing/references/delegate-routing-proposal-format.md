# Delegate Routing Proposal Format

`delegate-routing-proposal.json` is a transient review artifact. It is not the durable route store.

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
- The proposal does not authorize route mutation by itself. It must go through `diff` and `register --yes`.

## Operation For Inferred Entries

Inferred entries — anything a recommendation derived rather than a human dictating an exact add or update — must use `operation: "register"`.

Reason: the operation is asserted against what the route file actually contains. Declaring `add` throws when the section/domain already has a route, which is exactly what happens when an inferred entry restates a route the user already has. `register` is the legitimate escape hatch: it accepts whichever operation the file implies (`add`, `update`, or `noop`) without asserting one up front.

Reserve `add` and `update` for entries where the recommendation intentionally asserts that the route is new, or that it already exists and must change.
