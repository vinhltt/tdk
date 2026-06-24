# Unknown Greenfield Workflow

Use this workflow for `--unknown`.

## Purpose

Classify ambiguous greenfield input and produce a triage report. This mode does not
produce a strong downstream command chain unless minimum facts are present.

## Minimum Facts For Strong Routing

- project intent is explicit;
- at least one target user or workflow is named;
- desired outcome or success signal is present;
- no critical risk/compliance ambiguity blocks routing.

## Steps

1. Resolve the brief or workspace-local Markdown file.
2. Load the taxonomy, output contract, template, and this workflow.
3. Classify the likely project shape using explicit evidence only.
4. Record missing facts and assumptions.
5. Set readiness:
   - `ready-with-assumptions` only when minimum facts are present;
   - otherwise `not-ready`.
6. Write the report.
7. Stop before strong routing when minimum facts are missing.

## Recommendation Rules

- If evidence is weak, recommend answering unresolved questions and rerunning with `--full` or `--quick`.
- If the only missing area is product context, recommend product discovery as the later route.
- Do not recommend topology dry-run when project shape evidence is weak.
