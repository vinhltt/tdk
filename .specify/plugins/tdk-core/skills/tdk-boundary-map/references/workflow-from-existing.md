# From Existing Boundary Map Workflow

Use this workflow for `--from-existing`.

## Evidence Scope

Inspect the current repo only enough to propose boundaries safely:

- `brownfield-onboarding.md`
- `architecture-recovery.md`
- scout reports
- package/workspace manifests
- README and architecture docs
- bounded source-tree layout summaries
- current `.specify` state when relevant

Do not read secret-like files. Redact sensitive values before proposal text.

## Steps

1. Load the output contract, taxonomy/runtime projection reference, templates,
   and this workflow.
2. Separate observed current-state boundaries from desired-state deltas.
3. Classify confidence for every observed sub-workspace and module.
4. Put observed real folders or packages only in `workspace-topology.json` by
   default.
5. Keep desired-state deltas stay in `workspace-topology.md` until the user
   explicitly accepts them as current topology.
6. Record ownership, dependency direction, and next route as report-only fields.
7. Write `workspace-topology.md` and `workspace-topology.json` when observed
   evidence is parser-safe.
8. Recommend `/tdk-workflow-config-apply --reconcile` only after observed JSON
   and unresolved questions are reviewed. Reconcile is report-only; normal
   apply uses `/tdk-workflow-config-apply` after the proposal is accepted.

## Brownfield Rules

- JSON must not invent unobserved future folders by default.
- Current state and desired state must stay in separate markdown sections.
- Config drift, package ambiguity, or missing ownership should lower confidence
  instead of strengthening JSON.
- Broad refactors, source moves, and enforcement policies remain out of scope.

## Stop Conditions

Write markdown readiness guidance and skip JSON when repo root is unsafe,
observed boundaries are not parser-safe, secret-like evidence cannot be redacted,
or topology would depend only on weak naming inference.
