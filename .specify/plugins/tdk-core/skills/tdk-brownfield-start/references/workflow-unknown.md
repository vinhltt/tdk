# Unknown Brownfield Workflow

Use this workflow for `--unknown`.

## Purpose

Classify an unfamiliar existing repository using high-confidence signals and stop
with one evidence-backed next route.

## Steps

1. Resolve and validate repo root.
2. Load the evidence taxonomy, output contract, template, and this workflow.
3. Confirm `.specify/` exists. If absent, stop with setup guidance.
4. Inspect a minimal set of high-signal files:
   - top-level manifests and lockfiles;
   - top-level README;
   - CI/deployment config names;
   - `.specify` config state.
5. Classify repo shape from direct evidence only.
6. Set confidence and unresolved repo questions.
7. Write the report.
8. Recommend exactly one next route.

## Recommendation Rules

- If repo evidence is weak, recommend `tdk-scout` and stop.
- If `.specify` config conflicts with repo shape, recommend topology dry-run reconcile.
- If repo shape is clear but product intent is missing, recommend product discovery as a later route.
- Do not compose a multi-command chain in unknown mode.
