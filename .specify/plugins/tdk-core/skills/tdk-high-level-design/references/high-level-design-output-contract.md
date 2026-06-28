# High-Level Design Output Contract

This reference is the single source of truth for `/tdk-high-level-design` Markdown artifacts.

High-level design (HLD) is the approval-level design stage between a clarified `spec.md` and `/tdk-task-breakdown`. It turns clarified requirements into product/system design artifacts. It does not produce implementation plans, code, tasks, or tracker issues.
`requirement-overview.md` is reference-first design context, not a PRD restatement.

Built-in lenses and optional consumer HLD routing may enrich design context before artifact generation. They are advisory design inputs only; they do not change the six-file output set or citation authority.

## Output Directory

All files are written under:

```text
{FEATURE_DIR}/high-level-design/
```

Allowed files (exactly these six, no others):

```text
high-level-design/index.md
high-level-design/requirement-overview.md
high-level-design/project-and-technical-overview.md
high-level-design/data-flow.md
high-level-design/screen-flow.md
high-level-design/decisions-and-risks.md
```

Do not create `tasks.md`, `tasks-breakdown/`, tracker config, implementation plans, or source code. Issue creation and tracker sync are out of scope for this stage.

`high-level-design/index.md` is authoritative. Consumers must read the artifacts listed in `index.md`, not discover artifacts by globbing the directory.

## Index Schema

`high-level-design/index.md` must use this structure:

```markdown
---
task_id: "{TASK_ID}"
source_spec: "../spec.md"
artifact_type: "high-level-design"
mode: "greenfield"
status: "draft"
---

# High-Level Design

## Source

- Spec: `../spec.md`
- Unresolved Questions: `None`

## Artifact Map

| Artifact | Purpose | Primary Spec Sources |
|----------|---------|----------------------|
| [requirement-overview.md](./requirement-overview.md) | Source references, covered IDs, design implications | §1, §2, §5, §6, §7 |
| [project-and-technical-overview.md](./project-and-technical-overview.md) | System context, module impact, technical assumptions, integration, security | §3 + originated design detail |
| [data-flow.md](./data-flow.md) | Key entities, read/write flows, external dependencies, state | §6 Key Entities, §6 FR-* |
| [screen-flow.md](./screen-flow.md) | Primary journeys, screen list, step table, branch conditions | §5 acceptance + journeys |
| [decisions-and-risks.md](./decisions-and-risks.md) | Decisions, rejected alternatives, risks, assumptions, follow-ups | §4, §8 |

## Readiness Gate

- [ ] `../spec.md` exists and `## 9. Unresolved Questions` is `None`
- [ ] Every artifact cites only `UR-*`, `FR-*`, or `SC-*` from the spec
- [ ] Originated design detail is marked `assumed`
- [ ] No implementation file paths invented beyond what the spec states
- [ ] Ready for `/tdk-task-breakdown`
```

The `mode` field is fixed to `greenfield` in the current contract; greenfield is the only supported mode. The field is retained as a forward-compatible extension point for a future brownfield mode; this contract does not define brownfield behavior.

## Artifact Schemas

Each artifact is text-first. Mermaid blocks are optional and must be clearly marked optional. Mark any originated design detail `assumed`.

### requirement-overview.md

```markdown
## Problem & Outcome        # from §1
## Scope (In / Out)         # from §2
## Actors                   # from §5
## Requirement Map          # UR-* / FR-* / SC-* table, cited from spec
## Non-Functional Goals     # measurable outcomes from §7 (SC-*)
```

Mapping means source reference and design implication, not copied PRD prose.

### project-and-technical-overview.md

```markdown
## System Context           # from §3 Impact Surface
## Module Impact            # subworkspace / module table from §3
## Technical Assumptions    # ORIGINATED, marked `assumed`
## Integration Map          # ORIGINATED, marked `assumed`
## Security Posture         # ORIGINATED, marked `assumed`
## Operability              # ORIGINATED, marked `assumed`
```

### data-flow.md

```markdown
## Key Entities             # from §6 Key Entities
## Read / Write Flows       # step table; FR-* cited
## External Dependencies    # dependency / purpose table
## State & Lifecycle        # entity state transitions
## Diagram (optional)       # optional Mermaid
```

### screen-flow.md

```markdown
## Primary Journeys         # from §5 acceptance scenarios
## Screen List              # screens involved
## Steps                    # screen / action / response / next table
## Branch Conditions        # condition / branch-to table
## Related APIs             # screen / API / purpose table
## Diagram (optional)       # optional Mermaid
```

### decisions-and-risks.md

```markdown
## Decisions                # from §4; what was chosen and why
## Alternatives Rejected    # from §4
## Risks & Mitigations      # from §8 table
## Assumptions to Validate  # originated `assumed` items needing confirmation
## Non-Blocking Follow-Ups  # new-requirement candidates routed back to specify/clarify
```

## Spec Section to Artifact Mapping

| Spec section | Feeds artifact | Section in artifact |
|---|---|---|
| §1 Problem Statement | requirement-overview.md | Problem & Outcome |
| §2 Scope Boundary | requirement-overview.md | Scope (In / Out) |
| §3 Impact Surface | project-and-technical-overview.md | System Context / Module Impact |
| §5 User Requirements (UR-*) | requirement-overview.md | Actors + Requirement Map |
| §6 Functional Requirements (FR-*) | requirement-overview.md / data-flow.md | Requirement Map / Read-Write Flows |
| §6 Key Entities | data-flow.md | Key Entities |
| §5 acceptance + journeys | screen-flow.md | Primary Journeys, Steps |
| §7 Success Criteria (SC-*) | requirement-overview.md | Non-Functional Goals |
| §8 Risks & Mitigations | decisions-and-risks.md | Risks & Mitigations |
| §4 Evaluated Approaches | decisions-and-risks.md | Decisions + Alternatives Rejected |

Non-functional requirements, technical assumptions, the integration map, and security posture have no dedicated spec home by design. HLD originates them as explicit `assumed` entries in `project-and-technical-overview.md`. This is design detail, not requirement invention, and is distinct from the requirements rule below.

Lens or routed-skill findings may be folded into assumptions, risks, decisions, or follow-ups only. They must not create new artifacts or become requirement citations.

## Unresolved Questions Gate

Find `## 9. Unresolved Questions` in `spec.md`.

