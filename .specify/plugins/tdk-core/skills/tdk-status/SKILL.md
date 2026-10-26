---
name: tdk-status
description: "This skill should be used when the user asks to 'check status', 'tdk-status', 'what's the progress of <task-id>', 'which branch is each repo on', or needs a read-only report of a TDK feature's artifacts, phase progress, and per-repository branch state. Never modifies files."
metadata:
  version: "14.3.4"
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

- `feature_status`: `empty` | `draft` | `ready` | `planned` | `in_progress` | `blocked` | `done` | `cancelled` | `archived`.
  Computed, not read: before a plan exists it is the live specification quality gate verdict (`ready` when
  `/tdk-plan` would accept the spec, else `draft`); once `plan.md` has a parseable `## Phases` table it is the
  same value the plan root `status:` is written with; a stored `archived` always wins
- `archived`: `true` when the spec was resolved under `<specsRoot>/archive/`, else `false`. In list mode,
  archived specs of the default folder are listed too, flagged `archived: true`; archived specs of other
  folders are not listed but resolve in detail mode (`archive/<folder>/<id>`, or a bare id missing from the
  active folder). Archived specs never get a `status_mismatch` warning
- `retro_status`: `none` | `collected` | `proposed` | `done`, derived from `retro-feedback.md` and
  `learning-delta.md` (no frontmatter field): `none` = no feedback, `collected` = feedback and no delta,
  `proposed` = delta has an entry that is not yet applied/rejected/blocked, `done` = every entry is
  applied/rejected/blocked. `retro_blocked`: number of `blocked` delta entries
- `memory_status`: `pending` | `partial` | `ingested` | `skipped`, read from the `close-out.md` frontmatter;
  `null` when there is no `close-out.md` (always present, including on active specs)
- `testEvidence.strength`: `strong` | `weak` | `none`. `strong` = plan `test_mode` is `tdd` / `ut_backfill`, a `done`
  phase has a test-shaped heading (`## Test Matrix`, `## Tests Before`, `## Tests After`, `## Regression Gate`), or a
  UT artifact exists (`ut-spec.md`, `ut/plan.md`, `coverage-analysis.md`, `ut-plan.md`, `coverage-report.json`).
  `weak` = no strong signal, but a `done` phase references a test path. `workflows.ut` is `true` when the strength is
  not `none`, and `utState` is derived from the same evidence
- `testEvidence.sources`: list of `plan_test_mode` | `test_phase` | `ut_artifact` | `phase_test_file_ref`
- `testEvidence.testPhases`: phases with a test-shaped heading, each `{ file, phase_status }`
- `testEvidence.skippedTestPhases`: test-shaped phases marked `skipped`; they are not evidence
- `reviews.count`: `reviews/*.md` reports whose frontmatter has a `verdict` (other files are listed in
  `reviews.ignored`); `reviews.fullCount`: how many of them have `scope: full`
- `reviews.latestFull`: newest `scope: full` report, or `null`; `reviews.latestAny`: newest report of any scope, or
  `null`. Both have the same shape: `reviews.latestFull.file`, `reviews.latestFull.verdict`
  (`pass` | `pass_with_concerns` | `changes_requested` | `blocked` | `unknown`), `reviews.latestFull.scope`,
  `reviews.latestFull.generatedAt`, `reviews.latestFull.blockedReason` (empty unless `blocked`),
  `reviews.latestFull.seedCount` (Ready lines under `## Proposed Fix Phases`), `reviews.latestFull.seedReady`
  (that line when there is exactly one, else `null`) and `reviews.latestFull.stale` (`plan.md` or a phase file
  changed after the report was generated)
- `reviews.ignored`: `reviews/*.md` files without a usable `verdict`, such as `analyze-report.md`
- `recommendation.primary` and `recommendation.alternative` (optional): each `{ command, reason }`;
  `recommendation.rule`: id of the ladder rule that produced them (for example `review-missing`, `archive-ready`,
  `archived-memory`)
- `stored_status.spec`, `stored_status.plan`: raw frontmatter `status:` of `spec.md` / `plan.md` as stored on disk,
  or `null` when the file or key is absent. Never branch on these; use `feature_status`
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
  `worktree path is not a worktree of this repository`, `nested worktree layout undefined`, or `not in config`
- `warnings[].level`: `stale` | `outdated` (with `warnings[].file` and `warnings[].days`), `status_mismatch`, or
  `status_fallback`. A `status_mismatch` warning carries `warnings[].file`, `warnings[].stored`,
  `warnings[].derived`, `warnings[].message`, and `warnings[].fix` (the command or step that repairs it). A
  `status_fallback` warning carries `warnings[].message` only
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
| `drifted` | ⚠️ | `git-map records {expectedBranch}` | append `— use /tdk-repo-worktree create if the repo is busy (not for a directory inside a nested repo or submodule: no worktree layout is defined there, and /tdk-review blocks on one)` |
| `not-created` | ⏸️ | `not created` | append `(seed: {baseRef})` when `baseRef` is set |
| `unknown` | ❔ | `{note}` | A sub-workspace that is a plain directory of the workspace repo (or of a repo
  enclosing the workspace) reports `not a separate git repository`; it shares that repo's branch and has none of its
  own. A directory inside a nested repo or submodule reports that repo's branch instead, as `matched` or `drifted`
  (`not-created` while the git-map records no branch for it), and `nested worktree layout undefined` when its recorded
  worktree exists |

Show `actualBranch` as the branch column, or `—` when it is `null`. When `worktreePath` is set, append
`@ {worktreePath}` so the reader knows which working root the branch was read from.

