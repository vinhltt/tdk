---
name: tdk-discovery
description: "EPIC-ONLY v1 discovery entry point that creates context-only problem, persona, MVP, and index artifacts before tdk-specify"
argument-hint: "<epic-id> <brief|file> [--force]"
metadata:
  version: "5.4.0"
---

# tdk-discovery

Create bounded epic discovery context before `/tdk-specify`.

Trigger: `/tdk-discovery <epic-id> <brief|file> [--force]`

## Boundary Declaration

This command is **EPIC-ONLY v1** and **context-only**.

**This command produces:**
- Markdown discovery context under `{FEATURE_DIR}/discovery/`
- `discovery/problem.md`
- `discovery/personas.md`
- `discovery/mvp-scope.md`
- `discovery/index.md`

**This command does NOT create specs, plans, work items, code, or tracker issues.**

It is tracker-neutral and does not integrate with GitHub, GitLab, Backlog, or any
other issue tracker. Only `tdk-specify` mints `UR-*`, `FR-*`, and `SC-*`.

Feature-sized work skips discovery and starts at `/tdk-specify`.

## Skill References

Load before writing any discovery file:
- `references/discovery-output-contract.md`

## Execution Steps

### Step 0 - Validate Epic ID

Invoke `tdk-validate-task-id` with `$ARGUMENTS` and host skill name
`/tdk-discovery`. If STOP -> halt execution.

Store: `TASK_ID`, `TASK_ID_SOURCE`.

### Step 1 - Load Project Context

Invoke `tdk-load-project-context` with validated `TASK_ID` and:

```text
require_feature_dir:false
require_prefix_validation:false
```

Store: `PROJECT_CONTEXT`.

### Step 1.5 - Resolve Feature Directory

Because `require_feature_dir:false` skips `FEATURE_DIR` resolution in
`tdk-load-project-context`, derive the path explicitly after project context
loads:

1. Determine paths from `PROJECT_CONTEXT` and validated `TASK_ID`:
   - `SPECS_ROOT` = project's `.specify` root
   - `FOLDER` = parsed from `TASK_ID` prefix folder or `PROJECT_CONTEXT.featureEnv.defaultFolder` fallback `feature`
   - `TICKET_ID` = parsed ticket identifier, e.g. `tdk-001`
   - `FEATURE_DIR` = `$SPECS_ROOT/$FOLDER/$TICKET_ID`
2. Do not require `FEATURE_DIR` to exist before discovery. Discovery initializes it.

Store: `SPECS_ROOT`, `FOLDER`, `TICKET_ID`, `FEATURE_DIR`.

### Step 2 - Parse Flags And Resolve Brief

Parse flags before resolving the brief:

- If `--force` is present, set `FORCE_DISCOVERY=true`.
- Strip `--force` from the second argument onward before treating the remaining
  text as the discovery brief or file path.

Use the cleaned second argument onward as the discovery brief. If it points to
a workspace-local Markdown file, read that file as input. Refuse secret-like,
dotenv, key, credential, token, or outside-workspace paths.

If the brief is empty, STOP with:

```text
Description required. Usage: /tdk-discovery <epic-id> <brief|file> [--force]
```

### Step 3 - Initialize Discovery Directory

Create the epic feature directory idempotently:

```bash
mkdir -p "$FEATURE_DIR/discovery"
```

If `discovery/index.md` already exists and `FORCE_DISCOVERY` is not true, STOP with:

```text
Discovery already exists. Re-run with --force only when you intend to replace discovery context.
```

### Step 4 - Write Discovery Artifacts

Write exactly these files from local templates:

```text
discovery/problem.md
discovery/personas.md
discovery/mvp-scope.md
discovery/index.md
```

Use the discovery brief, project context, memory, and constitution as context.
Do not create requirement IDs, specification sections, task files, plans, code,
tracker records, or a `discovery_ref`.

`discovery/index.md` is the manifest. It includes "Product-level signals" as a
candidate checklist only. Product-level facts live in `product-context.md` and
are updated only through `tdk-constitution`.

### Step 5 - Validate Output

Before completion, verify:

- Only the four allowed files exist under `discovery/`.
- `index.md` links all three detail artifacts.
- Product-level signals are candidate notes, not authority.
- No `UR-*`, `FR-*`, `SC-*`, `discovery_ref`, tracker command, or market/business-model file was created.

### Step 6 - Report Completion

Report:

- Discovery directory path
- Files written
- Whether product-level signal candidates need human review for a future
  `/tdk-constitution --update`
- Readiness for `/tdk-specify <epic-id> <description>`
