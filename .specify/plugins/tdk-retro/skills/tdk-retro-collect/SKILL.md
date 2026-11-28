---
name: tdk-retro-collect
description: "Create or update retrospective feedback after a TDK spec: reviews, phase drift, UT results, Langfuse traces when available, and user feedback. Writes retro-feedback.md and supports adding or removing user feedback entries across repeated collection runs."
metadata:
  version: "1.5.2"
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
- `../_shared/archived-spec-handling.md`
- `references/phase-drift-detection.md`
- `references/langfuse-trace-analysis.md`

## Step 1: Resolve Feature Directory

Parse `$ARGUMENTS` as the raw task id (`{task_id}`). The canonical `TASK_ID` comes from the script output below.

Run the prerequisite check using the shared script command contract:

```bash
PROJECT_DIR="${1}"
if [ -z "$PROJECT_DIR" ] || [ ! -d "$PROJECT_DIR/.specify/scripts/ts" ]; then
  echo "Invalid project root: $PROJECT_DIR"
  echo 'Ask the user for the project root and re-run with: -- "<agent-resolved-project-root>"'
  exit 1
fi
(cd "$PROJECT_DIR/.specify/scripts/ts" && bun src/commands/util/check-prerequisites.ts {task_id} --json --allow-archived)
```

Store `FEATURE_DIR`, `TASK_ID` (the JSON `taskId`), and `ARCHIVED` (the JSON `archived`) from the output. Follow `../_shared/archived-spec-handling.md`: use `TASK_ID`, never the raw argument, in the `retro-feedback.md` heading and every command printed to the user. When `ARCHIVED` is `true`, write only `retro-feedback.md`.

Fixture fallback: if the script fails and `$PROJECT_DIR/.specify/examples/specs/{raw argument}/plan.md` exists, use that path as `FEATURE_DIR`, use the raw argument as `TASK_ID`, and mark the run as `example-fixture`.

### Re-collect guard

Read `retro_status` from the retro status lookup in `../_shared/archived-spec-handling.md` (skip it for an `example-fixture` run). When `retro_status` is `done`, the retro cycle for this spec is finished; ask before collecting again:

- Header: `Retro`
- Question: `Retro for {TASK_ID} is already complete. Collect again?`
- Options: `Collect again` - continue and refresh `retro-feedback.md`; `Stop` - end the run and write nothing.

On `Stop`, report that nothing was written.

## Step 2: Parse Plan Phases

```bash
PROJECT_DIR="${1}"
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
{FEATURE_DIR}/reports/red-team-yyMMdd-HHmmss-*.md
```

Never read `{FEATURE_DIR}/.tdk-tmp/red-team/**`. Apply logs and parse-fail
replies are transaction recovery state, not retrospective evidence. For
red-team sessions, use the final report and any unresolved deferred report.

If neither directory exists, record `Status: skipped` for reviews with reason `no review files found`.

Extract findings semantically. Do not use regex-only parsing for markdown prose.

### Map findings to fix phases

Map the findings of each tdk-review report to the phases planned to fix them. The map reads only the reports directly under `{FEATURE_DIR}/reviews/` (`reviews/*.md`): never `{FEATURE_DIR}/reviews/.diff/`, `review-reports/` or red-team reports. Read the labels below semantically too, like the findings above; do not match them with a regex alone.

A report's `Proposed Fix Phases` section starts at the last heading that names it, so a heading quoted in a finding's evidence does not count. Older reports may number it, as in `7. Proposed Fix Phases`. Then, per report, take the first case that applies:

- Its frontmatter `verdict` is `blocked`: `/tdk-plan` refuses it, so its findings can have no fix phase. Record `Status: skipped` for its map, with reason `review was blocked`. The finding extraction above still runs for it.
- No such section: the report stays out of the map.
- The section says `None.`: the report has no finding to map.
- The section has no `### G<k>` block or no `- Findings:` line: the report predates finding links. Record `Status: skipped` for its map, with reason `report predates finding links`. The finding extraction above still runs for it.
- Otherwise, map it:
  1. From each `### G<k>` block, read the finding IDs (`F<n>`) on its `- Findings:` line.
  2. Join each finding ID with the same report's **Findings by severity** section to get its severity. A `G<k>` block carries no severity.
  3. For each phase in the Step 2 table, read the `- Review:` line in the `## Context Links` section of its phase file, for example ``- Review: `../reviews/<file>.md` (F2, F5)``. It names the report, matched by file name, and in parentheses the finding IDs that phase fixes. A `Review:` line without parentheses links an older report and names no finding.
  4. Pair each finding with every phase whose `Review:` line names its report and its ID, with that phase's status from the Step 2 table. A finding named by several phases gets one pairing per phase.
  5. A finding that no phase names has no fix phase. Label it `no fix phase; no recorded reason`: why a group got no phase is never stored, so never guess a reason.

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
2. No session file (`sessions.jsonl` or `sessions.txt`) for `{FEATURE_DIR}` -> record skipped reason.
3. Session file present but no usable session id -> record skipped reason.
4. `$PROJECT_DIR/.env` missing -> record skipped reason.
5. Otherwise fetch trace metadata for up to 10 session IDs.

Build the ID list as a union of both files, never either/or: a session recorded
before the JSONL cutover exists only in the legacy `sessions.txt`, which is read
but never written. Dedupe by session ID, prefer the JSONL record's metadata,
order JSONL records in file order (append order = first-association order)
followed by legacy IDs in file order, and only then truncate to the first 10.

A corrupt line is skipped, never fatal: keep a JSONL line only when it parses to
an object carrying `v == 1` and a string `session`. Pass only that `session`
value to langfuse — never a whole JSON line.

Run Langfuse from project root so `--env .env` resolves correctly:

```bash
PROJECT_DIR="${1}"
FEATURE_DIR="${2}"
if [ -z "$PROJECT_DIR" ] || [ ! -d "$PROJECT_DIR/.specify/scripts/ts" ]; then
  echo "Invalid project root: $PROJECT_DIR"
  echo 'Ask the user for the project root and re-run with: -- "<agent-resolved-project-root>"'
  exit 1
fi

session_ids() {
  jq -rR 'fromjson? // empty | select(type == "object") | select(.v == 1)
          | select(.session | type == "string") | .session' \
    "$FEATURE_DIR/sessions.jsonl" 2>/dev/null
  grep -v '^[[:space:]]*$' "$FEATURE_DIR/sessions.txt" 2>/dev/null
}

session_ids | awk '!seen[$(0)]++' | head -10 | while read -r session_id; do
  (cd "$PROJECT_DIR" && langfuse --env .env api traces list --session-id "$session_id")
done
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

Under Reviews, after the finding bullets, write the Step 3 map as the schema's two blocks, `### Finding → fix phase` and `### Findings without a fix phase`.

## Completion

Report:
- `FEATURE_DIR`
- Sources fetched vs skipped
- Output path
- Next command: `/tdk-retro-propose {TASK_ID}`
