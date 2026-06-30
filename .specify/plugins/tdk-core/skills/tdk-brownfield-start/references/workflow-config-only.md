# Config-Only Brownfield Workflow

Use this workflow for `--config-only`.

## Evidence Scope

Inspect only:

- `.specify/.specify.json` and adjacent TDK config/state files;
- `.specify/configurations/**` files relevant to layout or docs routing;
- docs paths referenced by config;
- layout proposal files referenced by config;
- install or harness state needed to explain stale/missing config.

Avoid broad source-tree scans unless config points to missing paths that must be
verified.

## Steps

1. Resolve and validate repo root.
2. Load the evidence taxonomy, output contract, template, and this workflow.
3. Confirm `.specify/` exists. If absent, stop with setup guidance.
4. Inspect config state, layout readiness, docs references, and stale/missing paths.
5. Record observed config evidence separately from inferred layout recommendations.
6. Ask only config/layout-readiness clarification questions.
7. Write the report and recommend the safest config next route.

## Route Rules

- Prefer `/tdk-workflow-config-apply --reconcile` when config drift or missing layout evidence is present. Apply remains a separate `/tdk-workflow-config-apply` step after review.
- Mention `/tdk-architecture-advisor --recover-existing` only when the user explicitly asks for architecture recovery beyond config readiness.
- Do not recommend docs generation unless config evidence is present enough to identify docs targets.
- Do not ask product questions or source ownership questions unless config evidence directly conflicts.
