---
name: tdk-epic-hld
description: "Turn epic PRD artifacts into parent high-level design context before /tdk-task-breakdown. Use after /tdk-epic-prd; child specs do not run HLD by default."
metadata:
  version: "6.0.0"
---

# tdk-epic-hld

Produce parent epic high-level design (HLD) artifacts from `/tdk-epic-prd`
output before `/tdk-task-breakdown`.

## User Input

```text
$ARGUMENTS
```

Trigger: `/tdk-epic-hld <epic-id> [--force]`

- `--force` skips the duplicate-directory prompt and takes the overwrite path.
  It never bypasses the epic PRD readiness gates.

## Boundary Declaration

**This command produces:**
- Six Markdown HLD artifacts under `{FEATURE_DIR}/high-level-design/`
- `high-level-design/index.md` (authoritative manifest)
- `requirement-overview.md`, `project-and-technical-overview.md`, `data-flow.md`, `screen-flow.md`, `decisions-and-risks.md`

**This command does NOT:**
- Create child `spec.md` files (use `/tdk-specify` from task-breakdown seeds)
- Create implementation plans (use `/tdk-plan` on a clarified child spec)
- Implement code (use `/tdk-implement`)
- Create portable child spec seeds (use `/tdk-task-breakdown`)
- Create GitHub, GitLab, Backlog, or other tracker issues, or call tracker APIs/CLIs
- Mint `UR-*`, `FR-*`, `SC-*`, or `FS-*` identifiers

HLD is parent epic design context for safe decomposition. Child specs are the
requirement authority and do not run HLD by default.

## Skill References

Load before generating any artifact:
- `references/high-level-design-output-contract.md`
- `references/high-level-design-lenses.md`
- `references/high-level-design-skill-routing.md`

## Execution Steps

### Step 0 - Validate Epic ID

Invoke `tdk-validate-task-id` with `$ARGUMENTS` and host skill name `/tdk-epic-hld`.
If STOP, halt execution.

Store: `TASK_ID`, `TASK_ID_SOURCE`.

### Step 0.1 - Load Project Context

Invoke `tdk-load-project-context` with validated `TASK_ID`.

Store: `PROJECT_CONTEXT`, `FEATURE_DIR`.

### Step 1 - Read Epic PRD

Require and read exactly these parent epic PRD artifacts:

```text
{FEATURE_DIR}/epic-prd/index.md
{FEATURE_DIR}/epic-prd/prd.md
{FEATURE_DIR}/epic-prd/slice-map.md
{FEATURE_DIR}/epic-prd/open-questions.md
```

If any file is missing, STOP before writing and tell the user to run
`/tdk-epic-prd {TASK_ID}` first.

### Step 2 - Epic PRD Readiness Gates

STOP before writing any file when:

- `epic-prd/open-questions.md` has any item under `## Blocking Questions`.
- `epic-prd/slice-map.md` has no independently specifiable slice.
- `epic-prd/slice-map.md` contains catch-all slices such as "all features",
  "entire MVP", or "whole epic".

These gates are never bypassable. `--force` does not override them.

### Step 3 - Load Output Contract

Read `references/high-level-design-output-contract.md` from this skill directory.

Use that reference as the single source of truth for:
- Output filenames and directory
- `index.md` schema and per-artifact section schemas
- Epic PRD source mapping
- Slice-boundary and breakdown-readiness rules
- Requirement-authority rules

### Step 3.1 - Load Built-In HLD Lenses

Read `references/high-level-design-lenses.md` from this skill directory.

Use the built-in lenses to enrich parent epic design with slice boundaries,
quality attributes, security posture, data/API assumptions, user journey
touchpoints, and operability concerns. Lens findings may become assumptions,
risks, decisions, or follow-ups only.

### Step 3.2 - Load Optional HLD Skill Routing

Read `references/high-level-design-skill-routing.md` from this skill directory.

Resolve optional project routing from:

```text
{PROJECT_CONTEXT.docs.path}/custom-workflow/high-level-design-skill-routing.md
```

The missing HLD routing file is non-blocking; continue with built-in lenses when
it does not exist.

When routing exists, read matching consumer `SKILL.md` files as advisory design
lenses. Consumer HLD skills are advisory only: they may provide design notes,
risks, assumptions, or questions, but they must not write files, create
requirement IDs, invoke implementation skills, or change status.

Do not create `## Delegate Skills` in any HLD artifact. Do not write outside the
six contracted HLD artifacts.

### Step 4 - Extract Parent Design Context

From epic PRD artifacts, extract:

- product objective and scope boundaries from `prd.md`
- slice keys, boundaries, dependencies, and child spec seeds from `slice-map.md`
- blocking/non-blocking ambiguity from `open-questions.md`
- source discovery links from `index.md`

Do not invent file paths, APIs, database tables, owners, estimates, labels, or
formal requirement IDs. If the PRD or slice map is too vague for decomposition,
STOP and tell the user to rerun `/tdk-epic-prd {TASK_ID} --interview` or update
the epic PRD.

### Step 5 - Generate Artifacts

Generate the six artifacts from the templates under
`.specify/templates/high-level-design/`, following the contract:

- Use epic PRD slice keys and source artifact references for traceability.
- Do not cite or mint `UR-*`, `FR-*`, `SC-*`, or `FS-*`.
- Optimize output for `/tdk-task-breakdown`: slice boundaries, dependencies,
  interfaces, data/user flow assumptions, design risks, and child spec seed
  impact.
- Fold lens and advisory consumer findings into existing artifact sections as
  assumptions, risks, decisions, or follow-ups only.
- Text-first; Mermaid optional.

### Step 6 - Duplicate Directory Handling

If `{FEATURE_DIR}/high-level-design/` already exists:
- Without `--force`: ask the user (AskUserQuestion) whether to **update** or **overwrite**.
  - **update** = regenerate the skill-generated artifacts in place; do NOT delete the directory; preserve user-edited and non-generated files.
  - **overwrite** = delete the directory and fully regenerate.
- With `--force`: skip the prompt and take the overwrite path.

The Step 2 gates still run first regardless of `--force`.

### Step 7 - Report Results

Report:
- Relative paths for `high-level-design/index.md` and each artifact written
- Whether update or overwrite was taken (when the directory pre-existed)
- Readiness for `/tdk-task-breakdown {TASK_ID}`

## Quality Gates

- [ ] Epic PRD artifacts exist before any write
- [ ] `epic-prd/open-questions.md` has no blocking questions
- [ ] `epic-prd/slice-map.md` contains independently specifiable slices
- [ ] `references/high-level-design-output-contract.md` was loaded
- [ ] `references/high-level-design-lenses.md` was loaded
- [ ] `references/high-level-design-skill-routing.md` was loaded
- [ ] Only the six contracted artifacts under `high-level-design/` were written
- [ ] No `UR-*`, `FR-*`, `SC-*`, or `FS-*` identifiers were minted
- [ ] No child spec, implementation plan, code, task file, or tracker issue was produced
