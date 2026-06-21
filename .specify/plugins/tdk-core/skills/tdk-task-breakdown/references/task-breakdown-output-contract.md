# Task Breakdown Output Contract

This reference is the single source of truth for `/tdk-task-breakdown` Markdown artifacts.

## Output Directory

All files are written under:

```text
{FEATURE_DIR}/tasks-breakdown/
```

Allowed files:

```text
tasks-breakdown/index.md
tasks-breakdown/task-NNN-{slug}.md
```

Do not create `tasks.md`, tracker config, implementation plans, or source code.

`tasks-breakdown/index.md` is authoritative. Consumer tracker sync must read task files listed in `index.md`, not discover tasks by globbing the directory.

## Index Schema

`tasks-breakdown/index.md` must use this structure:

```markdown
---
task_id: "{TASK_ID}"
source_spec: "../spec.md"
artifact_type: "portable-task-breakdown"
tracker_sync: "consumer-owned"
---

# Task Breakdown

## Source

- Spec: `../spec.md`
- Unresolved Questions: `None`

## Tasks

| # | Task | Source Requirements | File | Status |
|---|------|---------------------|------|--------|
| 001 | Example task title | UR-001, FR-001, SC-001 | [task-001-example-task-title.md](./task-001-example-task-title.md) | |
| 012 | Build importer sub-feature | UR-003, FR-007 | [task-012-build-importer-sub-feature.md](./task-012-build-importer-sub-feature.md) | promoted → feat-123 |

## Tracker Boundary

These files are portable Markdown work items. TDK core does not create external tracker issues.

## Sync Boundary

Consumer-owned tracker sync must treat `tasks-breakdown/index.md` as the manifest. Files not listed in the current index are non-authoritative and must not be synced just because they exist in the directory.
```

## Promoted Work Items

A work-item large enough to be its own sub-feature may be **promoted** into an
independent child spec (see `.specify/docs/guides/promote-convention.md`). The
`Status` column is how the index records that, so a promoted item is never
double-tracked as both a work-item here and a child spec.

- **Status column.** Trailing column on the `## Tasks` table. Empty means active
  (the normal case). A promoted row reads `promoted → <child-id>` where
  `<child-id>` is the child spec's id (e.g. `feat-123`, or `test/aa-100` when the
  child is in a non-default category).
- **Back-link.** The child spec carries `promoted_from: "NNN"` in its frontmatter.
  This is a **best-effort human annotation only, not a machine-resolvable
  back-link** — regeneration may renumber tasks when the task meaning changes, so
  `promoted_from` can dangle. The authoritative trace is `parent_spec` (child →
  parent) plus the `promoted → <child-id>` index marker (parent → child). Do not
  build tooling that resolves `promoted_from` programmatically.
- **Regeneration rule.** On regenerate, read the existing `index.md` first. For any
  row whose `Status` is `promoted → ...`, preserve that row and its marker and do
  NOT re-emit the item as a normal task or overwrite its task file.
- **Demote (manual, no command).** To revert a child spec back to a normal
  work-item: delete or archive `specs/<child-id>/`, close its tracker issue (when
  consumer tracker-sync exists), and clear the `promoted → <child-id>` marker in
  the parent index row. Loose coupling (link in frontmatter, not path) makes this
  safe.
- **Consumer advisory.** `Status` is appended as the **last** column. Any
  downstream tool that parses `index.md` by column index must read `Status` as the
  trailing column; column-name-based parsing is unaffected.

## Task File Schema

Each `task-NNN-{slug}.md` must use this structure:

```markdown
---
task_id: "{TASK_ID}"
work_item: "NNN"
title: "Short imperative task title"
source_spec: "../spec.md"
source_requirements: ["UR-001", "FR-001", "SC-001"]
tracker_sync: "consumer-owned"
---

# NNN. Short imperative task title

## Objective

One concise paragraph describing the user-visible or workflow outcome.

## Source Requirements

- UR-001: Brief copied or paraphrased requirement text
- FR-001: Brief copied or paraphrased requirement text
- SC-001: Brief copied or paraphrased success criterion

## Scope

### In

- Concrete work included in this external issue-sized task.

### Out

- Work explicitly excluded or deferred.

## Acceptance Criteria

- [ ] Observable result tied to the cited source requirements.
- [ ] Error or edge behavior when relevant.

## Notes

- Optional implementation constraints already present in the spec.
```

## Filename Rules

- Number tasks from `001`.
- Use `task-NNN-{slug}.md`.
- Use lowercase kebab-case for `{slug}`.
- Slug derives from the task title.
- Keep filenames stable if regenerating unless the task meaning changes.

## Task Granularity Rules

- One task should map to one external issue-sized unit of work.
- Each task must cite at least one `UR-*`, `FR-*`, or `SC-*`.
- Group tightly related requirements when they form one coherent user outcome.
- Split tasks when acceptance criteria require different actors, workflows, or validation surfaces.
- Do not include implementation file paths unless `spec.md` already states them.
- Do not add owners, estimates, priorities, labels, milestones, or tracker IDs unless `spec.md` already states them.

## Source Requirement Rules

Valid citations:
- `UR-*`
- `FR-*`
- `SC-*`

Every task file must include a `## Source Requirements` section with at least one citation. Prefer exact identifiers from the spec. If the spec uses prose without stable IDs, STOP and tell the user to update the spec before generating portable tasks.

## Tracker Boundary

Generated task files are tracker-neutral. Downstream GitHub, GitLab, Backlog, Jira, or other issue creation is owned by the consumer project and must not be performed by TDK core.
