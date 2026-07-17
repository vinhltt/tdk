# Standard Architecture Advisor Workflow

Use this workflow for default mode.

## Evidence Scope

Prefer already-produced TDK evidence:

- `project-inception.md`
- `brownfield-onboarding.md` when present as context only
- discovery reports
- feature specs when project-level intent can be inferred safely
- scout reports
- README and project docs

Read bounded snippets only. Refuse or redact secret-like sources before notes or
report text.

## Steps

1. Load the output contract, evaluation framework, templates, and this workflow.
2. Summarize evidence inputs with fact/inference/assumption labels.
3. Identify non-negotiable constraints and missing constraints.
4. Write at least three architecture options unless the evidence supports fewer;
   explain why if fewer are safe.
5. Evaluate options against quality attribute scenarios, trust boundaries, data
   classification, team ownership, delivery complexity, and operational burden.
6. Reject at least two options with concrete evidence-based reasons.
7. Pick a recommendation only when confidence and assumptions are explicit.
8. Write `architecture-options.md`.
9. Write `architecture-decision.md` every standard run. If the recommendation is
   not strong enough to accept, set `## Status` to `Deferred`, state that no
   architecture decision is accepted yet, and record missing evidence in
   unresolved questions and follow-up work.
10. Recommend next routes without taking them.

## Route Rules

- Recommend `/tdk-constitution --init` when principles or product context are
  missing.
- Recommend `/tdk-discovery` when product/user/workflow context is too shallow.
- Recommend `/tdk-architecture-advisor --unknown` when architecture evidence is
  insufficient for a decision.
- Recommend `/tdk-workspace-layout-propose <architecture-decision.md>` only after
  architecture assumptions are explicit enough to review.
- Do not route directly to feature HLD; HLD remains after `/tdk-specify` and
  `/tdk-clarify`.

## Stop Conditions

Write a deferred `architecture-decision.md` and stop before accepted-decision
language when critical constraints, data sensitivity, runtime environment,
ownership, or core workflows are unknown and cannot be recorded as accepted
assumptions.
