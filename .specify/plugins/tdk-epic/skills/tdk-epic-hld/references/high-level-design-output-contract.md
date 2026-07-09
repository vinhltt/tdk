# High-Level Design Output Contract

This reference is the single source of truth for `/tdk-epic-hld` Markdown artifacts.

Epic HLD is the parent design stage between `/tdk-epic-prd` and
`/tdk-task-breakdown`. It turns epic PRD context into decomposition-safe
product/system design artifacts. It does not produce implementation plans, code,
child specs, child spec seeds, tasks, or tracker issues.

Built-in lenses and optional consumer HLD routing may enrich design context
before artifact generation. They are advisory design inputs only; they do not
change the six-file output set or requirement authority.

## Output Layout

The stage manifest is written beside the epic dashboard:

```text
{FEATURE_DIR}/high-level-design.md
```

Detail artifacts are written under:

```text
{FEATURE_DIR}/high-level-design/
```

Allowed files (exactly these six, no others):

```text
high-level-design.md
high-level-design/requirement-overview.md
high-level-design/project-and-technical-overview.md
high-level-design/data-flow.md
high-level-design/screen-flow.md
high-level-design/decisions-and-risks.md
```

Do not create `spec.md`, `tasks.md`, `tasks-breakdown/`, tracker config,
implementation plans, or source code. Issue creation and tracker sync are out of
scope for this stage.

`high-level-design.md` is authoritative. Consumers must read the artifacts
listed in the stage manifest, not discover artifacts by globbing the directory.

## Index Schema

`high-level-design.md` must use this structure:

```markdown
---
task_id: "{TASK_ID}"
source_epic_prd: "epic-prd.md"
artifact_type: "high-level-design"
mode: "epic"
status: "draft"
---

# Epic High-Level Design

## Source

- Epic PRD Manifest: `epic-prd.md`
- Epic PRD: `epic-prd/prd.md`
- Slice Map: `epic-prd/slice-map.md`
- Open Questions: `epic-prd/open-questions.md`
- Blocking Questions: `None`

## Artifact Map

| Artifact | Purpose | Primary Epic Sources |
|----------|---------|----------------------|
| [requirement-overview.md](./high-level-design/requirement-overview.md) | Product objective, scope, personas, slice source map | `prd.md`, `slice-map.md` |
| [project-and-technical-overview.md](./high-level-design/project-and-technical-overview.md) | System context, slice boundaries, dependency map, interface assumptions | `slice-map.md`, HLD lenses |
| [data-flow.md](./high-level-design/data-flow.md) | Cross-slice data/entity lifecycle assumptions | `prd.md`, `slice-map.md` |
| [screen-flow.md](./high-level-design/screen-flow.md) | Epic-level journeys and slice touchpoints | `prd.md`, `slice-map.md` |
| [decisions-and-risks.md](./high-level-design/decisions-and-risks.md) | Slice decisions, rejected splits/merges, risks, assumptions, follow-ups | `prd.md`, `open-questions.md`, HLD lenses |

## Breakdown Readiness Map

| Slice key | Boundary | Depends on | Shared design concern | Suggested child spec seed impact |
|---|---|---|---|---|

## Readiness Gate

- [ ] Epic PRD artifacts exist
- [ ] `epic-prd/open-questions.md` has no blocking questions
- [ ] `epic-prd/slice-map.md` has no catch-all slice
- [ ] Every artifact traces claims to epic PRD sections or slice keys
- [ ] No `UR-*`, `FR-*`, `SC-*`, or `FS-*` identifiers are minted
- [ ] Ready for `/tdk-task-breakdown`
```

The `mode` field is fixed to `epic` in the current contract. Child specs do not
run HLD by default.

## Artifact Schemas

Each artifact is text-first. Mermaid blocks are optional and must be clearly
marked optional. Mark originated design detail `assumed`.

### requirement-overview.md

```markdown
## Product Objective        # from epic PRD objectives/outcomes
## Scope (In / Out)         # from epic PRD scope and no-gos
## Personas And Jobs        # from epic PRD personas/JTBD
## Slice Source Map         # slice-key table from slice-map.md
## Breakdown Readiness      # what task breakdown can safely seed
```

Mapping means source reference and decomposition implication, not copied PRD
prose.

### project-and-technical-overview.md

