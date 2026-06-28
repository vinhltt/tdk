# Promote Convention: Work-Item → Child Spec

> How to promote a large work-item into an independent **child spec** that re-runs
> the normal TDK pipeline, linked to its parent by a single frontmatter field.

A child spec is **not** a new recursion engine. It is an ordinary independent spec at
`specs/<child-id>/` that links to its parent through one `parent_spec` field in its
YAML frontmatter. Decomposition stays size-adaptive: a spec decomposes into work-items
by default; a work-item large enough to be its own sub-feature is **promoted** into a
child spec.

---

## Sizing Rule: Work-Item vs Child Spec

Decompose first with `/tdk-task-breakdown`. For each resulting item, decide:

| Keep as a **work-item** | Promote to a **child spec** |
|-------------------------|-----------------------------|
| A unit of work *within* the current feature | A sub-feature with its **own** requirements, scope, and acceptance criteria |
| Implemented directly from the parent plan | Needs its own spec → clarify → plan → implement cycle |
| One task file under `tasks-breakdown/` | Independent `specs/<child-id>/` directory |

Default to keeping items as work-items (YAGNI). Promote only when an item is genuinely
its own feature — when it would otherwise carry a nested scope boundary, its own user
requirements, and its own risk surface.

---

## Manual Promote Flow (MVP)

Promote is a **manual content-seed** convention — there is no auto-promote engine and no
marker heuristics.

```text
parent spec → /tdk-task-breakdown → work-items
   └─ promote a large work-item:
        seed its content into  /tdk-specify <child-id> "<content>"
        → child spec at specs/<child-id>/  (independent normal id, keeps category)
           with  parent_spec: <parent-id>  and  promoted_from: <work-item-id>
        → full spec → clarify → (optional HLD) → plan → implement
```

Steps:

1. Pick the work-item to promote from the parent's `tasks-breakdown/`.
2. Choose `<child-id>` — an ordinary task id (e.g. `feat-123`), validated by the normal
   task-id grammar. **No `{epic}/{child}` path nesting** — the link lives only in
   frontmatter, never in the directory path.
3. Run `/tdk-specify <child-id> "<seed content from the work-item>"`.
4. In the child's `spec.md` frontmatter, set:
   - `parent_spec: <parent-id>` — the canonical link to the parent (see format rule below).
   - `promoted_from: "<work-item-id>"` — the parent work-item id, a best-effort human
     annotation (not a machine-resolvable back-link).
5. Confirm the parent spec directory exists before writing the child (the agent advisory).
   The hard enforcement happens later at plan-time.

---

## `parent_spec` Format Rule (required)

`parent_spec` MUST use the same `[folder/]ticket` form used to address the spec.
**Include the category folder whenever the parent is not in the default folder.**

| Parent location | Correct `parent_spec` |
|-----------------|-----------------------|
| Default folder (e.g. `feature/feat-100`) | `parent_spec: feat-100` |
| Non-default folder (e.g. `test/aa-100`) | `parent_spec: test/aa-100` |
| Non-default folder (e.g. `sub/feat-100`) | `parent_spec: sub/feat-100` |

A bare `feat-100` resolves through the default folder. Storing a non-default-category
parent **without** its folder resolves to the wrong directory and produces a false
"parent not found" STOP at plan-time.

`parent_spec` is the single source of truth for the link (`child_specs[]` is never
stored — children are derived by querying `parent_spec`).

---

## Link Integrity (fail-loud at plan-time)

When a spec declares `parent_spec`, `/tdk-plan` validates the link before generating a
plan. If the parent `spec.md` does not exist, planning **STOPs** with a non-zero exit
and a stderr error.

This is a **hard STOP even when the parent was legitimately archived or deleted**. A
missing parent forces you to demote the child first (clear `parent_spec`) rather than
silently generating a plan against a broken link. The resolution is path-traversal
guarded — a crafted `parent_spec` cannot escape the specs root.

---

## Demote

Two distinct operations share the word "demote" — pick by intent. Loose coupling (link
in frontmatter, not path) makes both safe.

**Unlink (the parent is gone).** When `/tdk-plan` STOPs because `parent_spec` points at
an archived or deleted parent, clear the `parent_spec` field. The child survives as a
normal independent root spec and planning proceeds. Nothing else changes — the child
keeps its own spec, tasks, and history.

**Revert the promotion (back to a work-item).** When the sub-feature should no longer be
its own spec, run the full revert checklist in the task-breakdown output contract: delete
or archive `specs/<child-id>/`, close its tracker issue (when consumer tracker-sync
exists), and clear the `promoted → <child-id>` marker in the parent's
`tasks-breakdown/index.md` row so it reverts to a normal work-item. See
`.specify/plugins/tdk-core/skills/tdk-task-breakdown/references/task-breakdown-output-contract.md`.

---

## Scope Boundary (what promote is NOT)

- No automatic promote heuristics or marker engine — manual content-seed only.
- No `{epic}/{child}` path nesting and no project-level epic root.
- No status-rollup dashboards.
- An epic is simply a normal large parent spec; per-feature HLD applies to it like any spec.
