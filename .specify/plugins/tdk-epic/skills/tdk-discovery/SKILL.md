---
name: tdk-discovery
description: "EPIC-ONLY v1 discovery entry point that creates context-only problem, persona, MVP, and discovery manifest artifacts before tdk-epic-prd, or interviews existing discovery artifacts with --interview"
argument-hint: "<epic-id> [<brief|file>] [--force] [--interview]"
metadata:
  version: "1.0.1"
---

# tdk-discovery

Create bounded epic discovery context before `/tdk-epic-prd`.

Triggers:

```text
/tdk-discovery <epic-id> <brief|file> [--force] [--interview]
/tdk-discovery <epic-id> --interview
```

## Boundary Declaration

This command is **EPIC-ONLY v1** and **context-only**.

**This command produces:**
- Epic dashboard at `{FEATURE_DIR}/index.md`
- Discovery stage manifest at `{FEATURE_DIR}/discovery.md`
- `discovery/problem.md`
- `discovery/personas.md`
- `discovery/mvp-scope.md`

**This command does NOT create specs, plans, work items, code, or tracker issues.**

It is tracker-neutral and does not integrate with GitHub, GitLab, Backlog, or any
other issue tracker. Only `tdk-specify` mints `UR-*`, `FR-*`, and `SC-*`.

Feature-sized work skips discovery and starts at `/tdk-specify`.

## Skill References

Load before writing any discovery file:
- `references/discovery-output-contract.md`
- `.specify/_shared/skills/interview-alignment-protocol.md` when `--interview` is set

## Error Recovery

Resolve common situations with this table instead of dead-ending. Every action stays within
discovery's existing capabilities; recovery adds no new execution branch.

| Situation | Action |
|---|---|
| Brief is vague or too thin to discover from | Ask targeted clarifying questions until the brief is clear enough for bounded discovery. If the user cannot clarify, STOP instead of inventing scope. |
| Brief points to a missing, secret, dotenv, credential, token, or outside-workspace file | STOP and refuse, same as Step 2. |
| `/tdk-discovery <epic-id> --interview` and all four discovery files exist | Run existing artifact interview replay. Do not regenerate discovery files. |
| `/tdk-discovery <epic-id> --interview` and any discovery file is missing | STOP, same as Step 2. Tell the user to create discovery with a brief or file first. |
| `discovery/index.md` exists and `discovery.md` is missing | STOP with `legacy layout detected`; tell the user to rerun with `--force` or recreate the test epic. do not auto-migrate. |
| `discovery.md` already exists, no `--force` | STOP, same as Step 3. The user may move or archive the prior discovery manually, then re-run. |
| `discovery.md` already exists, with `--force` | Reuse the directory and overwrite the four discovery artifacts in the new layout. |

Recovery is advisory guidance only. Discovery never opens, edits, or closes tracker items,
and it adds no archive or migration step of its own.

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
- If `--interview` is present, set `INTERVIEW_DISCOVERY=true`.
- Unknown flags STOP before any file is read or written. Report:
  `Unknown flag: <flag>. Usage: /tdk-discovery <epic-id> [<brief|file>] [--force] [--interview]`.
- Strip `--force` and `--interview` from the second argument onward before
  treating the remaining text as the discovery brief or file path.

Use the cleaned second argument onward as the discovery brief. If it points to
a workspace-local Markdown file, read that file as input. Refuse secret-like,
dotenv, key, credential, token, or outside-workspace paths.

If the cleaned brief is exactly `interview`, STOP before creation or replay routing with:

```text
positional `interview` is not a mode. Did you mean `--interview`?
```

If the brief is empty and both `--force` and `--interview` are present, STOP with:

```text
`--force --interview` requires a replacement brief or file. Usage: /tdk-discovery <epic-id> <brief|file> --force --interview
```

If the brief is empty and `INTERVIEW_DISCOVERY=true`, set `DISCOVERY_REPLAY_INTERVIEW=true` and validate the existing discovery set before continuing:

- Require `discovery.md`, `discovery/problem.md`, `discovery/personas.md`, and `discovery/mvp-scope.md`.
- Before Step 4.5, verify `discovery/` contains exactly the three allowed detail files and no extras.
- If any file is missing, STOP with:

```text
Discovery replay interview requires existing discovery artifacts: `discovery.md`, `discovery/problem.md`, `discovery/personas.md`, and `discovery/mvp-scope.md`. Create discovery first with /tdk-discovery <epic-id> <brief|file> --interview.
```
- If any extra discovery file exists, STOP before interviewing with:

```text
Discovery replay interview requires exactly the three discovery detail artifacts. Remove unexpected discovery files before rerunning --interview.
```

If the brief is empty and replay is not active, STOP with:

```text
Description required. Usage: /tdk-discovery <epic-id> <brief|file> [--force] [--interview]
```

### Step 3 - Initialize Discovery Directory

If `DISCOVERY_REPLAY_INTERVIEW=true`, skip Step 3 directory initialization and Step 4 artifact generation. The replay path must read and update only the existing four discovery artifacts validated in Step 2.

Create the epic feature directory idempotently:

