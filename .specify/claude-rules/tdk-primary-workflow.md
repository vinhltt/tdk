# TDK primary workflow routing

Routing map for the TDK development workflow. Use it to pick the correct TDK
skill for a user's intent and to run the steps in the right order.

Skill names use the default `tdk-` prefix. If this install configured a custom
prefix, substitute it (e.g. `tdk-specify` → `<prefix>specify`). Names are the
skill identifiers — activate the matching skill by name (it may be namespaced
by plugin in your harness, e.g. `tdk-core:tdk-specify`).

## Canonical order

```
tdk-constitution        (once, or when project principles change)
        ↓
[tdk-discovery]        (optional, epic-level context before PRD)
        ↓
tdk-specify  →  tdk-clarify  →  tdk-high-level-design  →  [tdk-task-breakdown]
        ↓
tdk-plan  →  tdk-analyze
        ↓
tdk-implement
        ↓
tdk-ut-backfill-plan    (verify: unit-test coverage)

tdk-status              (track progress at any point)
```

- `tdk-constitution` is foundational — run before the first spec, or when
  project-wide principles change.
- `tdk-discovery` is optional and epic-only — use it to explore problem,
  personas, and MVP boundary before PRD. Feature-sized work skips discovery.
- `tdk-high-level-design` turns a clarified spec into approval-level product
  and system design artifacts before portable task breakdown.
- `tdk-task-breakdown` is optional — use it when work must be split into
  portable items before planning.
- `tdk-analyze` gates plan → build — skip only for trivial changes.
- After shipping, loop back to `tdk-specify` for the next feature.

## Intent → skill

| User intent | Skill | Don't confuse with |
|-------------|-------|--------------------|
| Set/update project-wide principles & knowledge | `tdk-constitution` | `tdk-specify` (per-feature, not project) |
| Explore epic problem/personas/MVP before PRD | `tdk-discovery` | `tdk-specify` (specify mints requirements) |
| Turn an idea into a feature spec | `tdk-specify` | `tdk-plan` (specify defines *what*, not *how*) |
| Resolve ambiguity / fill gaps in a spec | `tdk-clarify` | `tdk-analyze` (clarify edits the spec via Q&A) |
| Produce approval-level design from a clarified spec | `tdk-high-level-design` | `tdk-plan` (HLD designs product/system shape, not implementation phases) |
| Split a spec into portable work items | `tdk-task-breakdown` | `tdk-plan` (work items ≠ phased plan) |
| Design a phased implementation plan | `tdk-plan` | `tdk-task-breakdown`, `tdk-specify` |
| Check spec ↔ plan consistency | `tdk-analyze` | `tdk-clarify` (analyze is read-only, cross-artifact) |
| Build / execute the plan phases | `tdk-implement` | `tdk-plan` (implement executes; plan designs) |
| Plan & route unit-test coverage | `tdk-ut-backfill-plan` | `tdk-plan` (ut plan ≠ impl plan) |
| Track workflow progress / status | `tdk-status` | — |
| Generate a feature checklist | `tdk-checklist` | — |

## Decision tree

```
No project principles yet, or they changed   → tdk-constitution
Epic-level problem/personas/MVP unclear       → tdk-discovery       (optional before PRD)
Have an idea but no spec                      → tdk-specify          (NOT tdk-plan)
Spec exists but is vague/ambiguous            → tdk-clarify          (NOT tdk-analyze)
Clarified greenfield spec needs approval design → tdk-high-level-design
Spec clear, need to distribute work           → tdk-task-breakdown   (NOT tdk-plan)
Ready to design the build                     → tdk-plan
Plan + spec exist, verify they agree          → tdk-analyze
Plan approved, time to build                  → tdk-implement
Need unit-test coverage planned               → tdk-ut-backfill-plan
"Where are we?" / progress                    → tdk-status
```

## Anti-confusion (the pairs that actually get mixed up)

- **`tdk-specify` vs `tdk-constitution`** — specify defines one *feature*;
  constitution defines *project-wide* principles/knowledge. New feature →
  specify. Project rules → constitution.
- **`tdk-discovery` vs `tdk-specify`** — discovery is optional epic-level
  context and never mints `UR-*`, `FR-*`, or `SC-*`. Feature-sized work skips
  discovery. Requirements → specify.
- **`tdk-high-level-design` vs `tdk-plan`** — high-level-design creates
  approval-level product/system design artifacts from a clarified spec; plan
  designs phased implementation.
- **`tdk-task-breakdown` vs `tdk-plan`** — task-breakdown emits portable work
  items (issues/tickets) from a spec; plan emits a phased implementation plan
  with design artifacts. Distributing work → breakdown. Designing the build → plan.
- **`tdk-clarify` vs `tdk-analyze`** — clarify *asks questions and edits the
  spec* to remove ambiguity (pre-plan); analyze is *read-only cross-artifact*
  consistency between spec.md and plan.md (post-plan). Spec unclear → clarify.
  Spec vs plan drift → analyze.
- **`tdk-implement` vs `tdk-plan`** — plan designs the phases; implement
  executes them. Don't re-run plan when a plan already exists and you just
  need to build.

## Supporting skills (not workflow steps)

Doc & workspace utilities — invoke on demand, outside the spec→ship spine:
`tdk-config-index` / `tdk-config-diff` / `tdk-config-sync` (workspace ↔
sub-workspace docs), and `tdk-sub-workspace-init` / `tdk-sub-workspace-list` /
`tdk-sub-workspace-docs` (sub-workspace management).
