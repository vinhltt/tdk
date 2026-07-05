# Plan Skill Routing Proposal Format

`plan-skill-routing-proposal.json` is a transient review artifact. It is not the durable route store.

Write proposals beside the approved automation recommendation:

```text
.specify/configurations/automation-recommendations/sub-workspaces/<name>/plan-skill-routing-proposal.json
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
      "skills": ["/backend-unit-test-skill"],
      "operation": "register",
      "reason": "Backend docs identify a separate test stack."
    }
  ]
}
```

Rules:

- `entries` must be non-empty.
- `subWorkspace` should be `global` or a `subWorkspaces[].name` value from config. Unknown sections produce review warnings and must be verified before registration.
- `domain` is the route key used by planning workflows, such as `research`, `implement`, `test`, `database`, or `design`.
- `skills` must contain user-facing skill names, with `/` prefix preferred.
- `operation` is optional; use `register` unless the recommendation intentionally distinguishes add/update.
- The proposal does not authorize route mutation by itself. It must go through diff and register.
