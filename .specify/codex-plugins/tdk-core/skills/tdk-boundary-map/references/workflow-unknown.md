# Unknown Boundary Map Workflow

Use this workflow for `--unknown` or when evidence is too weak for standard or
from-existing mode.

## Steps

1. Load the output contract, taxonomy/runtime projection reference, templates,
   and this workflow.
2. Classify the available input as greenfield brief, architecture decision,
   brownfield repo evidence, mixed evidence, or insufficient evidence.
3. List missing evidence needed for a topology proposal.
4. Record assumptions only when explicitly accepted or clearly marked weak.
5. Do not make a strong topology proposal from weak evidence.
6. Write `workspace-topology.md` as readiness guidance when useful.
7. Do not overwrite `workspace-topology.json` when evidence is insufficient.
8. Write JSON only when evidence is sufficient and parser-safe.
9. Recommend one safest next route.

## Next Route Rules

- Recommend `/tdk-greenfield-start` for new-project briefs missing inception
  evidence.
- Recommend `/tdk-brownfield-start` for existing repos without onboarding
  evidence.
- Recommend `/tdk-architecture-advisor` when architecture decision evidence is
  missing.
- Recommend `/tdk-scout` when repo structure, package ownership, or file roles
  are unclear.
- Recommend standard boundary-map mode only when architecture and path evidence
  are sufficient.

## Stop Conditions

Stop without writing when the only available input is unsafe, secret-like,
outside the workspace, or too vague to produce useful readiness guidance.
