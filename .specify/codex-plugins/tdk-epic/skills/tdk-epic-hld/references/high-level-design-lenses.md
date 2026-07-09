# High-Level Design Lenses

Use these lenses before generating `/tdk-epic-hld` artifacts. They are prompts
for parent epic design enrichment, not new requirement sources.

Every output note must trace to an epic PRD artifact, an epic PRD section, or a
slice key from `epic-prd/slice-map.md`. Originated design detail must be marked
`assumed`. Do not mint or cite `UR-*`, `FR-*`, `SC-*`, or `FS-*`; child specs own
formal requirements.

## C4 / arc42 altitude

- Identify the parent epic system boundary implied by the epic PRD.
- Map actors, external systems, and major containers at approval-level detail only.
- Keep module notes epic-scoped; do not propose repository topology or runtime config.
- Record unknown boundaries as assumptions to validate in child specs.

## Quality attribute scenarios

- Translate epic outcomes into scenario form when useful: stimulus, response, measure.
- Check latency, reliability, scalability, availability, accessibility, and maintainability only when supported by epic PRD context.
- Do not invent numeric targets; keep unknown targets as `assumed`.
- Put decomposition-relevant implications in `requirement-overview.md` or `project-and-technical-overview.md`.

## Security posture

- Check authentication, authorization, data exposure, auditability, abuse paths, and recovery expectations across slices.
- Prefer ASVS-inspired questions at epic boundary level; do not create a full threat model unless requested.
- Mark controls as `assumed` unless the epic PRD states them.
- Route unresolved controls to `decisions-and-risks.md` as risks or child-spec follow-ups.

## Data lifecycle / API contract

- Identify key entities, ownership, creation/update/delete flows, retention, and external dependency handoffs across slices.
- Surface API contract assumptions only at boundary level: producer, consumer, payload purpose, and failure behavior.
- Do not invent concrete tables, endpoints, message topics, or schemas unless the epic PRD names them.
- Put lifecycle notes in `data-flow.md`.

## UX journey / screen-flow

- Map parent epic journeys from epic PRD personas, jobs, outcomes, and slice touchpoints.
- Identify screens, states, branch conditions, error paths, empty states, and recovery paths that affect slice boundaries.
- Keep UI descriptions product-flow level; do not create component specs or visual design systems.
- Put journey notes in `screen-flow.md`.

## Operability

- Check logging, monitoring, alerting, rollout, rollback, migration, support, and ownership assumptions across slices.
- Keep operational notes proportional to epic risk.
- Do not create deployment plans or implementation tasks.
- Put operational assumptions in `project-and-technical-overview.md` and risks in `decisions-and-risks.md`.
