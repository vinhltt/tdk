# Standard Boundary Map Workflow

Use this workflow for default mode.

## Evidence Scope

Prefer already-produced TDK evidence:

- `architecture-decision.md`
- `architecture-options.md`
- `project-inception.md`
- `brownfield-onboarding.md` when present as context only
- discovery reports or feature specs when project-level boundaries are clear
- scout reports
- README and architecture docs

Read bounded snippets only. Refuse or redact secret-like sources before notes or
proposal text.

## Steps

1. Load the output contract, taxonomy/runtime projection reference, templates,
   and this workflow.
2. Summarize evidence inputs with fact/inference/assumption labels.
3. Identify the architecture source: accepted decision, deferred decision,
   recovery proposal, or explicit user-provided constraints.
4. Map C4 containers, DDD bounded contexts, packages, or directories to proposed
   `subWorkspaces[]` when evidence supports independent ownership or lifecycle.
5. Map internal components to `modules[]` when they belong inside one
   sub-workspace.
6. Mark `boundaryType`, `owner`, `contracts`, `allowedDependencies`, and
   `routing` as report-only.
7. Write `workspace-topology.md` and `workspace-topology.json`.
8. Recommend `/tdk-workspace-topology-apply --dry-run` only when unresolved
   questions do not block parser-safe review.

## Route Rules

- Recommend `/tdk-architecture-advisor` when architecture evidence is missing.
- Recommend `/tdk-boundary-map --unknown` when topology evidence is too weak.
- Recommend `/tdk-scout` when folder/package evidence is unclear.
- Recommend `/tdk-workspace-topology-apply --dry-run` only as a later preview
  route after proposal review.

## Stop Conditions

Write markdown readiness guidance and skip JSON when critical architecture,
ownership, deployment, path, or module-boundary evidence is missing and cannot be
recorded as an explicit assumption.
