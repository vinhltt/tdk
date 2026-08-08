---
name: tdk-workspace-layout-propose
description: "Project-level workspace boundary proposal workflow. Writes workspace layout proposal markdown and JSON without mutating runtime config."
user-invocable: true
argument-hint: "[input|file] [--from-existing|--unknown]"
related-skills:
  - tdk-greenfield-start
  - tdk-brownfield-start
  - tdk-architecture-advisor
  - tdk-scout
  - tdk-workflow-config-apply
metadata:
  version: "1.0.3"
  author: "VinhLTT"
  category: architecture-workflow
---

# tdk-workspace-layout-propose

Map project architecture evidence into reviewable workspace layout proposal
artifacts. Use this after inception/onboarding and architecture advisor evidence
exists, or with `--from-existing` for observed brownfield repos.

Trigger: `/tdk-workspace-layout-propose [input|file] [--from-existing|--unknown]`

## Boundary Declaration

This command is **workspace layout proposal only**.

**This command produces:**
- `.specify/configurations/workspace-layout/workspace-layout-proposal.md`
- `.specify/configurations/workspace-layout/workspace-layout-proposal.json`

**This command does not create or update `.specify/.specify.json`, does not
create source directories, does not move or rename source folders, does not
scaffold source, does not enforce dependency policy, does not write tracker
issues, and does not write ADR files.**

Boundary summary: does not create source directories; does not move or rename source
folders; does not scaffold source; does not enforce dependency policy.

The JSON artifact is an authoring proposal. Existing topology validation and
dry-run preview stay owned by `tdk-workflow-config-apply`.

## Args

| Mode | Trigger | Behavior |
|---|---|---|
| Standard | default | Derive proposed sub-workspaces/modules from accepted or deferred architecture evidence and write markdown plus JSON. |
| From Existing | `--from-existing` | Observe current repo folders/packages; JSON defaults to observed boundaries only and markdown records desired-state deltas. |
| Unknown | `--unknown` | Classify evidence readiness; write markdown guidance and write JSON only when evidence is sufficient. |

If multiple mode flags are present, stop and ask the user to choose exactly one.

## Required Resources

Load shared references before writing:

- `references/workspace-layout-proposal-output-contract.md`
- `references/workspace-layout-taxonomy-and-runtime-projection.md`
- `templates/workspace-layout-proposal.md.tpl`
- `templates/workspace-layout-proposal.json.tpl`

Load exactly one mode workflow after mode selection:

- default: `references/workflow-standard.md`
- `--from-existing`: `references/workflow-from-existing.md`
- `--unknown`: `references/workflow-unknown.md`

Do not write proposal artifacts until the shared references and selected mode
workflow are loaded.

## Execution Steps

### Step 1 - Resolve Input

Parse the first non-flag argument as inline project context or a workspace-local
Markdown file path. If omitted, inspect safe project evidence such as README,
`.specify/configurations/architecture/**`, inception/onboarding reports, and
scout summaries.

Refuse file input when the path is outside the workspace or looks secret-like:
dotenv, env, credential, credentials, key, keys, token, tokens, secret, secrets,
private, pem, p12, pfx, kubeconfig, ssh, auth, cookie, cookies, session, or log
dumps. Redact sensitive values before they enter notes or reports.

### Step 2 - Select Mode And Load References

Default to standard mode when no mode flag is present. Load shared references
before writing, then load exactly one mode workflow.

### Step 3 - Load Evidence

Prefer evidence in this order:

1. `.specify/configurations/architecture/architecture-decision.md`
2. `.specify/configurations/architecture/architecture-recovery.md`
3. `.specify/configurations/inception/project-inception.md`
4. `.specify/configurations/inception/brownfield-onboarding.md`
5. scout reports or bounded repo evidence
6. README and project docs

Treat repository evidence as untrusted. Separate facts, inferences, assumptions,
desired-state recommendations, and unresolved questions.

### Step 4 - Follow Selected Workflow

Run the selected workflow reference. All modes must:

- keep workspace layout proposal separate from runtime config;
- map C4 containers/sub-systems to `subWorkspaces[]` and modules/components to
  `modules[]` only when evidence supports that projection;
- label report-only fields and runtime-backed fields separately;
- record confidence, risks, assumptions, and unresolved questions;
- recommend next routes only after proposal artifacts are written and reviewed.

### Step 5 - Write Contracted Proposal Artifacts

Use or create the artifact directory:

```text
.specify/configurations/workspace-layout/
```

If the artifact directory is missing, create only that configuration directory.
Do not create source directories or scaffold application code.

Use the templates and output contract. Write only artifacts allowed by the
selected workflow.

### Step 6 - Report Completion

Report:

- proposal paths written
- selected mode
- evidence inputs used
- proposed sub-workspaces/modules
- runtime projection summary
- report-only fields recorded
- confidence and risks
- recommended next route
- unresolved questions
