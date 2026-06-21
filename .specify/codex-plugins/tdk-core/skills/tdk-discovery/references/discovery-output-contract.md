# tdk-discovery Output Contract

This reference is the single source of truth for `/tdk-discovery` Markdown
artifacts.

Discovery is epic-level context only. It prepares problem, persona, and MVP
context before `/tdk-specify`; it does not produce requirements, specifications,
plans, tasks, code, or tracker issues.

## Allowed Output Shape

```text
{FEATURE_DIR}/discovery/
  problem.md
  personas.md
  mvp-scope.md
  index.md
```

No other discovery output is allowed.

## Shared Frontmatter

Each artifact begins with:

```yaml
---
source_epic: "<task-id>"
artifact_type: "<problem|personas|mvp-scope|index>"
status: draft
created: "<ISO-8601 timestamp>"
---
```

## problem.md

Purpose: define the epic-level problem, affected users, current pain, trigger,
and known constraints.

Required sections:

- `# Problem Discovery`
- `## Problem`
- `## Affected Users`
- `## Current Alternatives`
- `## Constraints`
- `## Open Questions`

## personas.md

Purpose: capture epic-local actor context and differences in goals, constraints,
and usage frequency.

Required sections:

- `# Persona Discovery`
- `## Primary Personas`
- `## Secondary Personas`
- `## Jobs To Be Done`
- `## Assumptions`
- `## Open Questions`

## mvp-scope.md

Purpose: make the smallest credible epic boundary explicit before the PRD step.

Required sections:

- `# MVP Scope Discovery`
- `## In Scope Candidates`
- `## Out Of Scope Candidates`
- `## MVP Cutline`
- `## Risks`
- `## Open Questions`

## index.md

Purpose: manifest and navigation file for the discovery set.

Required sections:

- `# Discovery Index`
- `## Artifact Manifest`
- `## Summary`
- `## Product-level signals`
- `## Ready For Specify`

`Product-level signals` is a candidate checklist. It may capture durable signal
candidates for human review, but it is not authority. Product-level facts live
in `product-context.md` and are updated only through `tdk-constitution`.

## Forbidden outputs

Discovery MUST NOT create or emit:

- Requirement or success IDs. Only `tdk-specify` mints `UR-*`, `FR-*`, and `SC-*`.
- `spec.md`, `plan.md`, phase files, task files, code, or tracker records.
- `discovery_ref` or any new machine-link field beyond existing downstream
  conventions.
- Competitor or product-wide market/business-model files.
- GitHub, GitLab, Backlog, or other tracker commands.

Discovery remains tracker-neutral.
