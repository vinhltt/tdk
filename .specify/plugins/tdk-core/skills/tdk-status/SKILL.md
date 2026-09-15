---
name: tdk-status
description: "This skill should be used when the user asks to 'check status', 'tdk-status', 'what's the progress of <task-id>', 'which branch is each repo on', or needs a read-only report of a TDK feature's artifacts, phase progress, and per-repository branch state. Never modifies files."
metadata:
  version: "13.0.2"
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
- `git.available`, `git.branch`, `git.uncommitted`
- `git.rootBranch`: live branch of the **artifact host** (same value as `git.branch`). This is not a
  milestone — a milestone belongs to a code repository, and on a polyrepo the artifact host is not one
- `git.featureBranch`: `feature_branch` from `spec.md`; falls back to `<defaultFolder>/<ticket>` when absent or invalid
- `git.featureBranchExists`: whether that branch exists in the root repository
- `git.milestone`: **single-repository projects only** — the milestone for the artifact host, which is
  also the code repository there. Absent on a polyrepo, where milestones are per sub-workspace
- `git.milestoneState`: **single-repository projects only** — `matched` | `drifted` | `unknown`,
  derived from whether the feature branch exists and descends from the milestone
- `subWorkspaces[].name`: sub-workspace identity
- `subWorkspaces[].path`: workspace-relative path — from config, or from the map row when the row is no longer in config
- `subWorkspaces[].expectedBranch`: branch recorded in that repository's own `git-map.md` row, or `null` when
  the row is absent, still seeded, or the repository is untouched by this task
- `subWorkspaces[].actualBranch`: branch the repository is live on, or `null` when it could not be read
- `subWorkspaces[].worktreePath`: working-root override, or `null` when the main checkout is used
- `subWorkspaces[].state`: `matched` | `drifted` | `not-created` | `unknown`
- `subWorkspaces[].baseRef`: base ref recorded for that repository
- `subWorkspaces[].milestone`: effective milestone for that repository, resolved by the git-map
  contract's precedence — the spec's map wins over the recorded `Milestone` column
- `subWorkspaces[].milestoneState`: `matched` | `drifted` | `unverified` | `unknown` | `invalid`.
  `invalid` means the recorded base commit is present but unusable and must be fixed by hand;
  `unverified` means no base commit was recorded, so the base cannot be checked
- `subWorkspaces[].note`: short explanation, present only on `unknown` rows — `detached HEAD`,
  `not a separate git repository`, `not a git working tree`, `recorded worktree is missing`,
  `worktree path is not a worktree of this repository`, or `not in config`
- `error` and `phasesParseError` for stop conditions

Every branch field listed above is additive: no previously published field changed name or type.
The whole `subWorkspaces` key is omitted on single-repo projects, and `git.milestone` /
`git.milestoneState` appear only there.

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
Artifact host: {git.rootBranch}
```

Display only. Never warn about the branch here and never suggest a checkout — `tdk-branch-preflight`
owns that comparison and the action that follows it.

### Sub-workspaces

Render this section only when `subWorkspaces` is present and non-empty. Omit it entirely otherwise — a
single-repo project must see the exact output it saw before this section existed.

```
Sub-workspaces (3)
  api   apps/api   feature/sample-001  ✅ matches git-map
  web   apps/web   develop             ⚠️ git-map records feature/sample-001
  jobs  apps/jobs  —                   ⏸️ not created (seed: origin/main)
```

One line per entry, using `subWorkspaces[].state`:

| `state` | Icon | Text | Extra |
|---|---|---|---|
| `matched` | ✅ | `matches git-map` | — |
| `drifted` | ⚠️ | `git-map records {expectedBranch}` | append `— use /tdk-repo-worktree create if the repo is busy` |
| `not-created` | ⏸️ | `not created` | append `(seed: {baseRef})` when `baseRef` is set |
| `unknown` | ❔ | `{note}` | A sub-workspace that is a plain directory of the root repo reports
  `not a separate git repository`; it shares the root's branch and has none of its own |

Show `actualBranch` as the branch column, or `—` when it is `null`. When `worktreePath` is set, append
`@ {worktreePath}` so the reader knows which working root the branch was read from.

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
Show `git.rootBranch`, `git.featureBranch`, `git.featureBranchExists`, and `git.uncommitted` from the
`git` object. Every value here describes the **root workspace repository** only; per-repository branch
state lives in the `Sub-workspaces` section above.
