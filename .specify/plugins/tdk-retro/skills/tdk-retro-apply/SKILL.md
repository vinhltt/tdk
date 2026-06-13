---
name: tdk-retro-apply
description: "Review learning-delta.md entries with the user, apply approved technical edits, delegate approved memory edits to tdk-memory-update, and update entry statuses."
metadata:
  version: "0.1.1"
  category: "TDK Retro"
  requires:
    - tdk-retro-propose
    - tdk-memory-update
  input_format: "Task ID, for example: /tdk-retro-apply tdk-001"
  output_format: "Applied changes and updated learning-delta.md statuses"
---

# /tdk-retro-apply - Apply Learning Delta

## Error Handling

If a target file changed since proposal, read the current file and regenerate the preview before asking for approval. If an approved entry fails to apply, mark it `blocked` with the exact reason.

## Purpose

Apply only user-approved learning deltas. Technical targets are edited directly. Memory targets are delegated to `/tdk-memory-update`; never edit `.specify/memory/` directly.

## References

- `../_shared/learning-delta-schema.md`
- `../_shared/script-command-contract.md`
- `references/apply-flow-technical.md`
- `references/apply-flow-memory.md`
- `references/memory-delegate-contract.md`

## Step 1: Resolve Feature Directory

Parse `$ARGUMENTS` as `TASK_ID`.

```bash
PROJECT_DIR="$1"
if [ -z "$PROJECT_DIR" ] || [ ! -d "$PROJECT_DIR/.specify/scripts/ts" ]; then
  echo "Invalid project root: $PROJECT_DIR"
  echo 'Ask the user for the project root and re-run with: -- "<agent-resolved-project-root>"'
  exit 1
fi
(cd "$PROJECT_DIR/.specify/scripts/ts" && bun src/commands/util/check-prerequisites.ts {task_id} --paths-only --json)
```

Store `FEATURE_DIR` from the JSON output.

Fixture fallback: if path resolution fails and `$PROJECT_DIR/.specify/examples/specs/{TASK_ID}/` exists, use that path as `FEATURE_DIR`. Do not require `plan.md`; this skill only requires `learning-delta.md`.

## Step 2: Read Delta

Read `{FEATURE_DIR}/learning-delta.md`. If missing, stop and ask the user to run `/tdk-retro-propose {TASK_ID}` first.

Process entries with `status: proposed` or `status: approved`. Skip `rejected`, `blocked`, and `applied`.

## Step 3: Review Each Entry

For each pending entry:
1. Read the current target file when it exists.
2. Build a concise before/after preview.
3. AskUserQuestion:
   - `Approve` - apply this entry.
   - `Reject` - mark rejected.
   - `Skip` - leave proposed.

Show target path, operation, rationale, and evidence in the prompt.

## Step 4: Apply Approved Technical Entries

Follow `references/apply-flow-technical.md`.

Allowed target types:
- T1 through T6

Use Read/Edit/Write on the target path. Create a new file only when the operation explicitly says `add` and the path is inside an allowed project documentation, rule, config, or skill directory.

After success, update the entry status to `applied`.

## Step 5: Delegate Approved Memory Entries

Follow `references/apply-flow-memory.md` and `references/memory-delegate-contract.md`.

For K1/K2 entries, invoke `/tdk-memory-update` with natural language that includes the domain and content:

```text
In domain {domain}, {content}
```

If memory is not initialized or the domain is unknown, mark the entry `blocked` and explain which `/tdk-memory-init` action is needed.

## Step 6: Update learning-delta.md

After each entry, update the entry status in `{FEATURE_DIR}/learning-delta.md`:
- `applied`
- `rejected`
- `blocked`
- remains `proposed` when skipped

## Step 7: Report

Report:
- Applied count
- Rejected count
- Blocked count
- Remaining proposed count
- Suggested commit message: `feat(retro): apply learnings from {TASK_ID}`
