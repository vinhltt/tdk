# Concept: Promote Convention: Child Spec Seed -> Child Spec

> How to turn a `/tdk-task-breakdown` seed into an independent **child spec**
> that runs the normal child implementation pipeline.

A child spec is **not** a new recursion engine. In the epic flow, the parent lane is:

```text
/tdk-epic-prd -> /tdk-epic-hld -> /tdk-task-breakdown
```

Only after `tasks-breakdown/` exists does a selected seed become a child `spec.md`
through `/tdk-specify`. Parent epic traceability stays in the seed file through
`slice_key`, PRD refs, and HLD refs. `parent_spec` is optional and only applies
when the child is explicitly linked to an existing parent `spec.md`.

---

## Sizing Rule: Seed vs Child Spec

Decompose first with `/tdk-task-breakdown`. For each seed, decide:

| Keep as a **seed/tracker item** | Create a **child spec** |
|-------------------------|-----------------------------|
| Not selected for implementation yet | Needs its own requirements, scope, and acceptance criteria |
| Still just parent decomposition context | Needs its own specify -> clarify -> plan -> implement cycle |
| One seed file under `tasks-breakdown/` | Independent `specs/<child-id>/` directory |

Create a child spec only when the seed is independently specifiable. Do not plan or
implement the parent epic as one large unit after task breakdown.

---

## Manual Seed Flow (MVP)

Seed-to-child-spec is a **manual content-seed** convention. There is no auto-promote
engine and no marker heuristic.

```text
parent epic -> /tdk-epic-prd -> /tdk-epic-hld -> /tdk-task-breakdown
   -> tasks-breakdown/task-NNN-{slice}.md
      -> /tdk-specify <child-id> "<seed content>"
      -> child spec at specs/<child-id>/
      -> child clarify -> child plan -> child implement
```

Steps:

1. Pick a seed from `tasks-breakdown.md`.
2. Choose `<child-id>` — an ordinary task id (e.g. `feat-123`), validated by the normal
   task-id grammar. **No `{epic}/{child}` path nesting** — the link lives only in
   frontmatter, never in the directory path.
3. Run `/tdk-specify <child-id> "<seed content from the seed file>"`.
4. Carry the seed traceability into the child spec text: source slice key, PRD refs,
   HLD refs, assumptions/risks, and clarify questions.
5. Run child `/tdk-clarify`, child `/tdk-plan`, and child `/tdk-implement`.
   Child specs do not run HLD by default.

---

## Optional `parent_spec` Format Rule

Use `parent_spec` only when the child is linked to an actual parent `spec.md`.
Do not use `parent_spec` to point at `epic-prd.md`, HLD artifacts, or
`tasks-breakdown/` seed files.

When used, `parent_spec` MUST use the same `[folder/]ticket` form used to address the spec.
**Include the category folder whenever the parent is not in the default folder.**

| Parent location | Correct `parent_spec` |
|-----------------|-----------------------|
| Default folder (e.g. `feature/feat-100`) | `parent_spec: feat-100` |
| Non-default folder (e.g. `test/aa-100`) | `parent_spec: test/aa-100` |
| Non-default folder (e.g. `sub/feat-100`) | `parent_spec: sub/feat-100` |

A bare `feat-100` resolves through the default folder. Storing a non-default-category
parent **without** its folder resolves to the wrong directory and produces a false
"parent not found" STOP at plan-time.

`parent_spec` is the single source of truth for a spec-to-spec link (`child_specs[]`
is never stored — children are derived by querying `parent_spec`).

---

## Link Integrity (fail-loud at plan-time)

When a child spec declares `parent_spec`, `/tdk-plan` validates the link before
generating a plan. If the parent `spec.md` does not exist, planning **STOPs** with
a non-zero exit and a stderr error.

This is a **hard STOP even when the parent was legitimately archived or deleted**. A
missing parent forces you to demote the child first (clear `parent_spec`) rather than
silently generating a plan against a broken link. The resolution is path-traversal
guarded — a crafted `parent_spec` cannot escape the specs root.

---

## Demote / Unlink

Two distinct operations share the word "demote" — pick by intent. Loose coupling
(seed content and optional frontmatter link, not path nesting) makes both safe.

**Unlink (the parent is gone).** When `/tdk-plan` STOPs because `parent_spec` points at
an archived or deleted parent, clear the `parent_spec` field. The child survives as a
normal independent root spec and planning proceeds. Nothing else changes — the child
keeps its own spec, tasks, and history.

**Revert the child spec (back to a seed/tracker item).** When the sub-feature should
no longer be its own spec, run the full revert checklist in the task-breakdown output
contract: delete or archive `specs/<child-id>/`, close its tracker issue when consumer
tracker-sync exists, and update `tasks-breakdown.md` if your consumer workflow
recorded the child spec status there. See
`.specify/plugins/tdk-core/skills/tdk-task-breakdown/references/task-breakdown-output-contract.md`.

---

## Scope Boundary (what promote is NOT)

- No automatic promote heuristics or marker engine — manual content-seed only.
- No `{epic}/{child}` path nesting and no project-level epic root.
- No status-rollup dashboards.
- Epic PRD/HLD artifacts are parent decomposition context, not parent `spec.md`.
- Child specs do not run HLD by default; they run specify -> clarify -> plan -> implement.
