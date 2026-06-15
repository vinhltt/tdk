---
name: tdk-status
description: "Track Workflow Progress"
metadata:
  version: "3.4.11"
---

# /tdk-status - Track Workflow Progress

## ⛔ Error Handling
If ANY script returns an error, STOP immediately and report to user. Do NOT attempt workarounds.

## Purpose
Display comprehensive status for any ErcSpec feature workflow. **Read-only command - never modifies files.**

Source of truth: `plan.md` `## Phases` table. Missing `plan.md` or missing `## Phases` section → clear error.

## Shared JSON Contract

The status collector is also the read-only preflight contract for other skills, including `/tdk-implement`.

Consumers should call the collector directly:

```bash
bash -lc '
PROJECT_DIR="$1"
if [ -z "$PROJECT_DIR" ] || [ ! -d "$PROJECT_DIR/.specify/scripts/ts" ]; then
  echo "Invalid project root: $PROJECT_DIR" >&2
  exit 1
fi
(cd "$PROJECT_DIR/.specify/scripts/ts" && bun src/commands/feature/status.ts <feature-id>)
' -- "<agent-resolved-project-root>"
```

The agent must resolve `<agent-resolved-project-root>` from the active coding harness/session before running the command. Ask the user for the project root if it is unclear; do not pass the placeholder literally.

Use structured JSON fields, not this skill's formatted report or recommendation prose:

- `feature_status`: `empty` | `specified` | `planned` | `in_progress` | `complete` | `blocked`
- `phases.total`, `phases.done`, `phases.skipped`, `phases.inProgress`, `phases.todo`, `phases.blocked`, `phases.percent`
- `phases.currentPhase`: first `in_progress` phase file, or empty string
- `phases.nextPhase`: first `todo` phase file, or empty string
- `phases.rows[].phase_status`
- `error` and `phasesParseError` for stop conditions

The collector reads `plan.md` `## Phases`; appended phase files are visible only after they are added to that table.

## Step 1: Validate Task ID

Parse `$ARGUMENTS` for feature ID:

**If provided** (e.g., `mrr-1823`, `hotfix/aa-2`):
- Convert to lowercase, proceed to Step 2

**If missing**:
- Search conversation for previous `/tdk-*` command with task_id
- If found: confirm with AskUserQuestion → proceed
- If not found: show `Usage: /tdk-status <task-id>` → STOP

## Step 2: Run Status Collector

```bash
bash -lc '
PROJECT_DIR="$1"
if [ -z "$PROJECT_DIR" ] || [ ! -d "$PROJECT_DIR/.specify/scripts/ts" ]; then
  echo "Invalid project root: $PROJECT_DIR" >&2
  exit 1
fi
(cd "$PROJECT_DIR/.specify/scripts/ts" && bun src/commands/feature/status.ts <feature-id>)
' -- "<agent-resolved-project-root>"
```

Parse the JSON output. If `error` or `phasesParseError` field exists, display error message and STOP.

**Error conditions (no fallback):**
- Missing `plan.md` → show error: "No plan.md found. Run `/tdk-plan <task-id>` to create one."
- Missing `## Phases` section → show error: "plan.md has no ## Phases table. Run `/tdk-plan <task-id>` to regenerate."

## Step 3: Render Formatted Report

Using the JSON data, render the following sections:

### Header
```
╔══════════════════════════════════════════════════════╗
║  ErcSpec Status: Feature {feature_id}               ║
╚══════════════════════════════════════════════════════╝

Feature: {title}
Location: {location}
Branch: {git.branch}
```

### ErcSpec Workflow (if `workflows.ercspec` is true)
```
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
📋 ErcSpec Default Workflow
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
```
- Artifact checklist: ✅/❌ for spec.md, plan.md with `modified` dates
- Feature status badge from `feature_status` field: `empty` | `specified` | `planned` | `in_progress` | `complete` | `blocked`

**Phase Progress (from `phases.rows[]`):**
- Progress: `Phases: {phases.done}/{phases.total - phases.skipped} ({phases.percent}%)`
  - Note: skipped phases excluded from denominator per percent formula
- Progress bar: 22-char wide using █ (filled) and ░ (empty)
- Phase list from `phases.rows[]` using `phase_status` field:
  - `✅ Phase {number}: {fileLabel}` — if `phase_status` = `done`
  - `⏭️ Phase {number}: {fileLabel} (skipped)` — if `phase_status` = `skipped`
  - `⏳ Phase {number}: {fileLabel}` — if `phase_status` = `in_progress`
  - `🚫 Phase {number}: {fileLabel} (blocked)` — if `phase_status` = `blocked`
  - `⏸️ Phase {number}: {fileLabel}` — if `phase_status` = `todo`
- Current phase: `phases.currentPhase` (first in_progress)
- Next phase: `phases.nextPhase` (first todo)

### UT Workflow (if `workflows.ut` is true)
- Show 6 pipeline steps with status from `utState`
- Progress bar

### Recommendation
```
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
💡 RECOMMENDED NEXT STEP
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
→ {recommendation.primary.command}
Why: {recommendation.primary.reason}
```
If `recommendation.alternative` exists and `recommendation.alternative.command` is non-empty, show as 🔀 Alternative section.

### Warnings
If `warnings[]` is non-empty, show each with ⚠️ icon:
- `stale` (>7 days): "May need refresh"
- `outdated` (>14 days): "Consider updating"

### Git Status
Show branch, feature_branch_exists, uncommitted count from `git` object.
