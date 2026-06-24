# Inception Question Taxonomy

Use this taxonomy to decide what must be clear before writing
`project-inception.md`. Keep questions project-level. Route product details to
later discovery and feature details to later specification/clarification.

## Critical Categories

| Category | Must Establish |
|---|---|
| Project intent and non-goals | The problem, desired outcome, and at least one explicit non-goal. |
| Target users and workflows | Primary users and the 1-3 workflows the first version must support. |
| Domain/data | Core domain objects, data ownership, data sensitivity, and expected lifecycle. |
| Integrations | External systems, import/export paths, APIs, auth providers, or payment/notification dependencies. |
| Quality attributes | Performance, reliability, accessibility, localization, observability, or maintainability expectations that would affect architecture. |
| Deployment/ops | Hosting target, runtime environment, release cadence, operational ownership, and backup/recovery expectations. |
| Risk/compliance/security | Privacy, regulated data, audit needs, abuse cases, threat assumptions, or approval constraints. |
| Topology assumptions | Single app, modular monolith, monorepo, multi-service, library/tooling, docs site, or unknown with evidence. |
| Success metrics | Concrete success signal for the inception slice or first release. |

## Readiness Rules

- `ready`: all critical categories are clear enough to recommend the next route.
- `ready-with-assumptions`: one or more categories are incomplete, but assumptions are explicit and low-risk enough for a safe next route.
- `not-ready`: missing intent, users/workflows, risk/compliance, topology, or success metrics would make downstream work speculative.

## Question Rules

- Ask at most 3 questions per round.
- Prefer multiple-choice or short-answer questions when they reduce ambiguity.
- Challenge broad or contradictory asks with a simpler route when appropriate.
- Stop asking only when readiness is `ready`, or when the user explicitly accepts listed unresolved gaps.
- Do not ask feature-level acceptance criteria, implementation task, or UI detail questions here.
