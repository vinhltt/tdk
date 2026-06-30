# Full Brownfield Workflow

Use this workflow for default mode and `--full`.

## Steps

1. Resolve and validate repo root inside the workspace.
2. Load the evidence taxonomy, output contract, template, and this workflow.
3. Confirm `.specify/` exists. If absent, stop with setup guidance and do not create runtime config.
4. Collect bounded observe-first evidence:
   - repo layout and workspace/package markers;
   - package manager, framework, and language signals;
   - scripts, commands, docs, tests, and CI;
   - deployment/runtime hints;
   - data/API boundary signals;
   - current `.specify` state and topology candidates.
5. Prefer command/config evidence over naming inference.
6. Ask the user only about evidence conflicts, missing safe context, or low-confidence onboarding decisions.
7. Write `brownfield-onboarding.md` from the template.
8. Recommend safe next routes without executing them.

## Route Rules

- Recommend `tdk-scout` when repo boundaries, ownership, or file roles are unclear.
- Recommend `/tdk-architecture-advisor --recover-existing <brownfield-onboarding.md>` after onboarding/scout evidence is ready for architecture recovery.
- Recommend `/tdk-workspace-layout-propose --from-existing <architecture-recovery.md>` after recovery evidence is reviewed.
- Recommend `/tdk-workflow-config-apply --reconcile` only after layout proposal artifacts are reviewed. Reconcile remains report-only; normal apply uses `/tdk-workflow-config-apply` after review.
- Recommend `/tdk-sub-workspace-docs --all` only after config evidence exists or topology dry-run is accepted later.
- Recommend product discovery only as a later route when product intent is missing.

## Stop Conditions

Set readiness to `not-ready` when repo root is unsafe, `.specify/` is absent,
secret-like evidence cannot be safely redacted, or layout recommendations would
depend only on weak naming inference.
