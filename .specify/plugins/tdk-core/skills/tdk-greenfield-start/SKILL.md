---
name: tdk-greenfield-start
description: "New-project intake and routing entry point that asks project-inception questions, writes project-inception.md, and recommends safe next TDK routes"
argument-hint: "[brief|file] [--full|--quick|--unknown]"
metadata:
  version: "6.0.0"
---

# tdk-greenfield-start

Classify a greenfield project brief, ask bounded inception questions, write a
project-inception report, and recommend the next TDK workflow route.

Trigger: `/tdk-greenfield-start [brief|file] [--full|--quick|--unknown]`

## Boundary Declaration

This command is **intake/routing only**.

**This command produces:**
- `.specify/configurations/inception/project-inception.md`
- A readiness-aware recommendation for the next TDK route

**This command does NOT create specs, plans, tasks, tracker issues, source code, topology
files, or runtime config. It does not create or update `.specify/.specify.json` and
does not choose final architecture.**

Boundary-map remains a roadmap recommendation. Use `/tdk-architecture-advisor`
after inception evidence is ready when the next decision is project architecture.

## Args

| Mode | Trigger | Behavior |
|---|---|---|
| Full | default, `--full` | `--full` is the default. Deep project-inception interview before recommendation. |
| Quick | `--quick` | One screening round, unresolved critical gaps explicit. |
| Unknown | `--unknown` | Classification-only triage, weak routing unless minimum facts are present. |

If multiple mode flags are present, STOP and ask the user to choose exactly one.

## Required Resources

Load shared references before writing:

- `references/inception-question-taxonomy.md`
- `references/project-inception-output-contract.md`
- `templates/project-inception.md.tpl`

Load exactly one mode workflow after mode selection:

- `--full`: `references/workflow-full.md`
- `--quick`: `references/workflow-quick.md`
- `--unknown`: `references/workflow-unknown.md`

Do not write a report until the shared references and selected mode workflow are
loaded.

## Execution Steps

### Step 1 - Resolve Input

Parse the first non-flag argument as either inline brief text or a workspace-local
Markdown file path. Strip the selected mode flag before resolving the brief.

If input is empty, STOP with:

```text
Description required. Usage: /tdk-greenfield-start [brief|file] [--full|--quick|--unknown]
```

Refuse file input when the path is outside the workspace or looks secret-like:
dotenv, env, credential, credentials, key, keys, token, tokens, secret, secrets,
private, pem, p12, pfx, kubeconfig, ssh, or auth.

### Step 2 - Select Mode And Load References

Default to `--full` when no mode flag is present.

Load shared references before writing, then load exactly one mode workflow.

### Step 3 - Load Context

Read README and project docs as context only when they exist. Do not treat those
files as durable authority over constitution or memory.

### Step 4 - Follow Selected Workflow

Run the selected workflow reference. All modes must:

- keep questions at project-inception altitude;
- record evidence, assumptions, unresolved questions, readiness, and confidence;
- avoid final architecture decisions;
- recommend follow-up commands only, never execute them.

### Step 5 - Classify Project Shape

Classify the brief into one of:

- single app
- modular monolith
- monorepo
- multi-service
- library/tooling
- docs site
- unknown

Record evidence and assumptions. Classification is a routing hint, not an architecture
decision.

### Step 6 - Write Inception Report

Create the inception directory if needed and write exactly:

```text
.specify/configurations/inception/project-inception.md
```

Use `templates/project-inception.md.tpl` and the output contract. Do not write
any other file.

### Step 7 - Recommend Next Route

Recommend commands without executing them. Recommendation strength depends on
readiness:

- `ready`: recommend the strongest next route with confidence.
- `ready-with-assumptions`: recommend only routes safe under listed assumptions.
- `not-ready`: tell the user what must be answered before continuing.

Common route examples:

```text
/tdk-constitution --init <brief|project-inception.md>
/tdk-discovery <epic-id> <brief|project-inception.md>
/tdk-architecture-advisor <project-inception.md>
/tdk-workflow-config-apply
```

Do not route directly to `/tdk-epic-hld` without `/tdk-epic-prd` artifacts.
For broad epics, route through discovery/epic PRD before parent HLD and task
breakdown; child `/tdk-specify` starts only from a selected seed or scoped
feature brief.

### Step 8 - Report Completion

Report:

- Inception report path
- Selected mode
- Project shape classification
- Readiness status
- Recommendation confidence
- Recommended next route
- Any unresolved questions
