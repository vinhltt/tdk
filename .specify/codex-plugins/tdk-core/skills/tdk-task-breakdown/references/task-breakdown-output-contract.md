# Task Breakdown Output Contract

This reference is the single source of truth for `/tdk-task-breakdown` Markdown
artifacts.

Task breakdown is the parent epic decomposition step after `/tdk-epic-hld`. It
turns epic PRD slices plus HLD design context into child spec seeds. It does not
create child specs, implementation plans, code, formal requirement IDs, or
tracker issues.

## Output Directory

All files are written under:

```text
{FEATURE_DIR}/tasks-breakdown/
```

Allowed files:

```text
tasks-breakdown/index.md
tasks-breakdown/task-NNN-{slice}.md
```

Do not create `tasks.md`, `spec.md`, tracker config, implementation plans, or
source code.

`tasks-breakdown/index.md` is authoritative. Consumers and agents must read seed
files listed in `index.md`, not discover files by globbing the directory.

## Index Schema

`tasks-breakdown/index.md` must use this structure:

```markdown
---
task_id: "{TASK_ID}"
source_epic_prd: "../epic-prd/index.md"
source_hld: "../high-level-design/index.md"
artifact_type: "child-spec-seed-breakdown"
tracker_sync: "consumer-owned"
---

# Task Breakdown

## Source

- Epic PRD: `../epic-prd/index.md`
- Slice Map: `../epic-prd/slice-map.md`
- Epic HLD: `../high-level-design/index.md`
- Blocking Questions: `None`

## Child Spec Seeds

| # | Slice key | Child spec title | Depends on | Seed file | Status |
|---|-----------|------------------|------------|-----------|--------|
| 001 | avatar-upload-validation | Avatar upload validation | none | [task-001-avatar-upload-validation.md](./task-001-avatar-upload-validation.md) | |

## Tracker Boundary

These files are portable Markdown child spec seeds. TDK core does not create external tracker issues.

## Sync Boundary

Consumer-owned tracker sync must treat `tasks-breakdown/index.md` as the manifest. Files not listed in the current index are non-authoritative and must not be synced just because they exist in the directory.
```

## Seed File Schema

Each `task-NNN-{slice}.md` must use this structure:

```markdown
---
task_id: "{TASK_ID}"
work_item: "NNN"
slice_key: "avatar-upload-validation"
child_spec_title: "Avatar upload validation"
source_epic_prd: "../epic-prd/index.md"
source_hld: "../high-level-design/index.md"
tracker_sync: "consumer-owned"
---

# NNN. Avatar upload validation

## Source Slice

- Slice key: `avatar-upload-validation`
- Source PRD refs: `epic-prd/slice-map.md`, `epic-prd/prd.md`
- Source HLD refs: `high-level-design/index.md`, relevant listed artifact(s)

## Suggested Child Spec Command

```text
/tdk-specify <child-id> "Seed text derived from this slice, boundary, dependencies, assumptions, and risks."
```

## Boundary

### In

- Capability and outcome included in this child spec seed.

### Out

- Related parent epic scope explicitly excluded from this child spec seed.

## Dependencies

- Upstream/downstream slice keys or external dependencies.

## Assumptions And Risks

- Assumptions or risks that the child spec should clarify.

## Clarify In Child Spec

- Questions the child `/tdk-clarify` should resolve before planning.
```

## Filename Rules

- Number items from `001`.
- Use `task-NNN-{slice}.md`.
- Use lowercase kebab-case for `{slice}`.
- `{slice}` derives from the source slice key.
- Keep filenames stable if regenerating unless the slice meaning changes.

## Slice Granularity Rules

- One seed should map to one independently specifiable child spec.
- Each seed must cite one source slice key.
- Group tightly related slice-map rows only when they cannot be specified independently.
- Split seeds when actors, outcomes, dependencies, or clarification questions differ materially.
- Do not include implementation file paths unless the epic PRD or HLD already states them.
- Do not add owners, estimates, priorities, labels, milestones, or tracker IDs unless the epic PRD already states them.

## Source Authority Rules

Valid parent traceability sources:

- `epic-prd/index.md`
- `epic-prd/prd.md`
- `epic-prd/slice-map.md`
- `epic-prd/open-questions.md`
- `high-level-design/index.md` and listed HLD artifacts
- slice keys from `epic-prd/slice-map.md`

Task breakdown must not mint `UR-*`, `FR-*`, `SC-*`, or `FS-*`. Only child
`spec.md` artifacts mint formal requirement IDs after `/tdk-specify`.

## Tracker Boundary

Generated seed files are tracker-neutral. Downstream GitHub, GitLab, Backlog,
Jira, or other issue creation is owned by the consumer project and must not be
performed by TDK core.
