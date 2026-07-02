# TDK primary workflow routing

Routing map for the TDK development workflow. Use it to pick the correct TDK
skill for a user's intent and to run the steps in the right order.

Skill names use the default `tdk-` prefix. If this install configured a custom
prefix, substitute it (e.g. `tdk-specify` -> `<prefix>specify`). Names are skill
identifiers; activate the matching skill by name. Some harnesses namespace
skills by plugin, e.g. `tdk-core:tdk-specify`.

## Canonical order

```text
PROJECT INCEPTION / SETUP, optional project-level lane

tdk-greenfield-start or tdk-brownfield-start
        ↓
[tdk-architecture-advisor]              report-only architecture options/decision
        ↓
[tdk-workspace-layout-propose]          proposal-only layout markdown/json
        ↓
[tdk-workflow-config-apply]             guarded config dry-run/apply
        ↓
[tdk-workspace-dependency-policy]       advisory policy + snippets
        ↓
[tdk-golden-path-scaffold]              dry-run/approved skeleton recipe

PROJECT AUTHORITY

tdk-constitution                         once, or when project principles change

PARENT EPIC LANE, optional for broad work

[tdk-discovery]                          discovery.md + discovery/
        ↓
[tdk-epic-prd]                           epic-prd.md + epic-prd/
        ↓
[tdk-epic-hld]                           high-level-design.md + high-level-design/
        ↓
[tdk-task-breakdown]                     tasks-breakdown.md + tasks-breakdown/
        ↓
child tdk-specify -> child tdk-clarify -> child tdk-plan
        ↓                                      ↓
child tdk-analyze                       tdk-ut-backfill-plan when UT coverage needs a routed plan
        ↓
child tdk-implement

FEATURE-SIZED LANE, default for small/clear work

tdk-specify -> tdk-clarify -> tdk-plan -> [tdk-analyze] -> tdk-implement

tdk-status                               track progress at any point
tdk-checklist                            optional quality checklist
```

- `tdk-greenfield-start` and `tdk-brownfield-start` classify project shape and
  recommend a safe route. They are not required for every feature.
- `tdk-architecture-advisor`, `tdk-workspace-layout-propose`,
  `tdk-workspace-dependency-policy`, and `tdk-golden-path-scaffold` are
  project-level guidance/scaffold lanes. They do not replace feature specs.
- `tdk-workflow-config-apply` is the guarded runtime config apply step after a
  layout proposal; use dry-run/review before apply.
- `tdk-constitution` owns durable project principles and product context.
- `tdk-discovery` is optional and epic-only. It explores problem, personas, and
  MVP boundary before PRD. Feature-sized work skips discovery.
- `tdk-epic-prd` is optional and epic-only. It aligns product intent and slice
  map before parent design.
- `tdk-epic-hld` turns epic PRD into parent product/system design context before
  child spec seed breakdown.
- `tdk-task-breakdown` turns epic PRD + HLD into portable child spec seed files.
- Child specs then run specify -> clarify -> plan -> implement. They do not run
  HLD by default.
- `tdk-analyze` is read-only spec/plan consistency checking. Use it before build
  for non-trivial plans.
- `tdk-ut-backfill-plan` plans and routes unit-test coverage work. It is not the
  implementation plan for product behavior.

## Artifact authority

Parent epic stages use one first-read dashboard plus sibling stage manifests:

```text
<epic-folder>/index.md                  epic dashboard, stage links, readiness, next command
<epic-folder>/discovery.md              discovery stage manifest
<epic-folder>/discovery/*.md            discovery detail artifacts
<epic-folder>/epic-prd.md               epic PRD stage manifest
<epic-folder>/epic-prd/*.md             PRD, slice map, open questions
<epic-folder>/high-level-design.md      parent HLD stage manifest
<epic-folder>/high-level-design/*.md    HLD detail artifacts
<epic-folder>/tasks-breakdown.md        child seed manifest
<epic-folder>/tasks-breakdown/task-*.md child spec seed files
```

Authority boundaries:

- Discovery is context-only and never mints requirement IDs.
- Epic PRD is product alignment and slice-map context only.
- Epic HLD guides decomposition and does not mint requirement IDs.
- Task breakdown creates tracker-neutral child spec seeds, not implementation
  plans or external tracker issues.
- Child `spec.md` owns `UR-*`, `FR-*`, and `SC-*`.
- Parent-lane artifacts must not mint `UR-*`, `FR-*`, `SC-*`, or `FS-*`.

Legacy nested stage manifests such as `discovery/index.md`,
`epic-prd/index.md`, `high-level-design/index.md`, and
`tasks-breakdown/index.md` are old layout. Current commands should stop with
legacy-layout guidance instead of auto-migrating them.

## Intent -> skill

