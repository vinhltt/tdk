---
name: tdk-epic-prd
description: "EPIC-ONLY product alignment and slice-map step after tdk-discovery; writes tracker-neutral epic PRD artifacts without minting requirements"
argument-hint: "<epic-id> [--force] [--interview]"
metadata:
  version: "5.13.0"
---

# tdk-epic-prd

Create bounded epic PRD context after `/tdk-discovery` and before child
`/tdk-specify` commands.

Triggers:

```text
/tdk-epic-prd <epic-id> [--force] [--interview]
```

## Boundary Declaration

This command is **EPIC-ONLY** and tracker-neutral. It is product alignment for a
broad epic; it is **not requirement authority**.

**This command produces:**
- Markdown epic PRD context under `{FEATURE_DIR}/epic-prd/`
- `epic-prd/index.md`
- `epic-prd/prd.md`
- `epic-prd/slice-map.md`
- `epic-prd/open-questions.md`

**This command does not create `spec.md`, plans, HLD artifacts, task breakdown
artifacts, code, tracker issues, product-memory updates, or requirement IDs.**

Only child `spec.md` artifacts mint `UR-*`, `FR-*`, and `SC-*`. Epic PRD slice
keys are slugs and must not mint `FS-*`.

Feature-sized work skips epic PRD and starts at `/tdk-specify`.

## Skill References

Load before writing any epic PRD file:
- `references/epic-prd-output-contract.md`
- `references/epic-prd-quality-guidelines.md`
- `../_shared/interview-alignment-protocol.md` when `--interview` is set

## Error Recovery

| Situation | Action |
|---|---|
| Any required discovery artifact is missing | STOP before writing. Tell the user to run `/tdk-discovery <epic-id> <brief\|file>` first. |
| `epic-prd/index.md` exists and `--force` is not set | STOP unless `--interview` is replaying existing PRD artifacts. |
| `--force` is set | Regenerate exactly the four epic PRD files. Do not archive or migrate prior files. |
| `--interview` is set and all four PRD files exist | Set `PRD_REPLAY_INTERVIEW=true` and run interview replay against the current artifacts. |
| `--interview` is set and PRD files do not exist | Generate draft PRD artifacts, then interview them before validation. |

Recovery stays inside the same four epic PRD files. No `interview.md`, tracker
record, requirement ID, spec, plan, HLD, or task file may be created.

## Execution Steps

### Step 0 - Validate Epic ID

Invoke `tdk-validate-task-id` with `$ARGUMENTS` and host skill name
`/tdk-epic-prd`. If STOP -> halt execution.

Store: `TASK_ID`, `TASK_ID_SOURCE`.

### Step 1 - Load Project Context

Invoke `tdk-load-project-context` with validated `TASK_ID` and:

```text
require_feature_dir:false
require_prefix_validation:false
```

Store: `PROJECT_CONTEXT`.

### Step 1.5 - Resolve Feature Directory

Determine paths from `PROJECT_CONTEXT` and validated `TASK_ID`:

- `SPECS_ROOT` = project's `.specify` root
- `FOLDER` = parsed from `TASK_ID` prefix folder or `PROJECT_CONTEXT.featureEnv.defaultFolder` fallback `feature`
- `TICKET_ID` = parsed ticket identifier, e.g. `tdk-001`
- `FEATURE_DIR` = `$SPECS_ROOT/$FOLDER/$TICKET_ID`

Do not create `FEATURE_DIR` yet. Epic PRD requires existing discovery artifacts.

Store: `SPECS_ROOT`, `FOLDER`, `TICKET_ID`, `FEATURE_DIR`.

### Step 2 - Parse Flags

Supported flags:

- `--force`
- `--interview`

Unknown flags STOP before any file is read or written. Report:

```text
Unknown flag: <flag>. Usage: /tdk-epic-prd <epic-id> [--force] [--interview]
```

If a positional argument other than the epic ID remains after flag parsing, STOP
and show the same usage. This command reads discovery artifacts; it does not
accept a separate brief.

If `--force` is present, set `FORCE_PRD=true`.
If `--interview` is present, set `INTERVIEW_PRD=true`.