```bash
mkdir -p "$FEATURE_DIR/discovery"
```

If `discovery/index.md` exists and `discovery.md` is missing, STOP with:

```text
legacy layout detected: discovery/index.md is from the old nested-manifest layout. Re-run with --force to regenerate discovery in the new layout, or recreate the test epic. TDK does not auto-migrate old discovery/index.md content.
```

If `discovery.md` already exists and `FORCE_DISCOVERY` is not true, STOP with:

```text
Discovery already exists. Re-run with --force only when you intend to replace discovery context.
```

### Step 4 - Write Discovery Artifacts

If `DISCOVERY_REPLAY_INTERVIEW=true`, skip this step.

Write exactly these files from local templates:

```text
discovery.md
discovery/problem.md
discovery/personas.md
discovery/mvp-scope.md
```

**Depth auto-detect (no flag).** Infer discovery depth from one signal: the brief's length
and structure. A terse one-line brief calls for *light* discovery — concise prose, fewer open
questions. A multi-paragraph brief with explicit constraints, personas, or scope cues calls
for *deep* discovery — denser prose, more open questions. This only tunes prose density and
Open-Questions depth. It is not a mode engine: it adds no `--depth` flag, does not change the
command signature, and never alters the four-file shape.

Use the discovery brief, project context, memory, and constitution as context.
Do not create requirement IDs, specification sections, task files, plans, code,
tracker records, or a `discovery_ref`.

`discovery.md` is the stage manifest. It includes "Product-level signals" as a
candidate checklist only. Product-level facts live in the constitution plus
typed memory routes and are updated only through `tdk-constitution`.

Update `{FEATURE_DIR}/index.md` as the epic dashboard. The dashboard must link
`discovery.md` as the current stage manifest, summarize readiness, state the
next command, and restate that only child `spec.md` mints requirements. Preserve
user-owned sections outside generated markers; if a generated section contains
user edits and would be replaced, ask for confirmation or require `--force`.

### Step 4.5 - Optional Interview Alignment Gate

If `INTERVIEW_DISCOVERY=true`, run the interview after the four draft artifacts
exist for creation, or after the current artifacts are loaded for
`DISCOVERY_REPLAY_INTERVIEW=true`, and before validation:

1. Load `.specify/_shared/skills/interview-alignment-protocol.md`.
2. Read `discovery.md`, `discovery/problem.md`, `discovery/personas.md`, and `discovery/mvp-scope.md`.
3. Build an internal claim map from problem, personas, MVP cutline,
   out-of-scope, risks, and open questions.
4. Ask 3-5 artifact-grounded questions, one at a time, covering problem, personas, MVP cutline, out-of-scope, and risk/open question.
5. For each answer, record classification: `aligned`, `mismatch`, or `unclear`.

Integration rules:

- `aligned`: leave artifacts unchanged unless a concise wording correction
  materially improves accuracy.
- `mismatch`: update only the relevant existing section in the four discovery
  files.
- `unclear`: add a recommended question to the relevant artifact's
  `## Open Questions`.

Any critical mismatch must be integrated into the artifact or explicitly
accepted as an open question before continuing. Persist durable decisions only;
do not store a raw transcript. No `interview.md`, requirement IDs, specs, plans,
tasks, tracker records, or other discovery files may be created.

### Step 5 - Validate Output

Before completion, verify:

- `discovery.md` exists as the stage manifest.
- `{FEATURE_DIR}/index.md` exists as the epic dashboard.
- Only the three allowed detail files exist under `discovery/`.
- No `interview.md` or any other extra discovery file exists.
- `discovery.md` links all three detail artifacts.
- `{FEATURE_DIR}/index.md` links `discovery.md`, states current stage, readiness, and next command.
- Product-level signals are candidate notes, not authority.
- No `UR-*`, `FR-*`, `SC-*`, `discovery_ref`, tracker command, or market/business-model file was created.

### Step 6 - Report Completion

Report:

- Discovery directory path
- Epic dashboard path: `index.md`
- Files written
- Interview alignment: `creation`, `existing artifact`, or `disabled`
- Whether product-level signal candidates need human review for a future
  `/tdk-constitution --update`
- Readiness for `/tdk-epic-prd <epic-id>`. The `## Ready For Epic PRD`
  checklist in `discovery.md` is advisory only: discovery completion and
  `/tdk-epic-prd` do not depend on it, and no checklist item gates the handoff.
  Feature-sized work should skip discovery and start at `/tdk-specify` instead
  of using discovery as a direct predecessor.

### Step 7 - Recommend Next Step

Use `AskUserQuestion` with header "Next Step" after reporting completion:

| Option | Action |
|--------|--------|
| `/tdk-epic-prd {TASK_ID}` (Recommended for broad epics) | Invoke `/tdk-epic-prd {TASK_ID}` |
| `/tdk-discovery {TASK_ID} --interview` | Invoke `/tdk-discovery {TASK_ID} --interview` to recheck existing discovery artifacts |
| End session | Stop |

If discovery ran only as replay interview, still offer the same next-step choices after reporting the updated artifacts.
