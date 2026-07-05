# Scaffold Routing Proposal Format

When an approved recommendation includes `## Routing Suggestions`, scaffold a review artifact beside the recommendation:

```text
plan-skill-routing-proposal.json
```

Use this shape:

```json
{
  "version": 1,
  "sourceRecommendation": "<approved automation-recommendation.md path>",
  "entries": [
    {
      "subWorkspace": "<sub_workspace frontmatter value>",
      "domain": "test",
      "skills": ["/recommended-skill"],
      "operation": "register",
      "reason": "<short evidence-backed reason>"
    }
  ]
}
```

Scaffold may write this proposal only after the recommendation is approved. It must not write `plan-skill-routing.md`.
