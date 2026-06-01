---
name: tdk-retro-propose
description: "Read retro-feedback.md and propose concrete technical or memory learning deltas. Writes learning-delta.md."
metadata:
  version: "0.1.0"
  category: "TDK Retro"
  requires:
    - tdk-retro-collect
    - tdk-memory-update
  input_format: "Task ID, for example: /tdk-retro-propose tdk-001"
  output_format: "learning-delta.md in the feature directory"
---

# /tdk-retro-propose - Propose Learning Delta

## Error Handling

If prerequisite resolution fails and no local example fixture exists, stop. Do not guess feature paths.

## Purpose

Transform collected feedback into up to 10 reviewable learning delta entries. This skill proposes changes only; it does not edit target files.

## References

- `../_shared/learning-delta-schema.md`
- `../_shared/signal-target-routing.md`
- `../_shared/consumer-skill-discovery.md`
- `../_shared/script-command-contract.md`

## Step 1: Resolve Feature Directory

Parse `$ARGUMENTS` as `TASK_ID`.

```bash
PROJECT_DIR="${CLAUDE_PROJECT_DIR:-${GITHUB_WORKSPACE:-$(git rev-parse --show-toplevel 2>/dev/null)}}"
if [ -z "$PROJECT_DIR" ]; then
  echo "Cannot resolve project root. Run from a git workspace or set CLAUDE_PROJECT_DIR/GITHUB_WORKSPACE."
  exit 1
fi
(cd "$PROJECT_DIR/.specify/scripts/ts" && bun src/commands/util/check-prerequisites.ts {task_id} --paths-only --json)
```

Store `FEATURE_DIR` from the JSON output.

Fixture fallback: if path resolution fails and `$PROJECT_DIR/.specify/examples/specs/{TASK_ID}/` exists, use that path as `FEATURE_DIR`. Do not require `plan.md`; this skill only requires `retro-feedback.md`.

## Step 2: Read Feedback

Read `{FEATURE_DIR}/retro-feedback.md`. If missing, stop and ask the user to run `/tdk-retro-collect {TASK_ID}` first.

When reading `## From: User Feedback`, use only entries with `status: active`; ignore entries with `status: removed`.

## Step 3: Discover Consumer Test Skills

Follow `../_shared/consumer-skill-discovery.md`:

```text
.claude/skills/*-ut/SKILL.md
.claude/skills/*-test/SKILL.md
```

If no consumer test skills exist, do not create T4 entries. Record the no-op in rationale when relevant.

## Step 4: Check Memory Availability

Check:

```text
.specify/memory/memory-index.md
.specify/memory/memory.yaml
```

If either is missing, ask:

```text
Memory is not initialized. Run /tdk-memory-init before proposing memory entries?
```

If the user declines or memory remains missing, skip K1/K2 targets and propose only technical targets T1-T6.

## Step 5: Classify Signals

For each feedback signal:
1. Classify root cause with `../_shared/signal-target-routing.md`.
2. Choose the narrowest target that prevents recurrence.
3. For memory targets, verify the domain exists in `memory-index.md`.
4. If domain is unknown, create a `blocked` entry that says to run `/tdk-memory-init`.
5. Limit output to 10 entries, highest severity first.

## Step 6: Write learning-delta.md

Write `{FEATURE_DIR}/learning-delta.md` using `../_shared/learning-delta-schema.md`.

Required fields per entry:
- status
- severity
- target_type
- target_id
- target_path
- operation
- domain for memory entries
- rationale
- evidence
- content

## Completion

Report:
- Entry count by target type
- Blocked entries
- Output path
- Next command: `/tdk-retro-apply {TASK_ID}`
