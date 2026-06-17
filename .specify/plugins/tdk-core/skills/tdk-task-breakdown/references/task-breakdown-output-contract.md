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

| # | Task | Source Requirements | File |
|---|------|---------------------|------|
| 001 | Example task title | UR-001, FR-001, SC-001 | [task-001-example-task-title.md](./task-001-example-task-title.md) |

## Tracker Boundary

These files are portable Markdown work items. TDK core does not create external tracker issues.

## Sync Boundary

Consumer-owned tracker sync must treat `tasks-breakdown/index.md` as the manifest. Files not listed in the current index are non-authoritative and must not be synced just because they exist in the directory.
```

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
