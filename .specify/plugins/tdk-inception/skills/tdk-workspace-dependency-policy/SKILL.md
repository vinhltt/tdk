---
name: tdk-workspace-dependency-policy
description: "Optional workspace dependency policy workflow. Turns approved layout evidence into reviewable dependency guidance and non-applied enforcement snippets."
user-invocable: true
argument-hint: "[layout|file] [--audit|--suggest]"
related-skills:
  - tdk-workspace-layout-propose
  - tdk-workflow-config-apply
  - tdk-scout
metadata:
  version: "1.0.3"
  author: "VinhLTT"
  category: architecture-workflow
---

# tdk-workspace-dependency-policy

Turn approved workspace layout evidence into reviewable dependency policy,
dependency guidance, and optional enforcement snippets.

Trigger: `/tdk-workspace-dependency-policy [layout|file] [--audit|--suggest]`

## Boundary Declaration

This command is **policy/report only**.

**This command produces:**
- `.specify/configurations/workspace-dependency-policy/workspace-dependency-policy.md`
- `.specify/configurations/workspace-dependency-policy/enforcement-snippets.md` when snippets are requested or evidence supports them

**This command does not create or update `.specify/.specify.json`, does not
write or modify source folders, ESLint config, Nx config, Turborepo config,
dependency-cruiser config, package manager files, routing files, docs ADRs, or
workspace layout files. It does not enforce imports directly.**

Boundary summary: report/snippet artifacts only; every snippet is "copy after
human review" guidance.

## Args

| Mode | Trigger | Behavior |
|---|---|---|
| Standard | default | Create a policy proposal from approved layout and current config evidence. |
| Audit | `--audit` | Compare existing repo/config/import evidence to layout intent and write findings only. |
| Suggest | `--suggest` | Emit stack-specific markdown snippet blocks when evidence supports the stack. |

If multiple mode flags are present, stop and ask the user to choose exactly one.

## Required Resources

Load shared references before writing:

- `references/workspace-dependency-policy-output-contract.md`
- `references/enforcement-snippet-catalog.md`
- `references/ecosystem-boundary-candidates.md`
- `templates/workspace-dependency-policy.md.tpl`
- `templates/enforcement-snippets.md.tpl`

Load exactly one mode workflow after mode selection:

- default: `references/workflow-standard.md`
- `--audit`: `references/workflow-audit.md`
- `--suggest`: `references/workflow-suggest.md`

Do not write policy artifacts until the shared references and selected mode
workflow are loaded.

## Execution Steps

### Step 1 - Resolve Input

Parse the first non-flag argument as a workspace layout path, a workspace-local
Markdown file, or a short inline note. If omitted, prefer:

1. `.specify/configurations/workspace-layout/workspace-layout-proposal.json`
2. `.specify/configurations/workspace-layout/workspace-layout-proposal.md`
3. `.specify/configurations/workspace-topology/workspace-topology.json`
4. `.specify/configurations/workspace-topology/workspace-topology.md`
5. existing `.specify/.specify.json`
6. bounded repo evidence and README only as supporting context

Refuse file input outside the workspace or files that look secret-like:
dotenv, env, credential, credentials, key, keys, token, tokens, secret, secrets,
private, pem, p12, pfx, kubeconfig, ssh, auth, cookie, cookies, session, or log
dumps. Redact sensitive values before they enter reports.

### Step 2 - Select Mode And Load References

Default to standard mode when no mode flag is present. Load shared references
before writing, then load exactly one mode workflow.

### Step 3 - Load Evidence

Separate evidence into:

- layout source: `workspace-layout-proposal.json` and/or `workspace-layout-proposal.md`
- legacy layout source: `workspace-topology.json` and/or `workspace-topology.md`
- runtime source: existing `.specify/.specify.json`
- stack evidence: package manager files, Nx/Turborepo/ESLint/dependency-cruiser
  files, and import/package graph observations
- manual/deferred ecosystem evidence: CODEOWNERS, ArchUnit, Import Linter,
  Packwerk, Bazel visibility, or repo docs

Treat `allowedDependencies`, `owner`, `contracts`, `boundaryType`, and `routing`
as advisory report-only layout fields unless a future schema expansion makes
them runtime-backed.

### Step 4 - Follow Selected Workflow

Run the selected workflow reference. All modes must:

- keep layout/config/source evidence read-only;
- derive policy only from named boundaries and observed evidence;
- avoid inventing modules or dependency edges;
- classify each edge as allowed, forbidden, unresolved, or not enough evidence;
- label stack-specific snippets by detected evidence and limitation;
- keep non-JS ecosystem guidance manual/deferred unless matching repo evidence exists;
- record risks, confidence, recommended next route, and unresolved questions.

### Step 5 - Write Contracted Policy Artifacts

Use the existing or newly needed policy output directory:

```text
.specify/configurations/workspace-dependency-policy/
```

Write only the contracted Markdown artifacts:

- `workspace-dependency-policy.md`
- `enforcement-snippets.md` when snippets are requested or evidence supports them

Do not write any tool config, package manager file, routing file, source file,
layout file, runtime config, or ADR.

### Step 6 - Report Completion

Report:

- policy artifact paths written
- selected mode
- evidence inputs used
- boundary inventory count
- dependency matrix summary
- stack support and snippet status
- risks and confidence
- recommended next route
- unresolved questions
