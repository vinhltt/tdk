---
name: tdk-high-level-design
description: "Turn a clarified spec.md into approval-level high-level design artifacts. Use after /tdk-clarify and before /tdk-task-breakdown for greenfield features."
metadata:
  version: "5.3.0"
---

# tdk-high-level-design

Produce approval-level high-level design (HLD) artifacts from a clarified `spec.md`.

## User Input

```text
$ARGUMENTS
```

Trigger: `/tdk-high-level-design <task-id> [--greenfield] [--force]`

- `--greenfield` is an explicit no-op marker. Greenfield is the default and only supported mode; the flag documents intent and reserves the brownfield extension point.
- `--force` skips the duplicate-directory prompt and takes the overwrite path. It never bypasses the Unresolved Questions gate.

## Boundary Declaration

**This command produces:**
- Six Markdown HLD artifacts under `{FEATURE_DIR}/high-level-design/`
- `high-level-design/index.md` (authoritative manifest)
- `requirement-overview.md`, `project-and-technical-overview.md`, `data-flow.md`, `screen-flow.md`, `decisions-and-risks.md`

**This command does NOT:**
- Create implementation plans (use `/tdk-plan`)
- Implement code (use `/tdk-implement`)
- Create portable tasks (use `/tdk-task-breakdown`)
- Create GitHub, GitLab, Backlog, or other tracker issues, or call tracker APIs/CLIs

HLD is approval/product/system design. Implementation execution belongs to `/tdk-plan`.

## Skill References

Load before generating any artifact:
- `references/high-level-design-output-contract.md`

## Execution Steps

### Step 0 - Validate Task ID

Invoke `tdk-validate-task-id` with `$ARGUMENTS` and host skill name `/tdk-high-level-design`.
If STOP, halt execution.

Store: `TASK_ID`, `TASK_ID_SOURCE`.

### Step 0.1 - Load Project Context

Invoke `tdk-load-project-context` with validated `TASK_ID`.

Store: `PROJECT_CONTEXT`, `FEATURE_DIR`.

### Step 1 - Read Spec

Read `{FEATURE_DIR}/spec.md`.

If the file is missing, STOP and tell the user to run `/tdk-specify {TASK_ID}` and `/tdk-clarify {TASK_ID}` first.

### Step 2 - Unresolved Questions Gate

Find `## 9. Unresolved Questions` in `spec.md`.

STOP before writing any file unless the section content is exactly `None` after trimming whitespace.

If the section is missing, contains bullets, contains placeholders, or contains anything other than `None`, STOP and report that `/tdk-clarify {TASK_ID}` must resolve the questions first.

This gate always runs first and is never bypassable. `--force` does not override it.

### Step 3 - Load Output Contract

Read `references/high-level-design-output-contract.md` from this skill directory.

Use that reference as the single source of truth for:
- Output filenames and directory
- `index.md` schema and per-artifact section schemas
- The spec-section to artifact mapping
- Citation rules (enrich-only) and design-detail rules
- Greenfield rules

### Step 4 - Extract and Map

From `spec.md`, extract only durable identifiers (`UR-*`, `FR-*`, `SC-*`) and Key Entities. Apply the contract's spec-section to artifact mapping.

Do not invent file paths, APIs, database tables, owners, estimates, or labels unless the spec already states them. If the spec uses prose without stable identifiers, STOP and tell the user to update the spec.

### Step 5 - Generate Artifacts

Generate the six artifacts from the templates under `.specify/templates/high-level-design/`, following the contract:
- Cite `UR-*/FR-*/SC-*` only; enrich existing requirements, never mint new IDs.
- Originate design detail (technical assumptions, integration, security, operability) only in `project-and-technical-overview.md`, and mark every originated entry `assumed`.
- Route any genuinely new requirement to `decisions-and-risks.md` as a non-blocking follow-up (re-run specify/clarify).
- Text-first; Mermaid optional.

### Step 6 - Duplicate Directory Handling

If `{FEATURE_DIR}/high-level-design/` already exists:
- Without `--force`: ask the user (AskUserQuestion) whether to **update** or **overwrite**.
  - **update** = regenerate the skill-generated artifacts in place; do NOT delete the directory; preserve user-edited and non-generated files.
  - **overwrite** = delete the directory and fully regenerate.
- With `--force`: skip the prompt and take the overwrite path.

The Step 2 gate still runs first regardless of `--force`.

### Step 7 - Report Results

Report:
- Relative paths for `high-level-design/index.md` and each artifact written
- Whether update or overwrite was taken (when the directory pre-existed)
- Readiness for `/tdk-task-breakdown {TASK_ID}`

## Quality Gates

- [ ] `## 9. Unresolved Questions` is `None` before any write
- [ ] `references/high-level-design-output-contract.md` was loaded
- [ ] Only the six contracted artifacts under `high-level-design/` were written
- [ ] Every requirement-derived statement cites a `UR-*`, `FR-*`, or `SC-*`
- [ ] Originated design detail is marked `assumed`
- [ ] No implementation plan, code, task, or tracker issue was produced
