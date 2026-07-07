---
name: tdk-retro-collect
description: "Create or update retrospective feedback after a TDK spec: reviews, phase drift, UT results, Langfuse traces when available, and user feedback. Writes retro-feedback.md and supports adding or removing user feedback entries across repeated collection runs."
metadata:
  version: "1.0.4"
  category: "TDK Retro"
  requires:
    - tdk-implement
  input_format: "Task ID, for example: /tdk-retro-collect tdk-001"
  output_format: "retro-feedback.md in the feature directory"
---

# /tdk-retro-collect - Collect Retro Feedback

## Error Handling

If any required TDK script exits non-zero, stop and show the exact error. The only allowed fallback is the local example fixture path `.specify/examples/specs/{task-id}` when it exists.

## Purpose

Collect evidence-backed signals after a spec implementation. This skill creates or updates `retro-feedback.md`; it does not propose or apply changes.

## References

- `../_shared/retro-feedback-schema.md`
- `../_shared/consumer-skill-discovery.md`
- `../_shared/script-command-contract.md`
- `references/phase-drift-detection.md`
- `references/langfuse-trace-analysis.md`

## Step 1: Resolve Feature Directory

Parse `$ARGUMENTS` as `TASK_ID`.

Run the prerequisite check using the shared script command contract:

```bash
PROJECT_DIR="$1"
if [ -z "$PROJECT_DIR" ] || [ ! -d "$PROJECT_DIR/.specify/scripts/ts" ]; then
  echo "Invalid project root: $PROJECT_DIR"
  echo 'Ask the user for the project root and re-run with: -- "<agent-resolved-project-root>"'
  exit 1
fi
(cd "$PROJECT_DIR/.specify/scripts/ts" && bun src/commands/util/check-prerequisites.ts {task_id} --json)
```

Store `FEATURE_DIR` from the JSON output.

Fixture fallback: if the script fails and `$PROJECT_DIR/.specify/examples/specs/{TASK_ID}/plan.md` exists, use that path as `FEATURE_DIR` and mark the run as `example-fixture`.

## Step 2: Parse Plan Phases

```bash
PROJECT_DIR="$1"
if [ -z "$PROJECT_DIR" ] || [ ! -d "$PROJECT_DIR/.specify/scripts/ts" ]; then
  echo "Invalid project root: $PROJECT_DIR"
  echo 'Ask the user for the project root and re-run with: -- "<agent-resolved-project-root>"'
  exit 1
fi
(cd "$PROJECT_DIR/.specify/scripts/ts" && bun src/commands/util/parse-phases-table.ts "{FEATURE_DIR}/plan.md" --json)
```

If parsing fails, stop. Phase drift detection depends on the canonical `## Phases` table.

## Step 3: Read Review Signals

Read review files from:

```text
{FEATURE_DIR}/reviews/*.md
{FEATURE_DIR}/review-reports/*.md
```

If neither directory exists, record `Status: skipped` for reviews with reason `no review files found`.

Extract findings semantically. Do not use regex-only parsing for markdown prose.

## Step 4: Detect Phase Drift

Follow `references/phase-drift-detection.md`.

Read `plan.md` and every phase file from the parsed phases table. Compare plan intent against phase content and status. Ask the user:

```text
Did any phase change approach, scope, or implementation strategy during execution?
```

Record only confirmed or evidence-backed drift.

## Step 5: Read Test-Mode Phase Results

Read canonical `{FEATURE_DIR}/phases/phase-*.md` files that contain TDD/backfill test sections such as `## Tests Before`, `## Tests After`, `## Regression Gate`, or `## Test Matrix`. Summarize pass/fail rows, incomplete phases, and repeated test issues.

If no test-mode phase evidence exists, record `Status: skipped` for test execution with reason `test-mode phase evidence not found`.

## Step 6: Analyze Langfuse Traces

Follow `references/langfuse-trace-analysis.md`.

Guard order:
1. `which langfuse` missing -> record skipped reason.
2. `{FEATURE_DIR}/sessions.txt` missing or empty -> record skipped reason.
3. `$PROJECT_DIR/.env` missing -> record skipped reason.
4. Otherwise fetch trace metadata for up to 10 session IDs.

Run Langfuse from project root so `--env .env` resolves correctly:

```bash
PROJECT_DIR="$1"
if [ -z "$PROJECT_DIR" ] || [ ! -d "$PROJECT_DIR/.specify/scripts/ts" ]; then
  echo "Invalid project root: $PROJECT_DIR"
  echo 'Ask the user for the project root and re-run with: -- "<agent-resolved-project-root>"'
  exit 1
fi
(cd "$PROJECT_DIR" && langfuse --env .env api traces list --session-id "{session_id}")
```

Analyze recurring errors, token waste, and tool misuse. Keep only evidence-backed findings.

## Step 7: Load Existing retro-feedback.md

If `{FEATURE_DIR}/retro-feedback.md` exists, read it before asking for user feedback.

Use modes:
- `create`: file does not exist; write all sections fresh.
- `update`: file exists; refresh collected source sections from this run and preserve active user feedback unless the user explicitly removes it.

For legacy user feedback bullets without IDs, assign sequential IDs before writing, starting at the next available `UF-###`.

## Step 8: Manage User Feedback

Use AskUserQuestion:

- Header: `Retro`
- Question: `Any recurring mistake, missed context, or workflow friction from this spec that should be captured?`
- Options:
  - `Add feedback` - Include the user's feedback in `retro-feedback.md`.
  - `Remove feedback` - Mark existing user feedback entries as removed.
  - `No change` - Keep current user feedback as-is.

Rules:
- In `create` mode, offer only `Add feedback` and `No change` unless existing fixture content already has active feedback.
- Add each new user feedback item with the next `UF-###` ID, `status: active`, severity, timestamp, and evidence `user answer`.
- If the user provides multiple points, write one entry per point.
- For removal, show existing active feedback IDs and summaries, ask which IDs to remove, then set `status: removed` with `removed_at` and optional `removal_reason`.
- Do not hard-delete removed feedback unless the user explicitly asks for deletion.

## Step 9: Write retro-feedback.md

Write `{FEATURE_DIR}/retro-feedback.md` using `../_shared/retro-feedback-schema.md`.

Required source sections:
- Reviews
- Phase Drift
- UT Execution
- Langfuse Traces
- User Feedback

## Completion

Report:
- `FEATURE_DIR`
- Sources fetched vs skipped
- Output path
- Next command: `/tdk-retro-propose {TASK_ID}`
