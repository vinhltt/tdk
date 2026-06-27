# Quick Greenfield Workflow

Use this workflow for `--quick`.

## Screening Round

Ask one concise round covering:

1. Objective: what new project should exist?
2. Users/workflows: who uses it and what is the first workflow?
3. Success metric: what proves the first version is useful?
4. Constraints: deadline, compliance, budget, stack, or platform constraints.
5. Deployment/topology assumptions: expected host and likely repo shape.

If the brief already answers a question, record the answer instead of asking again.

## Steps

1. Resolve the brief and selected mode.
2. Load the taxonomy, output contract, template, and this workflow.
3. Ask the screening round when needed.
4. Classify project shape with evidence and confidence.
5. Record unanswered critical categories as unresolved gaps.
6. Set readiness:
   - `ready` only when screening gives enough evidence for a safe next route;
   - `ready-with-assumptions` when safe assumptions are explicit;
   - `not-ready` when the brief is too vague for routing.
7. Write the report and recommend only low-risk next routes.

## Route Rules

- Prefer `/tdk-constitution --init` for a new project with enough intent but weak product context.
- Prefer `/tdk-discovery` when product/user/workflow details are clearly incomplete.
- Recommend `/tdk-architecture-advisor <project-inception.md>` only when architecture assumptions and unresolved gaps are explicit.
- Recommend topology dry-run first when topology assumptions are explicit; apply requires an existing JSON config and a parsed `planHash`.
- When readiness is `not-ready`, recommend answering unresolved questions or rerunning with `--full`.
