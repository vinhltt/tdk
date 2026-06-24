# Recover Existing Architecture Workflow

Use this workflow for `--recover-existing`.

## Evidence Scope

Inspect existing repo and onboarding evidence only enough to describe current
architecture safely:

- `brownfield-onboarding.md`
- scout reports
- package/workspace manifests
- README and architecture docs
- bounded source-tree layout summaries
- deployment, CI, and runtime hints
- current `.specify` state when relevant

Do not read secret-like files. Redact sensitive values before report text.

## Steps

1. Load the output contract, evaluation framework, templates, and this workflow.
2. Separate as-is facts from desired-state recommendations.
3. Classify confidence for every important as-is claim.
4. Identify trust boundaries, data classification, ownership, and runtime
   boundaries in the current repo.
5. Record architecture drift, missing docs, config mismatch, or unclear ownership
   as risks instead of silently fixing them.
6. Describe a desired architecture only as a proposal with assumptions.
7. Write `architecture-recovery.md` by default.
8. Write or update `architecture-decision.md` only after explicit user
   confirmation.
9. Recommend brownfield-safe deltas and next routes without changing source,
   topology, or runtime config.

## Recovery Rules

- Never present a refactor, source move, config change, or topology change as
  completed work.
- Keep current state and desired state in separate sections.
- Prefer incremental deltas over large rewrites.
- Treat broad distribution changes as high risk unless current operations and
  team ownership justify them.
- If evidence is weak, lower confidence instead of strengthening prose.

## Route Rules

- Recommend `/tdk-scout --scope <repo-root> --task-hint "brownfield architecture recovery"` when repo boundaries are unclear.
- Recommend `/tdk-workspace-topology-apply --dry-run --reconcile` only as a later
  preview route after recovery findings are reviewed.
- Recommend `/tdk-sub-workspace-docs --all` only when config evidence is enough
  to identify docs targets.

## Stop Conditions

Stop or produce only unresolved-question guidance when secret-like evidence cannot
be safely redacted, repo root is unsafe, current architecture cannot be described
from evidence, or desired state depends on business decisions not present in the
inputs.
