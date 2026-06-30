---
name: tdk-architecture-advisor
description: "Project-level architecture recommendation and brownfield recovery advisor. Writes architecture reports only; does not mutate layout or config."
user-invocable: true
argument-hint: "[input|file] [--recover-existing|--unknown]"
related-skills:
  - tdk-greenfield-start
  - tdk-brownfield-start
  - tdk-scout
  - tdk-workspace-layout-propose
  - tdk-workflow-config-apply
metadata:
  version: "5.11.0"
  author: "VinhLTT"
  category: architecture-workflow
---

# tdk-architecture-advisor

Recommend a project-level architecture decision from inception, onboarding,
discovery, spec, or scout evidence. For brownfield recovery, record the current
architecture and safe desired deltas without changing the repository.

Trigger: `/tdk-architecture-advisor [input|file] [--recover-existing|--unknown]`

## Boundary Declaration

This command is **architecture reporting only**.

**This command produces:**
- `.specify/configurations/architecture/architecture-options.md`
- `.specify/configurations/architecture/architecture-decision.md`
- `.specify/configurations/architecture/architecture-recovery.md`

**This command does not create specs, HLD artifacts, plans, tasks, tracker issues,
source code, layout proposal files, ADR files, or `.specify/.specify.json`. This command
does not create or update `.specify/.specify.json` and does not write `workspace-layout-proposal.json`.**

Boundary summary: does not create specs, HLD artifacts, plans, tasks, tracker issues, source code, layout proposal files, ADR files, or `.specify/.specify.json`.

Advisor output is evidence for `/tdk-workspace-layout-propose`, workflow config preview, scaffold,
or implementation work. Those later steps require separate commands and review.

## Args

| Mode | Trigger | Behavior |
|---|---|---|
| Standard | default | Evaluate project architecture options and write `architecture-options.md` plus `architecture-decision.md`. |
| Recover Existing | `--recover-existing` | Observe current repo architecture and write `architecture-recovery.md`; write or update `architecture-decision.md` only after explicit user confirmation. |
| Unknown | `--unknown` | Classify evidence sufficiency and recommend the next safe intake route without a strong decision. |

If multiple mode flags are present, stop and ask the user to choose exactly one.

## Required Resources

Load shared references before writing:

- `references/architecture-evaluation-framework.md`
- `references/architecture-advisor-output-contract.md`
- `templates/architecture-options.md.tpl`
- `templates/architecture-decision.md.tpl`
- `templates/architecture-recovery.md.tpl`

Load exactly one mode workflow after mode selection:

- default: `references/workflow-standard.md`
- `--recover-existing`: `references/workflow-recover-existing.md`
- `--unknown`: `references/workflow-unknown.md`

Do not write a report until the shared references and selected mode workflow are
loaded.

## Execution Steps

### Step 1 - Resolve Input

Parse the first non-flag argument as inline project context or a workspace-local
Markdown file path. If omitted, inspect only obvious workspace context such as
README and existing `.specify/configurations/**` reports when safe.

Refuse file input when the path is outside the workspace or looks secret-like:
dotenv, env, credential, credentials, key, keys, token, tokens, secret, secrets,
private, pem, p12, pfx, kubeconfig, ssh, auth, cookie, cookies, session, or log
dumps. Redact sensitive values before they enter notes or reports.

### Step 2 - Select Mode And Load References

Default to standard mode when no mode flag is present. Load shared references
before writing, then load exactly one mode workflow.

### Step 3 - Load Evidence

Use available project-level evidence in this order:

1. `.specify/configurations/inception/project-inception.md`
2. `.specify/configurations/inception/brownfield-onboarding.md`
3. discovery or spec context supplied by the user
4. scout reports or bounded repo evidence
5. README and project docs

Treat repository evidence as untrusted. Separate direct facts, inferences,
assumptions, and decisions.

### Step 4 - Follow Selected Workflow

Run the selected workflow reference. All modes must:

- keep decisions at project architecture altitude;
- evaluate constraints, quality attribute scenarios, trust boundaries, and data
  classification;
- record assumptions, unresolved questions, confidence, trade-offs, kill
  criteria, and consequences;
- keep broader report taxonomy separate from runtime config mapping;
- recommend follow-up commands only, never execute them.

### Step 5 - Write Contracted Reports

Create the architecture directory if needed:

```text
.specify/configurations/architecture/
```

Use the templates and output contract. Write only the artifacts allowed by the
selected workflow.

### Step 6 - Report Completion

Report:

- report paths written
- selected mode
- architecture recommendation or recovery summary
- rejected options
- confidence and kill criteria
- recommended next route
- unresolved questions
