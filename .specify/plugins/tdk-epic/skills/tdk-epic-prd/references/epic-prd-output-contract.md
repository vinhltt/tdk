# tdk-epic-prd Output Contract

This reference is the single source of truth for `/tdk-epic-prd` Markdown
artifacts.

Epic PRD is epic-level product alignment only. It turns discovery context into
MVP appetite, risks, open questions, and independently specifiable child slices.
It does not produce requirements, specifications, plans, tasks, HLD artifacts,
code, product-memory updates, or tracker records.

Only child `spec.md` artifacts mint `UR-*`, `FR-*`, and `SC-*`. Epic PRD
artifacts must not mint `FS-*`.

## Allowed Output Shape

```text
{FEATURE_DIR}/index.md
{FEATURE_DIR}/epic-prd.md
{FEATURE_DIR}/epic-prd/
  prd.md
  slice-map.md
  open-questions.md
```

No other epic PRD output is allowed.

## Shared Frontmatter

Each artifact begins with:

```yaml
---
source_epic: "<task-id>"
artifact_type: "<epic-prd|prd|slice-map|open-questions>"
status: draft
created: "<ISO-8601 timestamp>"
---
```

## Epic Dashboard

`{FEATURE_DIR}/index.md` is the TDK-owned epic dashboard. Epic PRD creates or
updates generated dashboard sections for current stage, stage manifest links,
readiness, authority boundary, and next command. The epic PRD stage manifest is
`epic-prd.md`.

If an existing dashboard has user-edited content inside a generated section the
command would replace, ask for confirmation or require `--force`. In
noninteractive contexts, STOP with guidance instead of overwriting user edits.
User-owned sections outside generated markers are preserved.

## epic-prd.md

Purpose: manifest and navigation file for the epic PRD set.

Required sections:

- `# Epic PRD Manifest`
- `## Source Discovery`
- `## Artifact Map`
- `## Readiness Gate`
- `## Next Commands`

`Readiness Gate` is not ready when Blocking Questions exist.

## prd.md

Purpose: align the epic's product intent before child specs are written.

Required sections:

- `# Epic PRD: {{EPIC_NAME}}`
- `## Source Summary`
- `## Problem And Current State`
- `## Personas And Jobs To Be Done`
- `## Objectives And Outcomes`
- `## Scope`
- `## MVP Appetite`
- `## Assumptions`
- `## Risks And No-Gos`
- `## Source Trace`

The PRD may describe outcomes and constraints. It must not include formal
acceptance criteria, implementation tasks, or requirement identifiers.

## slice-map.md

Purpose: propose independently specifiable child slices.

Required sections:

- `# Epic Slice Map`
- `## Slice Table`
- `## Suggested Build Order`
- `## Child Spec Seeds`
- `## Slice Rules`

`Slice Table` columns:

```text
Slice key | Capability | Primary actor | Outcome | Depends on | Suggested child spec title | Priority
```

Slice keys are lowercase slugs, not requirement IDs.

## open-questions.md

Purpose: distinguish blockers from non-blocking ambiguity before downstream
epic design, breakdown, or child specs.

Required sections:

- `# Epic PRD Open Questions`
- `## Blocking Questions`
- `## Non-Blocking Questions`
- `## Assumptions Needing Evidence`
- `## Source Trace`

Blocking questions prevent the epic PRD readiness gate from claiming ready.

## Allowed In-Section Additions

Within the four required artifacts, the following refine existing sections and
are NOT new outputs:

- Interview alignment notes folded into product intent, slice boundaries,
  readiness, or open questions.
- Source-trace notes pointing back to discovery sections.
- Confidence labels for inferred claims.
- Human-readable child `/tdk-specify` seed text.

These add no requirement IDs, no new files, and no tracker records.

## Forbidden outputs

Epic PRD MUST NOT create or emit:

- Requirement or success IDs. Only child `spec.md` artifacts mint `UR-*`,
  `FR-*`, and `SC-*`.
- `FS-*` or any formal feature-slice identifier.
- `spec.md`, `plan.md`, phase files, HLD files, task files, code, product-memory
  updates, or tracker records.
- GitHub, GitLab, Backlog, or other tracker integration.
- Any additional epic PRD file beyond the four allowed files.

Epic PRD remains tracker-neutral and does not create tracker issues.

## Legacy Layout Detection

If `epic-prd/index.md` exists and sibling `epic-prd.md` is missing, STOP with
`legacy layout detected`. Tell the user to rerun `/tdk-epic-prd <epic-id>` with
`--force` or recreate the test epic. do not auto-migrate old nested `index.md`
content into the new layout.
