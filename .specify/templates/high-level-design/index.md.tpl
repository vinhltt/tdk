---
task_id: "{TASK_ID}"
source_epic_prd: "../epic-prd/index.md"
artifact_type: "high-level-design"
mode: "epic"
status: "draft"
---

# Epic High-Level Design: {FEATURE_NAME}

<!--
  index.md is the authoritative manifest for this parent epic HLD set.
  Consumers (e.g. /tdk-task-breakdown) read the artifacts listed here,
  not by globbing the directory.
-->

## Source

- Epic PRD Index: `../epic-prd/index.md`
- Epic PRD: `../epic-prd/prd.md`
- Slice Map: `../epic-prd/slice-map.md`
- Open Questions: `../epic-prd/open-questions.md`
- Blocking Questions: `None`

## Artifact Map

| Artifact | Purpose | Primary Epic Sources |
|----------|---------|----------------------|
| [requirement-overview.md](./requirement-overview.md) | Product objective, scope, personas, slice source map | `prd.md`, `slice-map.md` |
| [project-and-technical-overview.md](./project-and-technical-overview.md) | System context, slice boundaries, dependency map, interface assumptions | `slice-map.md`, HLD lenses |
| [data-flow.md](./data-flow.md) | Cross-slice data/entity lifecycle assumptions | `prd.md`, `slice-map.md` |
| [screen-flow.md](./screen-flow.md) | Epic-level journeys and slice touchpoints | `prd.md`, `slice-map.md` |
| [decisions-and-risks.md](./decisions-and-risks.md) | Slice decisions, rejected splits/merges, risks, assumptions, follow-ups | `prd.md`, `open-questions.md`, HLD lenses |

## Breakdown Readiness Map

| Slice key | Boundary | Depends on | Shared design concern | Suggested child spec seed impact |
|---|---|---|---|---|
| {slice-key} | {boundary} | {dependencies} | {concern} | {seed impact} |

## Readiness Gate

<!-- All boxes must be checked before this HLD feeds /tdk-task-breakdown. -->

- [ ] Epic PRD artifacts exist
- [ ] `../epic-prd/open-questions.md` has no blocking questions
- [ ] `../epic-prd/slice-map.md` has no catch-all slice
- [ ] Every artifact traces claims to epic PRD sections or slice keys
- [ ] No `UR-*`, `FR-*`, `SC-*`, or `FS-*` identifiers are minted
- [ ] Ready for `/tdk-task-breakdown`
