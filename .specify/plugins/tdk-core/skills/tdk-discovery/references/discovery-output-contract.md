# tdk-discovery Output Contract

This reference is the single source of truth for `/tdk-discovery` Markdown
artifacts.

Discovery is epic-level context only. It prepares problem, persona, and MVP
context before `/tdk-specify`; it does not produce requirements, specifications,
plans, tasks, code, or tracker issues.

## Allowed Output Shape

```text
{FEATURE_DIR}/index.md
{FEATURE_DIR}/discovery.md
{FEATURE_DIR}/discovery/
  problem.md
  personas.md
  mvp-scope.md
```

No other discovery output is allowed.

## Shared Frontmatter

Each artifact begins with:

```yaml
---
source_epic: "<task-id>"
artifact_type: "<problem|personas|mvp-scope|discovery>"
status: draft
created: "<ISO-8601 timestamp>"
---
```

## Epic Dashboard

`{FEATURE_DIR}/index.md` is the TDK-owned epic dashboard. Discovery creates or
updates generated dashboard sections for current stage, stage manifest links,
readiness, authority boundary, and next command. The discovery stage manifest is
`discovery.md`.

If an existing dashboard has user-edited content inside a generated section the
command would replace, ask for confirmation or require `--force`. In
noninteractive contexts, STOP with guidance instead of overwriting user edits.
User-owned sections outside generated markers are preserved.

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

## discovery.md

Purpose: manifest and navigation file for the discovery set.

Required sections:

- `# Discovery Manifest`
- `## Artifact Manifest`
- `## Summary`
- `## Product-level signals`
- `## Ready For Specify`

`Product-level signals` is a candidate checklist. It may capture durable signal
candidates for human review, but it is not authority. Product-level facts live
in `product-context.md` and are updated only through `tdk-constitution`.

## Allowed In-Section Additions

Within the four required artifacts, the following refine existing sections and are NOT new
outputs:

- MoSCoW tags (`Must` / `Should` / `Could` / `Won't`) inside `## MVP Cutline`.
- Skip-justification notes inside `## Open Questions` recording why something was
  deliberately omitted.
- An advisory, non-blocking readiness checklist inside `## Ready For Specify`.
- Interview alignment notes from optional `--interview`, folded into the relevant
  existing problem, persona, MVP-scope, readiness, or open-question section.

These add no requirement IDs, no new files, and no tracker records. They refine the existing
sections only and do not change the allowed output shape.

## Forbidden outputs

Discovery MUST NOT create or emit:

- Requirement or success IDs. Only `tdk-specify` mints `UR-*`, `FR-*`, and `SC-*`.
- `spec.md`, `plan.md`, phase files, task files, code, or tracker records.
- `discovery_ref` or any new machine-link field beyond existing downstream
  conventions.
- Competitor or product-wide market/business-model files.
- GitHub, GitLab, Backlog, or other tracker commands.

Discovery remains tracker-neutral.

## Legacy Layout Detection

If `discovery/index.md` exists and sibling `discovery.md` is missing, STOP with
`legacy layout detected`. Tell the user to rerun `/tdk-discovery <epic-id> ...`
with `--force` or recreate the test epic. do not auto-migrate old nested
`index.md` content into the new layout.
