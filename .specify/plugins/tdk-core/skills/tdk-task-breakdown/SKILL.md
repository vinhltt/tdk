---
name: tdk-task-breakdown
description: "Generate portable Markdown work-item artifacts from a clarified spec. Use after /tdk-clarify and before tracker-specific issue sync owned by the consumer project."
metadata:
  version: "5.7.0"
---

# tdk-task-breakdown

Create portable work-item Markdown from a clarified `spec.md`.

## User Input

```text
$ARGUMENTS
```

## Boundary Declaration

**This command produces:**
- Markdown work-item artifacts under `{FEATURE_DIR}/tasks-breakdown/`
- `tasks-breakdown/index.md`
- `tasks-breakdown/task-NNN-{slug}.md` files

**This command does NOT:**
- Create implementation plans (use `/tdk-plan`)
- Implement code (use `/tdk-implement`)
- This command does NOT create GitHub, GitLab, Backlog, or other tracker issues
- Call external tracker APIs or CLIs

Core output is tracker-neutral Markdown. Consumer projects own any later issue creation or sync workflow.

## Skill References

Load before deriving any task content:
- `references/task-breakdown-output-contract.md`

## Execution Steps

### Step 0 - Validate Task ID

Invoke `tdk-validate-task-id` with `$ARGUMENTS` and host skill name `/tdk-task-breakdown`.
If STOP, halt execution.

Store: `TASK_ID`, `TASK_ID_SOURCE`.

### Step 0.1 - Load Project Context

Invoke `tdk-load-project-context` with validated `TASK_ID`.

Store: `PROJECT_CONTEXT`, `FEATURE_DIR`.

### Step 1 - Read Spec

Read `{FEATURE_DIR}/spec.md`.

If the file is missing, STOP and tell the user to run `/tdk-specify {TASK_ID}` and `/tdk-clarify {TASK_ID}` first.

### Step 1.5 - Optional HLD Context

If `{FEATURE_DIR}/high-level-design/index.md` exists, read the artifacts it lists as enrichment context. If it is absent, silently continue with no change in behavior.

HLD is enrichment only: it may sharpen task objective, scope, and dependency wording. It is never a citation source and never relaxes the citation rules. Citations remain `UR-*/FR-*/SC-*` from `spec.md`.

### Step 2 - Unresolved Questions Gate

Find `## 9. Unresolved Questions` in `spec.md`.

STOP before writing any file unless the section content is exactly `None` after trimming whitespace.

If the section is missing, contains bullets, contains placeholders, or contains anything other than `None`, STOP and report that `/tdk-clarify {TASK_ID}` must resolve the questions first.

### Step 3 - Load Output Contract

Read `references/task-breakdown-output-contract.md` from this skill directory.

Use that reference as the single source of truth for:
- Output filenames
- Frontmatter schema
- Required sections
- Task granularity rules
- Source requirement citation rules

### Step 4 - Extract Source Requirements

From `spec.md`, extract only durable requirement and acceptance identifiers:
- `UR-*` user requirements
- `FR-*` functional requirements
- `SC-*` success criteria

Ignore implementation guesses. Do not invent file paths, APIs, database tables, owners, estimates, or tracker labels unless they already appear in the spec.

### Step 5 - Derive Work Items

Create issue-sized tasks from the extracted requirements:
- Each task must cite at least one source requirement ID.
- Each task should be independently understandable outside TDK.
- Keep plan-phase sequencing out of scope unless the spec already states an ordering constraint.
- Prefer fewer coherent tasks over fragmented one-line tasks.
- When HLD context is present (Step 1.5), it may enrich objective, scope, and dependency wording only; citations stay `UR-*/FR-*/SC-*` from the spec.

If a work-item is large enough to be its own sub-feature (its own requirements, clarify, and plan), it can be **promoted** into an independent child spec instead of being tracked as a task here. See `.specify/docs/en/promote-convention.md` for the manual promote flow and the work-item-vs-child-spec sizing rule.

### Step 6 - Write Markdown Artifacts

Create or update only:
- `{FEATURE_DIR}/tasks-breakdown/index.md`
- `{FEATURE_DIR}/tasks-breakdown/task-NNN-{slug}.md`

Do not write `tasks.md`, plan files, tracker config, or implementation files.

`index.md` is the authoritative manifest for the current generated set. Consumer tracker sync must read the task files listed in `index.md`, not glob every file in `tasks-breakdown/`.

When regenerating an existing breakdown, read the current `index.md` first. Preserve any row whose `Status` is `promoted → <child-id>`: keep the row and its marker, and do NOT re-emit that item as a normal task or overwrite its task file. A promoted work-item now lives as an independent child spec, so re-emitting it would double-track it (see `references/task-breakdown-output-contract.md` and `.specify/docs/en/promote-convention.md`).

### Step 7 - Report Results

Report:
- Number of task files written
- Relative paths for `tasks-breakdown/index.md` and each task file
- Reminder: tracker issue creation is consumer-owned and out of TDK core scope

## Quality Gates

- [ ] `## 9. Unresolved Questions` is `None` before any write
- [ ] `references/task-breakdown-output-contract.md` was loaded
- [ ] Only `tasks-breakdown/index.md` and `tasks-breakdown/task-NNN-{slug}.md` were written
- [ ] Every task cites at least one `UR-*`, `FR-*`, or `SC-*`
- [ ] No tracker API or CLI call was made
