---
name: tdk-brownfield-start
description: "Observe-first onboarding for existing repositories. Summarizes repo shape, current TDK config state, and safe next-step recommendations without product discovery or source-tree changes."
user-invocable: true
argument-hint: "[repo-root] [--full|--config-only|--unknown]"
related-skills:
  - tdk-scout
  - tdk-architecture-advisor
  - tdk-workflow-config-apply
  - tdk-sub-workspace-docs
metadata:
  version: "5.11.0"
  author: "VinhLTT"
  category: architecture-workflow
---

# tdk-brownfield-start

Onboard an existing repository into the TDK architecture workflow by observing what already exists, writing a bounded report, and recommending safe follow-up commands.

This skill is repo onboarding, not product discovery. It does not ask product-scope discovery questions by default, does not move, rename, scaffold, or refactor source folders, and does not create or update `.specify/.specify.json`.

## When to use

- Starting TDK work in a repository that already has source code.
- Checking whether current `.specify` configuration reflects the repository shape.
- Preparing evidence for a later topology dry-run or docs generation pass.
- Classifying an unfamiliar repo before deciding whether product discovery, topology, or documentation work should happen next.

## Args

| Arg | Notes |
|---|---|
| `repo-root` | Optional. Defaults to the active project root. Must resolve inside the active workspace/session root. |
| `--full` | `--full` is the observe-first default. Inspect repo evidence, summarize current state, and recommend a reconcile workflow. |
| `--config-only` | Focus on `.specify` state and topology-readiness. Skip docs-generation recommendations unless config evidence makes them necessary. |
| `--unknown` | Classify repo shape and stop with recommendations. No report-driven command chain is executed. |

If multiple mode flags are present, stop and ask the user to pick one. Do not silently choose.

## Required Resources

Load shared references before writing:

- `references/repo-evidence-taxonomy.md`
- `references/brownfield-onboarding-output-contract.md`
- `templates/brownfield-onboarding.md.tpl`

Load exactly one mode workflow after mode selection:

- `--full`: `references/workflow-full.md`
- `--config-only`: `references/workflow-config-only.md`
- `--unknown`: `references/workflow-unknown.md`

Do not write a report until the shared references and selected mode workflow are
loaded.

## Output Contract

Write exactly one consumer-repo artifact:

```text
.specify/configurations/inception/brownfield-onboarding.md
```

If `.specify/` is absent, stop with setup guidance instead of creating a runtime config. If the report parent directory is missing, create only `.specify/configurations/inception/` as needed for the report.

The report must separate observed evidence from recommendations and use confidence labels:

- `High` for direct file/config evidence.
- `Medium` for package/dependency or command inference.
- `Low` for naming/layout inference that needs human confirmation.

Required report sections:

```markdown
# Brownfield Onboarding

## Readiness Status
## Repo Root And Selected Mode
## Observed Evidence
## Inferred Recommendations
## Current .specify Config Status
## Risks, Redactions, and Refusals
## Assumptions
## Unresolved Repo Questions
## Recommended Next Route
## Do Not Proceed Guidance
```

## Safety Boundaries

- Refuse outside-workspace paths, path traversal, symlinks that escape the workspace, and user-provided paths that cannot be resolved confidently.
- Refuse secret-like targets such as `.env`, `.npmrc`, `.pypirc`, private keys, credential files, token dumps, SSH config, and private logs.
- Before writing the report, redact secrets from all evidence snippets. Replace values with `[REDACTED]`; keep only non-sensitive key names or file paths when useful.
- Do not include raw environment values, bearer tokens, API keys, cookies, session IDs, private keys, passwords, or connection strings in the report.
- The only allowed write path is `.specify/configurations/inception/brownfield-onboarding.md`.
- This skill does not create or update `.specify/.specify.json`.
- This skill does not create source folders, move code, rename packages, scaffold modules, run formatters, or refactor existing files.
- This skill does not ask product-scope discovery questions by default. Product discovery can be recommended as a next route only when repo evidence shows missing product intent.

## Steps

1. **Resolve repo root.**
   - Use the provided `repo-root`, or the active project root if omitted.
   - Canonicalize the path and verify it stays inside the active workspace/session root.
   - If it points outside the workspace, into a refused secret-like path, or through an escaping symlink, stop with a refusal and do not write a report.