```markdown
## System Context           # parent epic context, not repository topology
## Slice Boundary Map       # slice key / boundary / dependency table
## Dependency Map           # cross-slice and external dependency assumptions
## Interface Assumptions    # ORIGINATED, marked `assumed`
## Security Posture         # ORIGINATED, marked `assumed`
## Operability              # ORIGINATED, marked `assumed`
```

### data-flow.md

```markdown
## Key Entities             # from PRD and slice-map wording
## Cross-Slice Flows        # step table by slice key
## External Dependencies    # dependency / purpose table
## State & Lifecycle        # entity state transitions
## Diagram (optional)       # optional Mermaid
```

### screen-flow.md

```markdown
## Epic Journeys            # parent-level journeys
## Slice Touchpoints        # slice key / actor / touchpoint table
## Steps                    # journey / action / response / next table
## Branch Conditions        # condition / branch-to table
## Related Interfaces       # UI/API/system boundary assumptions
## Diagram (optional)       # optional Mermaid
```

### decisions-and-risks.md

```markdown
## Slice Boundary Decisions # what was split/merged and why
## Alternatives Rejected    # rejected decomposition shapes
## Risks & Mitigations      # decomposition and design risks
## Assumptions to Validate  # originated `assumed` items needing confirmation
## Non-Blocking Follow-Ups  # candidates to clarify in child specs
```

## Epic PRD Source Mapping

| Epic PRD source | Feeds artifact | Section in artifact |
|---|---|---|
| `prd.md` product objective / outcomes | requirement-overview.md | Product Objective |
| `prd.md` scope / no-gos | requirement-overview.md | Scope (In / Out) |
| `prd.md` personas / jobs | requirement-overview.md / screen-flow.md | Personas And Jobs / Epic Journeys |
| `slice-map.md` slice table | requirement-overview.md / project-and-technical-overview.md | Slice Source Map / Slice Boundary Map |
| `slice-map.md` dependencies | project-and-technical-overview.md / data-flow.md | Dependency Map / Cross-Slice Flows |
| `open-questions.md` non-blocking questions | decisions-and-risks.md | Assumptions to Validate / Follow-Ups |

Lens or routed-skill findings may be folded into assumptions, risks, decisions,
or follow-ups only. They must not create new artifacts or become requirement
authority.

## Epic PRD Readiness Gate

Read `epic-prd/open-questions.md`.

STOP before writing any artifact when `## Blocking Questions` contains any
unresolved item. Also STOP when `epic-prd/slice-map.md` lacks independently
specifiable slices or contains catch-all slices such as "all features", "entire
MVP", or "whole epic".

## Traceability Rules

Valid traceability sources are:

- `epic-prd.md`
- epic PRD artifact paths
- epic PRD section names
- slice keys from `epic-prd/slice-map.md`

Do not cite or mint `UR-*`, `FR-*`, `SC-*`, or `FS-*`. Only child `spec.md`
artifacts mint formal requirement IDs.

### Decomposition Rule

HLD informs task breakdown; it does not create child spec seeds itself. If the
design reveals a new slice, split, merge, or unresolved product decision, record
it as a follow-up in `decisions-and-risks.md` and direct the user back to
`/tdk-epic-prd {TASK_ID} --interview` or an epic PRD update. Do not hide new
scope inside HLD.

### Design Detail Rule

Design detail that has no epic PRD home may be originated in
`project-and-technical-overview.md`, `data-flow.md`, or `screen-flow.md`, but
every such entry MUST be marked `assumed`. Originated design detail is not a
requirement and must not be cited as `UR-*`, `FR-*`, `SC-*`, or `FS-*`.

## Boundary

HLD artifacts are tracker-neutral parent design documents. This stage does not
create implementation plans (`/tdk-plan`), code (`/tdk-implement`), child spec
seeds (`/tdk-task-breakdown`), child specs (`/tdk-specify`), or external tracker
issues. Downstream stages consume `high-level-design.md`.

## Epic Dashboard

The command also updates the generated HLD section in `{FEATURE_DIR}/index.md`.
That epic dashboard section summarizes the current stage manifest, HLD readiness,
and next command (`/tdk-task-breakdown {TASK_ID}`). Preserve user-owned content
outside generated sections. If a generated section already exists, replace it
only after explicit confirmation or when `--force` is supplied.

## Legacy Layout Detection

If `high-level-design/index.md` exists and sibling `high-level-design.md` is
missing, STOP with `legacy layout detected`. Tell the user to rerun
`/tdk-epic-hld <epic-id>` with `--force` or recreate the test epic. do not auto-migrate
old nested `index.md` content into the new layout.
