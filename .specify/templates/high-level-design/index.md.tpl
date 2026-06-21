---
task_id: "{TASK_ID}"
source_spec: "../spec.md"
artifact_type: "high-level-design"
mode: "greenfield"
status: "draft"
---

# High-Level Design: {FEATURE_NAME}

<!--
  index.md is the authoritative manifest for this HLD set.
  Consumers (e.g. /tdk-task-breakdown) read the artifacts listed here,
  not by globbing the directory.
-->

## Source

- Spec: `../spec.md`
- Unresolved Questions: `None`

## Artifact Map

| Artifact | Purpose | Primary Spec Sources |
|----------|---------|----------------------|
| [requirement-overview.md](./requirement-overview.md) | Problem, actors, scope, requirement map, non-functional goals | §1, §2, §5, §6, §7 |
| [project-and-technical-overview.md](./project-and-technical-overview.md) | System context, module impact, technical assumptions, integration, security | §3 + originated design detail |
| [data-flow.md](./data-flow.md) | Key entities, read/write flows, external dependencies, state | §6 Key Entities, §6 FR-* |
| [screen-flow.md](./screen-flow.md) | Primary journeys, screen list, step table, branch conditions | §5 acceptance + journeys |
| [decisions-and-risks.md](./decisions-and-risks.md) | Decisions, rejected alternatives, risks, assumptions, follow-ups | §4, §8 |

## Readiness Gate

<!-- All boxes must be checked before this HLD feeds /tdk-task-breakdown. -->

- [ ] `../spec.md` exists and `## 9. Unresolved Questions` is `None`
- [ ] Every artifact cites only `UR-*`, `FR-*`, or `SC-*` from the spec
- [ ] Originated design detail is marked `assumed`
- [ ] No implementation file paths invented beyond what the spec states
- [ ] Ready for `/tdk-task-breakdown`
