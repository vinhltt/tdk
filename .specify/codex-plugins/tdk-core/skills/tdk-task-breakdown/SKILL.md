---
name: tdk-task-breakdown
description: "Generate parent epic child-spec-seed breakdown artifacts from epic PRD plus /tdk-epic-hld context. Use before child /tdk-specify loops."
metadata:
  version: "6.0.0"
---

# tdk-task-breakdown

Create parent epic child-spec-seed Markdown from epic PRD and epic HLD context.

## User Input

```text
$ARGUMENTS
```

Trigger: `/tdk-task-breakdown <epic-id> [--force]`

## Boundary Declaration

**This command produces:**
- Markdown child spec seed artifacts under `{FEATURE_DIR}/tasks-breakdown/`
- `tasks-breakdown/index.md`
- `tasks-breakdown/task-NNN-{slice}.md` files

**This command does NOT:**
- Create child `spec.md` files (use `/tdk-specify <child-id> "<seed>"`)
- Clarify child specs (use child `/tdk-clarify`)
- Create implementation plans (use child `/tdk-plan`)
- Implement code (use child `/tdk-implement`)
- Create GitHub, GitLab, Backlog, or other tracker issues
- Call external tracker APIs or CLIs
- Mint `UR-*`, `FR-*`, `SC-*`, or `FS-*` identifiers

Core output is tracker-neutral child spec seed Markdown. Child specs are the
implementation units after this stage.

## Skill References

Load before deriving any breakdown content:
- `references/task-breakdown-output-contract.md`

## Execution Steps

### Step 0 - Validate Epic ID

Invoke `tdk-validate-task-id` with `$ARGUMENTS` and host skill name `/tdk-task-breakdown`.
If STOP, halt execution.

Store: `TASK_ID`, `TASK_ID_SOURCE`.

### Step 0.1 - Load Project Context

Invoke `tdk-load-project-context` with validated `TASK_ID`.

Store: `PROJECT_CONTEXT`, `FEATURE_DIR`.

### Step 1 - Read Epic PRD

Require and read:

```text
{FEATURE_DIR}/epic-prd/index.md
{FEATURE_DIR}/epic-prd/prd.md
{FEATURE_DIR}/epic-prd/slice-map.md
{FEATURE_DIR}/epic-prd/open-questions.md
```

If any file is missing, STOP before writing and tell the user to run
`/tdk-epic-prd {TASK_ID}` first.

### Step 1.5 - Require Epic HLD Context

Require `{FEATURE_DIR}/high-level-design/index.md` and read the artifacts it
lists. If it is missing, STOP and tell the user to run `/tdk-epic-hld {TASK_ID}`
first.

HLD is parent design context only: it sharpens boundaries, dependencies,
assumptions, risks, and child spec seed wording. It is not requirement authority.

### Step 2 - Parent Readiness Gates

STOP before writing any file when:

- `epic-prd/open-questions.md` has any item under `## Blocking Questions`.
- `epic-prd/slice-map.md` has no independently specifiable slice.
- `epic-prd/slice-map.md` contains catch-all slices such as "all features",
  "entire MVP", or "whole epic".
- `high-level-design/index.md` does not mark the HLD set ready for task breakdown.

### Step 3 - Load Output Contract

Read `references/task-breakdown-output-contract.md` from this skill directory.

Use that reference as the single source of truth for:
- Output filenames
- Frontmatter schema
- Required sections
- Slice granularity rules
- Child spec seed rules
- Requirement-authority boundaries

### Step 4 - Extract Source Slices

From `epic-prd/slice-map.md`, extract slice keys, capability, actor, outcome,
dependencies, suggested child spec title, priority, and seed text.

From HLD artifacts, extract only boundary, dependency, data/user flow,
interface, assumption, risk, and follow-up context that affects child spec seed
quality.

Do not invent file paths, APIs, database tables, owners, estimates, tracker
labels, or formal requirement IDs unless the epic PRD or HLD explicitly states
them as assumptions to validate.

### Step 5 - Derive Child Spec Seeds

Create one breakdown file for each independently specifiable slice:

- Each item must cite a source slice key.
- Each item must include source PRD/HLD references.
- Each item must include suggested `/tdk-specify <child-id> "<seed>"` text.
- Each item must define boundary, dependencies, assumptions/risks, and what to
  clarify in the child spec.
- Prefer fewer coherent child specs over fragmented one-line seeds.

If a slice is too broad to become a child spec, STOP and tell the user to refine
the epic PRD slice map before writing output.

### Step 6 - Write Markdown Artifacts

Create or update only:
- `{FEATURE_DIR}/tasks-breakdown/index.md`
- `{FEATURE_DIR}/tasks-breakdown/task-NNN-{slice}.md`

Do not write `tasks.md`, child `spec.md`, plan files, tracker config, or
implementation files.

`index.md` is the authoritative manifest for the current generated set.
Consumers and agents must read the child spec seed files listed in `index.md`,
not glob every file in `tasks-breakdown/`.

### Step 7 - Report Results

Report:
- Number of child spec seed files written
- Relative paths for `tasks-breakdown/index.md` and each seed file
- Reminder: child specs start with `/tdk-specify <child-id> "<seed>"`
- Reminder: tracker issue creation is consumer-owned and out of TDK core scope

## Quality Gates

- [ ] Epic PRD artifacts exist before any write
- [ ] Epic HLD artifacts exist before any write
- [ ] `epic-prd/open-questions.md` has no blocking questions
- [ ] `references/task-breakdown-output-contract.md` was loaded
- [ ] Only `tasks-breakdown/index.md` and `tasks-breakdown/task-NNN-{slice}.md` were written
- [ ] Every seed cites a source slice key and PRD/HLD refs
- [ ] No `UR-*`, `FR-*`, `SC-*`, or `FS-*` identifiers were minted
- [ ] No child spec, plan, code, tracker API, or tracker CLI call was made