### ErcSpec Workflow (if `workflows.ercspec` is true)
```
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
📋 ErcSpec Default Workflow
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
```
- Artifact checklist: ✅/❌ for spec.md, plan.md with `modified` dates
- Feature status badge from `feature_status` field: `empty` | `draft` | `ready` | `planned` | `in_progress` | `blocked` | `done` | `cancelled` | `archived`

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

### Review & Close-out
Show for `done`, `cancelled`, and `archived` features:
```
Tests:   strong (plan_test_mode, test_phase · 2 test phases)
Reviews: 2 (latest full: pass_with_concerns · 2026-10-19)
Retro:   none
Memory:  pending
```
- `Tests:` `testEvidence.strength`, then `testEvidence.sources` and the `testEvidence.testPhases` count; append
  `N skipped` when `testEvidence.skippedTestPhases` is above 0
- `Reviews:` `reviews.count`, then the verdict and `generatedAt` date of `reviews.latestFull`; `no full review`
  when it is `null`; append `stale` when `reviews.latestFull.stale` is `true`
- `Retro:` `retro_status`, adding `retro_blocked` blocked entries when above 0; `Memory:` `memory_status`, archived
  features only

### UT Workflow (if `workflows.ut` is true)
`workflows.ut` and `utState` follow `testEvidence`, so test phases in the plan count as UT work too.
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
If `recommendation.primary.command` is empty, show only the reason (nothing left to do).

Recommendations come from the collector; render them, never recompute them. Commands always use the
canonical id `<folder>/<ticket>`, never an `archive/...` path. The collector walks the lifecycle
implement → test → review → archive → retro → memory update and stops at the first unmet step; the first
matching row wins, in this order. `recommendation.rule` names the row:

| `rule` | When | Primary | Alternative |
|---|---|---|---|
| `archived-retro` | archived, `retro_status` not `done` | `/tdk-retro-collect` / `-propose` / `-apply <id>` by `retro_status` | `/tdk-archive --ingest <id>` when `memory_status` is `pending` or `partial` |
| `archived-memory` | archived, retro `done`, `memory_status` `pending` or `partial` | `/tdk-archive --ingest <id>` | — |
| `archived-complete` | archived, retro `done`, memory `ingested`, `skipped`, or `null` | none (retro and memory complete) | — |
| `pre-plan` | `empty` / `draft` / `ready` | `/tdk-specify` / `/tdk-clarify` / `/tdk-plan <id>` | `/tdk-plan <id> --tdd` when `ready` |
| `impl-none` | `blocked`, or no `todo` / `in_progress` phase left | `/tdk-plan <id>` (re-evaluate) | — |
| `impl-all` | 2+ runnable phases | `/tdk-implement <id>` | `/tdk-implement <id> --phase NN` |
| `impl-next` | exactly 1 runnable phase | `/tdk-implement <id> --phase NN` | — |
| `cancelled` | `cancelled` | `/tdk-archive <id>` | — |
| `ut-missing` | `done`, `testEvidence.strength` `none` | `/tdk-plan <id> --ut-backfill` | `/tdk-review <id>` |
| `review-missing` | `done`, no full review | `/tdk-review <id>` | `/tdk-plan <id> --ut-backfill` when test evidence is `weak` |
| `review-blocked` | latest full verdict `blocked` | `/tdk-review <id>` | — |
| `review-unknown` | latest full verdict `unknown` | `/tdk-review <id>` | — |
| `review-stale` | latest full review older than `plan.md` / phase files | `/tdk-review <id>` | — |
| `review-changes` | latest full verdict `changes_requested` | the fix seed: its Ready line, or `/tdk-plan <id>` | `/tdk-review <id>` |
| `archive-ready` | latest full verdict `pass` / `pass_with_concerns` | `/tdk-archive <id>` | the fix seed when `pass_with_concerns` left seeds |

### 💭 Agent Insight (optional)
After the Recommendation, add this section only when something material is worth saying; omit it otherwise.
- At most 3 bullets. Each cites the JSON field or file path it rests on.
- Suggest existing TDK commands only, and never run them; this skill stays read-only.
- Never rewrite or replace the primary line. To disagree, write `differs from primary because <evidence>`.
- Skill availability: when the primary or alternative names a skill missing from your live skill catalog
  (for example `/tdk-retro-collect` without the `tdk-retro` plugin), say so and point at installing it or at the
  other option.
- UT judgment: when the ladder has moved past tests but a phase changed logic or data with no matching test file,
  you may suggest `/tdk-plan <id> --ut-backfill`, citing the phase file and the missing test path.
- Other signals worth a bullet: fix seeds not yet in the phase list, `git.uncommitted` above 0 before review or
  archive, `stale` / `outdated` warnings, drifted sub-workspaces, `/tdk-review <id> --phase NN` after a risky
  phase mid-implementation, and `reviews.latestAny` differing from `reviews.latestFull` (`/tdk-archive` close-out
  reads the newest review of any scope, the ladder the newest full one).

### Warnings
If `warnings[]` is non-empty, show each with ⚠️ icon:
- `stale` (>7 days): "May need refresh"
- `outdated` (>14 days): "Consider updating"
- `status_mismatch`: show `message`, then the repair line `warnings[].fix`
- `status_fallback`: show `message`

### Git Status
Show `git.rootBranch`, `git.featureBranch`, `git.featureBranchExists`, and `git.uncommitted` from the
`git` object. Every value here describes the **root workspace repository** only; per-repository branch
state lives in the `Sub-workspaces` section above.
