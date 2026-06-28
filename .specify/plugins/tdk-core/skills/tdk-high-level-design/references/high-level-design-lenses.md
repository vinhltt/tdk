# High-Level Design Lenses

Use these lenses before generating `/tdk-high-level-design` artifacts. They are prompts for design enrichment, not new requirement sources.

Every output note must still trace to existing `UR-*`, `FR-*`, or `SC-*` identifiers when requirement-derived. Originated design detail must be marked `assumed`.

## C4 / arc42 altitude

- Identify the system boundary implied by the spec.
- Map actors, external systems, and major containers at approval-level detail only.
- Keep module notes feature-scoped; do not propose repository topology or runtime config.
- Record unknown boundaries as assumptions to validate.

## Quality attribute scenarios

- Translate success criteria into scenario form when useful: stimulus, response, measure.
- Check latency, reliability, scalability, availability, accessibility, and maintainability only when supported by spec context.
- Do not invent numeric targets; keep unknown targets as `assumed`.
- Put requirement-linked implications in `requirement-overview.md` or `project-and-technical-overview.md`.

## Security posture

- Check authentication, authorization, data exposure, auditability, abuse paths, and recovery expectations.
- Prefer ASVS-inspired questions at feature level; do not create a full threat model unless requested.
- Mark controls as `assumed` unless the spec states them.
- Route unresolved controls to `decisions-and-risks.md` as risks or follow-ups.

## Data lifecycle / API contract

- Identify key entities, ownership, creation/update/delete flows, retention, and external dependency handoffs.
- Surface API contract assumptions only at boundary level: producer, consumer, payload purpose, and failure behavior.
- Do not invent concrete tables, endpoints, message topics, or schemas unless the spec names them.
- Put lifecycle notes in `data-flow.md`.

## UX journey / screen-flow

- Map primary journeys from acceptance scenarios and actors.
- Identify screens, states, branch conditions, error paths, empty states, and recovery paths.
- Keep UI descriptions product-flow level; do not create component specs or visual design systems.
- Put journey notes in `screen-flow.md`.

## Operability

- Check logging, monitoring, alerting, rollout, rollback, migration, support, and ownership assumptions.
- Keep operational notes proportional to the feature risk.
- Do not create deployment plans or implementation tasks.
- Put operational assumptions in `project-and-technical-overview.md` and risks in `decisions-and-risks.md`.
