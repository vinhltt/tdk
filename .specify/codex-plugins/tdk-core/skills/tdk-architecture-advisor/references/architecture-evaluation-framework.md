# Architecture Evaluation Framework

Use this framework for standard and recovery modes before writing architecture
reports.

## Evidence Model

Classify every material claim as one of:

- `Fact`: directly observed in supplied reports, files, commands, or repository
  structure.
- `Inference`: likely conclusion from package layout, dependencies, naming, or
  repeated conventions.
- `Assumption`: needed to proceed but not proven.
- `Decision`: selected direction with consequences and review criteria.

Assign confidence per claim:

- `High`: direct source or explicit user statement.
- `Medium`: strong correlation from multiple repo or docs signals.
- `Low`: naming/layout inference that needs confirmation.

## Architecture Styles

Evaluate only styles relevant to the evidence. Common candidates:

- single deployable monolith
- layered application
- modular monolith
- service-oriented application
- microservices
- event-driven architecture
- plugin-based architecture
- library/tooling package
- docs or content site

Default toward a monolith, layered app, or modular monolith unless constraints
justify distribution. Distribution needs clear operational, ownership, scaling,
security, or delivery evidence.

## Quality Attributes

Convert constraints into scenarios:

- modifiability
- performance
- availability
- security
- operability
- testability
- compliance and privacy
- delivery complexity
- team ownership and cognitive load

Each scenario should include stimulus, response, and measurable or reviewable
success signal when the evidence supports it.

## Evaluation Gates

Every recommendation must cover:

- user/workflow and product context
- current or expected deployment shape
- data ownership and lifecycle
- integration/API boundaries
- trust boundaries
- data classification
- team ownership
- migration or rollout constraints
- observability and operations
- test strategy
- kill criteria for reversing the decision

## Runtime Config Mapping

The advisor may discuss a broad architecture taxonomy. That taxonomy is not
automatically valid `.specify/.specify.json` runtime config. Record config
mapping only as a note or follow-up. The advisor does not create or update
`.specify/.specify.json` and does not write `workspace-topology.json`.