STOP before writing any artifact unless the section content is exactly `None` after trimming whitespace.

If the section is missing, contains bullets, contains placeholders, or contains anything other than `None`, STOP and report that `/tdk-clarify {TASK_ID}` must resolve the questions first. This gate is never bypassable.

## Citation Rules

Valid citations are spec requirement identifiers only:
- `UR-*`
- `FR-*`
- `SC-*`

Every requirement-derived statement must trace to one of these identifiers. Prefer exact identifiers from the spec. If the spec expresses requirements as prose without stable identifiers, STOP and tell the user to update the spec before generating HLD.

### Enrich-Only Requirements Rule

HLD **enriches** existing `UR-*`, `FR-*`, and `SC-*`; it never mints new requirement identifiers. If the design surfaces a genuinely new requirement, record it as a non-blocking follow-up in `decisions-and-risks.md` and direct the user to re-run `/tdk-specify` and `/tdk-clarify` for that requirement. Do not invent requirement IDs in the HLD.

### Design Detail Rule

Design detail that has no spec home (non-functional assumptions, technical assumptions, integration map, security posture) MAY be originated in `project-and-technical-overview.md`, but every such entry MUST be marked `assumed`. Originated design detail is not a requirement and must not be cited as `UR-*/FR-*/SC-*`.

## Greenfield Rules

- Mark every originated assumption `assumed`.
- Do not invent implementation file paths, APIs, database tables, owners, estimates, or labels unless the spec already states them.
- Text-first. Mermaid is optional and must be flagged optional where used.
- No false precision: when a detail is unknown, record it as an assumption to validate rather than inventing a concrete value.

## Boundary

HLD artifacts are tracker-neutral design documents. This stage does not create implementation plans (`/tdk-plan`), code (`/tdk-implement`), portable tasks (`/tdk-task-breakdown`), or external tracker issues. Downstream stages consume `index.md`.