| User intent | Skill | Don't confuse with |
|-------------|-------|--------------------|
| Start a new project/repo route | `tdk-greenfield-start` or `tdk-brownfield-start` | `tdk-specify` |
| Produce architecture options/decision/recovery report | `tdk-architecture-advisor` | `tdk-workspace-layout-propose` |
| Propose workspace layout markdown/json | `tdk-workspace-layout-propose` | `tdk-workflow-config-apply` |
| Review/apply runtime config from layout evidence | `tdk-workflow-config-apply` | `tdk-workspace-layout-propose` |
| Produce dependency policy/snippets | `tdk-workspace-dependency-policy` | `tdk-golden-path-scaffold` |
| Create guarded skeleton recipe/structure | `tdk-golden-path-scaffold` | source-code implementation |
| Set/update project-wide principles & knowledge | `tdk-constitution` | `tdk-specify` |
| Explore epic problem/personas/MVP before PRD | `tdk-discovery` | `tdk-specify` |
| Align epic product intent and slice map | `tdk-epic-prd` | `tdk-specify` |
| Produce parent epic design before breakdown | `tdk-epic-hld` | `tdk-plan` |
| Split an epic into child spec seeds | `tdk-task-breakdown` | `tdk-plan` |
| Turn an idea or seed into a feature/child spec | `tdk-specify` | `tdk-plan` |
| Resolve ambiguity / fill gaps in a spec | `tdk-clarify` | `tdk-analyze` |
| Design a phased implementation plan | `tdk-plan` | `tdk-task-breakdown`, `tdk-specify` |
| Check spec <-> plan consistency | `tdk-analyze` | `tdk-clarify` |
| Build / execute plan phases | `tdk-implement` | `tdk-plan` |
| Plan & route unit-test coverage | `tdk-ut-backfill-plan` | `tdk-plan` |
| Track workflow progress/status | `tdk-status` | — |
| Generate a focused checklist | `tdk-checklist` | — |

## Decision tree

```text
New/unknown repo shape                         -> tdk-greenfield-start or tdk-brownfield-start
Need architecture decision only                -> tdk-architecture-advisor
Need workspace layout proposal                 -> tdk-workspace-layout-propose
Layout proposal ready for guarded config       -> tdk-workflow-config-apply
Need dependency policy from approved layout    -> tdk-workspace-dependency-policy
Need guarded skeleton recipe                   -> tdk-golden-path-scaffold
No project principles yet, or they changed     -> tdk-constitution
Epic-level problem/personas/MVP unclear        -> tdk-discovery
Discovery ready, need product alignment        -> tdk-epic-prd
Epic PRD ready, need parent design context     -> tdk-epic-hld
Epic HLD ready, need child spec seeds          -> tdk-task-breakdown
Have an idea/seed but no spec                  -> tdk-specify
Spec exists but is vague/ambiguous             -> tdk-clarify
Ready to design the build                      -> tdk-plan
Plan + spec exist, verify they agree           -> tdk-analyze
Need unit-test coverage planned                -> tdk-ut-backfill-plan
Plan approved, time to build                   -> tdk-implement
"Where are we?" / progress                     -> tdk-status
```

## Anti-confusion

- **`tdk-specify` vs `tdk-constitution`** — specify defines one feature or child
  slice; constitution defines project-wide principles and durable product
  context.
- **`tdk-discovery` vs `tdk-specify`** — discovery is optional epic context and
  never mints requirements. Requirements start in `spec.md`.
- **`tdk-epic-prd` vs `tdk-specify`** — epic PRD aligns product direction and
  slice map; child specs own requirement IDs.
- **`tdk-epic-hld` vs child `tdk-clarify`** — epic HLD belongs to the parent
  decomposition lane. Child specs clarify their own requirements.
- **`tdk-epic-hld` vs `tdk-plan`** — HLD creates parent design context; plan
  creates implementation phases for one clarified spec.
- **`tdk-task-breakdown` vs `tdk-plan`** — task breakdown emits child spec
  seeds; plan emits a phased implementation plan.
- **`tdk-workspace-layout-propose` vs `tdk-workflow-config-apply`** — layout
  propose is report/proposal only; config apply is the guarded runtime config
  writer.
- **`tdk-workspace-dependency-policy` vs `tdk-golden-path-scaffold`** —
  dependency policy gives guidance/snippets; golden path scaffolds approved
  structure/recipes.
- **`tdk-clarify` vs `tdk-analyze`** — clarify asks questions and edits `spec.md`;
  analyze is read-only cross-artifact consistency checking.
- **`tdk-implement` vs `tdk-plan`** — plan designs phases; implement executes
  them.

## Supporting skills

Invoke these on demand outside the main spec -> ship spine:

- Config/docs: `tdk-config-index`, `tdk-config-diff`, `tdk-config-sync`.
- Sub-workspaces: `tdk-sub-workspace-init`, `tdk-sub-workspace-list`,
  `tdk-sub-workspace-docs`, `tdk-sub-workspace-automation-recommend`.
- Research/navigation: `tdk-scout`, `docs-seeker`, research/problem-solving
  utilities.
- Memory/learning: `tdk-memory-*` and `tdk-retro-*` workflows.
