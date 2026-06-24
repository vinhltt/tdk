# Config-Only Brownfield Workflow

Use this workflow for `--config-only`.

## Evidence Scope

Inspect only:

- `.specify/.specify.json` and adjacent TDK config/state files;
- `.specify/configurations/**` files relevant to topology or docs routing;
- docs paths referenced by config;
- topology proposal files referenced by config;
- install or harness state needed to explain stale/missing config.

Avoid broad source-tree scans unless config points to missing paths that must be
verified.

## Steps

1. Resolve and validate repo root.
2. Load the evidence taxonomy, output contract, template, and this workflow.
3. Confirm `.specify/` exists. If absent, stop with setup guidance.
4. Inspect config state, topology readiness, docs references, and stale/missing paths.
5. Record observed config evidence separately from inferred topology recommendations.
6. Ask only config/topology-readiness clarification questions.
7. Write the report and recommend the safest config next route.

## Route Rules

- Prefer `/tdk-workspace-topology-apply --dry-run --reconcile` when config drift or missing topology evidence is present.
- Mention `/tdk-architecture-advisor --recover-existing` only when the user explicitly asks for architecture recovery beyond config readiness.
- Do not recommend docs generation unless config evidence is present enough to identify docs targets.
- Do not ask product questions or source ownership questions unless config evidence directly conflicts.