2. **Select mode.**
   - Default to `--full`.
   - `--config-only` narrows collection to `.specify` files, topology candidates, docs paths, and existing config references.
   - `--unknown` performs only classification and recommendation; it does not run scout or continue into command-chain recommendations.

3. **Load references.**
   - Load shared references before writing.
   - Load exactly one mode workflow.
   - Follow the selected workflow for evidence scope and recommendation strength.

4. **Collect observe-first evidence.**
   - Inspect only evidence allowed by the selected workflow.
   - Prefer existing command output and config files over inferred naming conventions.
   - Read only bounded snippets needed for evidence; avoid whole-file reads from unknown logs or generated artifacts.
   - Redact sensitive values before they enter notes, summaries, or the final report.

5. **Use scout only as input.**
   - If a recent `tdk-scout` report already exists, read it as one evidence source.
   - In `--full`, recommend running `tdk-scout` when no current scout evidence exists.
   - Do not duplicate scout internals inside this skill.

6. **Write the onboarding report.**
   - Create or replace `.specify/configurations/inception/brownfield-onboarding.md`.
   - Use `templates/brownfield-onboarding.md.tpl` and the output contract.
   - Include evidence, confidence labels, current config status, recommendations, risks, redactions, refusals, assumptions, and unresolved repo questions.
   - Keep repo-onboarding questions focused on observable structure and safe next steps. Do not ask product-scope discovery questions by default.

7. **Return recommended next routes.**
   - Treat all follow-up commands as recommendations only. Do not execute them from this skill unless the user explicitly asks for that follow-up after reading the report.
   - Typical `--full` recommendation chain:
     ```bash
     /tdk-scout --scope <repo-root> --task-hint "brownfield onboarding"
     /tdk-architecture-advisor --recover-existing <brownfield-onboarding.md>
     /tdk-workflow-config-apply --reconcile
     /tdk-sub-workspace-docs --all
     ```
   - Typical `--config-only` recommendation chain:
     ```bash
     /tdk-workflow-config-apply --reconcile
     ```
   - For `--unknown`, recommend the single next route with the strongest evidence, usually `tdk-scout` for structure or `tdk-discovery` for missing product intent.

## Mode Behavior

| Mode | Behavior |
|---|---|
| `--full` | Observe repo shape, current config, docs, tests, CI, and package commands. Write the report and recommend scout, topology dry-run, and docs generation when evidence supports them. |
| `--config-only` | Inspect `.specify` state and topology-readiness. Write the report with config risks and recommend reconcile preview first. |
| `--unknown` | Classify repo shape, write the report, and stop with one recommended next route. |

## Recommendation Rules

- Recommend `tdk-scout` when repo boundaries, framework ownership, or file roles are unclear.
- Recommend `/tdk-architecture-advisor --recover-existing <brownfield-onboarding.md>` when repo evidence is ready for architecture recovery.
- Recommend `tdk-workflow-config-apply --reconcile` when observed repo shape differs from `.specify` config, or when `.specify` config is missing expected sub-workspaces/modules. Normal apply remains `/tdk-workflow-config-apply` after review.
- Recommend `tdk-sub-workspace-docs --all` only after config evidence is present or after topology dry-run/apply is accepted.
- Recommend `tdk-discovery` only when product intent is missing and the user wants product-scope questions.
- Do not present recommendations as completed work, applied configuration, or source-tree changes.

## Failure Modes

| Condition | Result |
|---|---|
| Repo root outside workspace | Refuse; no report write. |
| Secret-like target or evidence cannot be safely redacted | Refuse that source; include the refusal in the report if a report is otherwise safe to write. |
| `.specify/` is absent | Stop with setup guidance; do not create runtime config. |
| Multiple modes passed | Ask the user to pick one mode; no report write until resolved. |
| Existing source layout conflicts with inferred topology | Report as risk/unresolved question; recommend reconcile preview first. |

## Notes

- This skill intentionally has no aliases in this slice. Use `/tdk-brownfield-start`.
- The report is evidence for later planning. Refactors, scaffolds, source moves, and config writes require separate specs/plans.
