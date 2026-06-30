# Full Greenfield Workflow

Use this workflow for default mode and `--full`.

## Steps

1. Resolve the brief and any workspace-local Markdown input.
2. Load the taxonomy, output contract, and template.
3. Classify the project shape from explicit evidence first, then assumptions.
4. Run a project-inception interview:
   - ask at most 3 questions per round;
   - cover every critical taxonomy category;
   - continue until critical categories are clear or the user explicitly accepts unresolved gaps;
   - challenge broad scope when a simpler first route is safer.
5. Assign readiness:
   - `ready` when all critical categories have concrete answers;
   - `ready-with-assumptions` when gaps are low-risk and explicit;
   - `not-ready` when downstream work would be speculative.
6. Write `project-inception.md` from the template.
7. Recommend a next route without executing it.

## Route Rules

- Recommend `/tdk-constitution --init` when project principles or product context do not exist.
- Recommend `/tdk-discovery` when the work is epic/product-sized and product context needs depth.
- Recommend `/tdk-architecture-advisor <project-inception.md>` when inception evidence is ready for a project-level architecture decision.
- Recommend `/tdk-boundary-map <architecture-decision.md>` after architecture advisor evidence is reviewed.
- Recommend `/tdk-specify` only when the user has a concrete feature-sized objective.
- Recommend `/tdk-workflow-config-apply` only after boundary-map proposal artifacts are reviewed. The skill previews first and asks before applying; greenfield no-config creation stays a separate seed/migration step.
- Do not route directly to high-level design before specification and clarification.

## Stop Conditions

Stop with `not-ready` guidance when project intent, users/workflows, critical risks,
or success metrics remain missing after reasonable questioning and the user does not
accept assumptions.
