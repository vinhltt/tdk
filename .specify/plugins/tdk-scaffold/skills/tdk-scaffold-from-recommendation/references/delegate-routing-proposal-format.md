# Scaffold Routing Proposal Format

When an approved recommendation produces at least one scaffolded skill or agent, scaffold a review artifact beside the recommendation. Entries come from `## Routing Suggestions` when that section exists, and are derived from each skill's or agent's Purpose/Trigger otherwise:

```text
delegate-routing-proposal.json
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
      "delegates": ["/recommended-skill", "@recommended-agent"],
      "operation": "register",
      "reason": "<short evidence-backed reason>"
    }
  ]
}
```

Scaffold may write this proposal only after the recommendation is approved. It must not write `delegate-routing.md`.

## Delegate Tokens

`delegates` holds two kinds of token, and both kinds may appear in the same array:

- A **skill** is written `/<skill-name>`. A missing leading `/` is added during normalization.
- An **agent** is written `@<agent-name>`. The `@` prefix is kept verbatim and is never rewritten to `/`.

Both must match `^[/@][A-Za-z0-9][A-Za-z0-9._:-]*$` after normalization; anything else is rejected by the validator. Write a scaffolded agent as `@<agent-name>` so it reaches the route file through the same `diff` → `register --yes` path as a skill.

## Domain Inference

Derive `domain` from the skill's or agent's `**Purpose**` and `**Trigger**` with the same keywords the lookups use:

```text
test/UT/spec              -> test
database/schema/migration -> database
UI/component/screen/mockup -> design, then implement
API/endpoint/service      -> implement
research/exploration      -> research
fallback                  -> implement
```

`domain` holds a single token, so when the table yields two domains — the UI row — emit one entry per domain in that order.

Keep this table in step with its two sources: `tdk-plan/references/design-phase.md:151-158` and `tdk-implement/references/routing-preflight.md:34`. Inferring with a different table routes the delegate into a domain no lookup ever queries — a silent failure.

`domain` should stay inside `research|implement|test|database|design`. The field is freeform, so a value outside that set passes the validator and then dies unnoticed at lookup time.

## Field Rules

- `operation` is always `"register"`: `add` is rejected once the route already exists, so `register` is the only operation safe for both new entries and unioned ones.
- `reason` must be a single line with no newline. It is the only field that both survives the validator and shows up in `diff` output; unknown fields such as `source: "derived"` are dropped silently.
