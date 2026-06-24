# Unknown Architecture Advisor Workflow

Use this workflow for `--unknown` or when evidence is too weak for standard or
recovery mode.

## Steps

1. Load the output contract, evaluation framework, templates, and this workflow.
2. Classify the available input as greenfield brief, brownfield repo evidence,
   mixed evidence, or insufficient evidence.
3. List missing evidence needed for a decision.
4. Record assumptions only when explicitly accepted or clearly marked weak.
5. Do not make a strong architecture decision.
6. Recommend one safest next route.
7. Write a short readiness note only if it helps the user continue safely.

## Next Route Rules

- Recommend `/tdk-greenfield-start` for new-project briefs missing inception
  evidence.
- Recommend `/tdk-brownfield-start` for existing repos without onboarding
  evidence.
- Recommend `/tdk-scout` when repo structure, package ownership, or file roles are
  unclear.
- Recommend `/tdk-discovery` when product context is missing.
- Recommend standard advisor mode only when evidence is sufficient to evaluate
  options and rejected options.

## Stop Conditions

Stop without writing when the only available input is unsafe, secret-like,
outside the workspace, or too vague to produce useful readiness guidance.