### Step 3 - Require Discovery Artifacts

Before writing epic PRD artifacts, require:

```text
discovery/index.md
discovery/problem.md
discovery/personas.md
discovery/mvp-scope.md
```

If any file is missing, STOP before writing with:

```text
Epic PRD requires existing discovery artifacts. Run /tdk-discovery <epic-id> <brief|file> first.
```

Read the four discovery files as context. Discovery remains context; it is not
requirement authority.

### Step 4 - Prepare Epic PRD Directory

Set:

```text
PRD_DIR="$FEATURE_DIR/epic-prd"
```

If all four epic PRD files exist and `INTERVIEW_PRD=true` and `FORCE_PRD` is not
true, set `PRD_REPLAY_INTERVIEW=true`.

If `epic-prd/index.md` exists and neither `FORCE_PRD` nor
`PRD_REPLAY_INTERVIEW` is true, STOP with:

```text
Epic PRD already exists. Re-run with --force only when you intend to replace epic PRD artifacts, or use --interview to replay alignment against the existing PRD.
```

If `PRD_REPLAY_INTERVIEW=true`, verify `epic-prd/` contains exactly:

```text
epic-prd/index.md
epic-prd/prd.md
epic-prd/slice-map.md
epic-prd/open-questions.md
```

If any file is missing or any extra file exists, STOP before interviewing.

Otherwise create the directory:

```bash
mkdir -p "$FEATURE_DIR/epic-prd"
```

### Step 5 - Write Epic PRD Artifacts

If `PRD_REPLAY_INTERVIEW=true`, skip generation and read the existing four files.

Load `references/epic-prd-output-contract.md` and
`references/epic-prd-quality-guidelines.md`, then write exactly:

```text
epic-prd/index.md
epic-prd/prd.md
epic-prd/slice-map.md
epic-prd/open-questions.md
```

Use templates from `.specify/templates/epic-prd/`. Derive content only from
discovery artifacts, project context, memory/constitution context when already
available, and explicit user input from the optional interview.

Do not create `spec.md`, requirement IDs, task files, HLD files, implementation
plans, source code, tracker records, product-memory updates, or any other PRD
file. Keep `slice-map.md` entries as slug slice keys and child spec seeds.

### Step 5.5 - Optional Interview Alignment Gate

If `INTERVIEW_PRD=true`, run the interview after draft PRD artifacts exist for
creation, or after the current artifacts are loaded for
`PRD_REPLAY_INTERVIEW=true`, and before validation:

1. Load `../_shared/interview-alignment-protocol.md`.
2. Read `index.md`, `prd.md`, `slice-map.md`, and `open-questions.md`.
3. Build an internal claim map from product objective, MVP appetite, no-gos,
   slice boundaries, build order, and blocking questions.
4. Ask 3-6 artifact-grounded questions, one at a time.
5. Classify each answer as `aligned`, `mismatch`, or `unclear`.

Integration rules:

- `aligned`: leave artifacts unchanged unless a concise wording correction helps.
- `mismatch`: update only the relevant section in the four epic PRD files.
- `unclear`: add a recommended item under `## Blocking Questions` or
  `## Non-Blocking Questions`.

Critical mismatch must be integrated or accepted as an open question before
completion. Persist durable decisions only. No `interview.md`; update only the four epic PRD files.

### Step 6 - Validate Output

Before completion, verify:

- Only the four allowed files exist under `epic-prd/`.
- No `interview.md` or other extra epic PRD file exists.
- `index.md` links all three detail artifacts.
- `slice-map.md` has at least one independently specifiable slice.
- No slice key is a catch-all such as "all features" or "entire MVP".
- `open-questions.md` separates Blocking Questions from Non-Blocking Questions.
- Blocking questions make the readiness gate not ready.
- No `UR-*`, `FR-*`, `SC-*`, `FS-*`, tracker command, `spec.md`, HLD, task,
  plan, code, or product-memory update was created.

### Step 7 - Report Completion

Report:

- Epic PRD directory path
- Files written or updated
- Interview alignment: `creation`, `existing artifact`, or `disabled`
- Blocking question count
- Readiness for child `/tdk-specify <child-id> "<slice seed>"`
