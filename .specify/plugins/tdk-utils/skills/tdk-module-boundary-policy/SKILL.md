---
name: tdk-module-boundary-policy
description: "Optional module boundary policy workflow. Turns approved topology evidence into reviewable dependency guidance and non-applied enforcement snippets."
user-invocable: true
argument-hint: "[topology|file] [--audit|--suggest]"
related-skills:
  - tdk-boundary-map
  - tdk-workspace-topology-apply
  - tdk-scout
metadata:
  version: "2.1.0"
  author: "VinhLTT"
  category: architecture-workflow
---

# tdk-module-boundary-policy

Turn approved workspace topology evidence into reviewable module boundary
policy, dependency guidance, and optional enforcement snippets.

Trigger: `/tdk-module-boundary-policy [topology|file] [--audit|--suggest]`

## Boundary Declaration

This command is **policy/report only**.

**This command produces:**
- `.specify/configurations/module-boundary-policy/module-boundary-policy.md`
- `.specify/configurations/module-boundary-policy/enforcement-snippets.md` when snippets are requested or evidence supports them

**This command does not create or update `.specify/.specify.json`, does not
write or modify source folders, ESLint config, Nx config, Turborepo config,
dependency-cruiser config, package manager files, routing files, docs ADRs, or
workspace topology files. It does not enforce imports directly.**

Boundary summary: report/snippet artifacts only; every snippet is "copy after
human review" guidance.

## Args

| Mode | Trigger | Behavior |
|---|---|---|
| Standard | default | Create a policy proposal from approved topology and current config evidence. |
| Audit | `--audit` | Compare existing repo/config/import evidence to topology intent and write findings only. |
| Suggest | `--suggest` | Emit stack-specific markdown snippet blocks when evidence supports the stack. |

If multiple mode flags are present, stop and ask the user to choose exactly one.

## Required Resources

Load shared references before writing:

- `references/module-boundary-policy-output-contract.md`
- `references/enforcement-snippet-catalog.md`
- `references/ecosystem-boundary-candidates.md`
- `templates/module-boundary-policy.md.tpl`
- `templates/enforcement-snippets.md.tpl`

Load exactly one mode workflow after mode selection:

- default: `references/workflow-standard.md`
- `--audit`: `references/workflow-audit.md`
- `--suggest`: `references/workflow-suggest.md`

Do not write policy artifacts until the shared references and selected mode
workflow are loaded.

## Execution Steps

### Step 1 - Resolve Input

Parse the first non-flag argument as a workspace topology path, a workspace-local
Markdown file, or a short inline note. If omitted, prefer:

1. `.specify/configurations/workspace-topology/workspace-topology.json`
2. `.specify/configurations/workspace-topology/workspace-topology.md`
3. existing `.specify/.specify.json`
4. bounded repo evidence and README only as supporting context

Refuse file input outside the workspace or files that look secret-like:
dotenv, env, credential, credentials, key, keys, token, tokens, secret, secrets,
private, pem, p12, pfx, kubeconfig, ssh, auth, cookie, cookies, session, or log
dumps. Redact sensitive values before they enter reports.

### Step 2 - Select Mode And Load References

Default to standard mode when no mode flag is present. Load shared references
before writing, then load exactly one mode workflow.

### Step 3 - Load Evidence

Separate evidence into:

- topology source: `workspace-topology.json` and/or `workspace-topology.md`
- runtime source: existing `.specify/.specify.json`
- stack evidence: package manager files, Nx/Turborepo/ESLint/dependency-cruiser
  files, and import/package graph observations
- manual/deferred ecosystem evidence: CODEOWNERS, ArchUnit, Import Linter,
  Packwerk, Bazel visibility, or repo docs

Treat `allowedDependencies`, `owner`, `contracts`, `boundaryType`, and `routing`
as advisory report-only topology fields unless a future schema expansion makes
them runtime-backed.

### Step 4 - Follow Selected Workflow

Run the selected workflow reference. All modes must:

- keep topology/config/source evidence read-only;
- derive policy only from named boundaries and observed evidence;
- avoid inventing modules or dependency edges;
- classify each edge as allowed, forbidden, unresolved, or not enough evidence;
- label stack-specific snippets by detected evidence and limitation;
- keep non-JS ecosystem guidance manual/deferred unless matching repo evidence exists;
- record risks, confidence, recommended next route, and unresolved questions.

### Step 5 - Write Contracted Policy Artifacts

Use the existing or newly needed policy output directory:

```text
.specify/configurations/module-boundary-policy/
```

Write only the contracted Markdown artifacts:

- `module-boundary-policy.md`
- `enforcement-snippets.md` when snippets are requested or evidence supports them

Do not write any tool config, package manager file, routing file, source file,
topology file, runtime config, or ADR.

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
