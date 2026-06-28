---
name: tdk-discovery
description: "EPIC-ONLY v1 discovery entry point that creates context-only problem, persona, MVP, and index artifacts before tdk-specify"
argument-hint: "<epic-id> <brief|file> [--force] [--interview]"
metadata:
  version: "5.4.2"
---

# tdk-discovery

Create bounded epic discovery context before `/tdk-specify`.

Trigger: `/tdk-discovery <epic-id> <brief|file> [--force] [--interview]`

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
- `../_shared/interview-alignment-protocol.md` when `--interview` is set

## Error Recovery

Resolve common situations with this table instead of dead-ending. Every action stays within
discovery's existing capabilities; recovery adds no new execution branch.

| Situation | Action |
|---|---|
| Brief is vague or too thin to discover from | Ask targeted clarifying questions until the brief is clear enough for bounded discovery. If the user cannot clarify, STOP instead of inventing scope. |
| Brief points to a missing, secret, dotenv, credential, token, or outside-workspace file | STOP and refuse, same as Step 2. |
| `discovery/index.md` already exists, no `--force` | STOP, same as Step 3. The user may move or archive the prior discovery manually, then re-run. |
| `discovery/index.md` already exists, with `--force` | Reuse the directory and overwrite the four artifacts. |

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
  `Unknown flag: <flag>. Usage: /tdk-discovery <epic-id> <brief|file> [--force] [--interview]`.
- Strip `--force` and `--interview` from the second argument onward before
  treating the remaining text as the discovery brief or file path.

Use the cleaned second argument onward as the discovery brief. If it points to
a workspace-local Markdown file, read that file as input. Refuse secret-like,
dotenv, key, credential, token, or outside-workspace paths.

If the brief is empty, STOP with:

```text
Description required. Usage: /tdk-discovery <epic-id> <brief|file> [--force] [--interview]
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

**Depth auto-detect (no flag).** Infer discovery depth from one signal: the brief's length
and structure. A terse one-line brief calls for *light* discovery — concise prose, fewer open
questions. A multi-paragraph brief with explicit constraints, personas, or scope cues calls
for *deep* discovery — denser prose, more open questions. This only tunes prose density and
Open-Questions depth. It is not a mode engine: it adds no `--depth` flag, does not change the
command signature, and never alters the four-file shape.

Use the discovery brief, project context, memory, and constitution as context.
Do not create requirement IDs, specification sections, task files, plans, code,
tracker records, or a `discovery_ref`.

`discovery/index.md` is the manifest. It includes "Product-level signals" as a
candidate checklist only. Product-level facts live in `product-context.md` and
are updated only through `tdk-constitution`.

### Step 4.5 - Optional Interview Alignment Gate

If `INTERVIEW_DISCOVERY=true`, run the interview after the four draft artifacts
exist and before validation:

1. Load `../_shared/interview-alignment-protocol.md`.
2. Read `problem.md`, `personas.md`, `mvp-scope.md`, and `index.md`.
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

- Only the four allowed files exist under `discovery/`.
- No `interview.md` or any other extra discovery file exists.
- `index.md` links all three detail artifacts.
- Product-level signals are candidate notes, not authority.
- No `UR-*`, `FR-*`, `SC-*`, `discovery_ref`, tracker command, or market/business-model file was created.

### Step 6 - Report Completion

Report:

- Discovery directory path
- Files written
- Whether interview alignment ran
- Whether product-level signal candidates need human review for a future
  `/tdk-constitution --update`
- Readiness for `/tdk-specify <epic-id> <description>`. The `## Ready For Specify` checklist
  in `index.md` is advisory only: discovery completion and `/tdk-specify` do not depend on
  it, and no checklist item gates the handoff.
