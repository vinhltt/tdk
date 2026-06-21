# Tihon Document Flow

> Visual representation of all artifact inputs/outputs across the Tihon command workflow.
> Migrated from speckit-tdk-jp DOCUMENT-FLOW.md and updated for Claude Code slash commands.

---

## Full Workflow Flow

```mermaid
flowchart TD
    %% Phase 0: Specification
    REQ[Requirements<br/>Natural Language]

    %% Phase 0: Feature Specification
    REQ -->|/tdk-specify| SPEC[spec.md<br/>Feature Specification]
    SPEC -->|/tdk-clarify| SPEC_CLARIFIED[spec.md<br/>+ Clarifications]
    SPEC_CLARIFIED -.->|/tdk-task-breakdown<br/>optional| TASK_BREAKDOWN[tasks-breakdown/<br/>Portable Work Items]
    SPEC_CLARIFIED -->|/tdk-ba-requirement| BA_REQ[ba-requirement.md<br/>BA Requirements]
    BA_REQ -.->|Approval| BA_REQ
    BA_REQ -->|/tdk-test-viewpoint| TEST_VP[test-viewpoint.csv<br/>Test Viewpoints]

    %% Phase 1: Architecture & Design
    BA_REQ -->|/tdk-plan| PLAN[plan.md<br/>Implementation Plan]
    BA_REQ -->|/tdk-plan| RESEARCH[research/<br/>Technology Research]
    BA_REQ -->|/tdk-plan| DATAMODEL[data-model.md<br/>+ Enum Definitions]
    BA_REQ -->|/tdk-plan| STATETRANS[state-transitions.md<br/>State Transitions]
    BA_REQ -->|/tdk-plan| CONTRACTS[contracts/<br/>API Specs YAML/MD]
    BA_REQ -->|/tdk-plan| QUICKSTART[quickstart.md<br/>Setup Guide]
    BA_REQ -->|/tdk-plan| WIREFRAMES[design/wireframes/<br/>wf-*.html]

    %% Phase 1: Detailed Design & Approval
    PLAN -->|/tdk-api-design| API_DESIGN[api_design.md<br/>API + DB Design]
    PLAN -->|/tdk-batch-design| BATCH_DESIGN[batch-design.md<br/>Batch Processing Design]
    PAGEDESIGNS[page-designs/<br/>category/screen.md]
    UI_DESIGN[ui-design-*.md<br/>Screen Definition]
    API_DESIGN -.->|Approval| API_DESIGN
    UI_DESIGN -.->|Approval| UI_DESIGN
    PAGEDESIGNS -.->|Approval| PAGEDESIGNS

    %% Phase 2: Implementation (Solo Path - Primary)
    PLAN -->|/tdk-implement<br/>or --phase NN| CODE_BE[backend/src/<br/>Backend Code]
    PLAN -->|/tdk-implement<br/>or --phase NN| CODE_FE[frontend/pages/<br/>Frontend Code]

    %% Styling
    classDef phase0 fill:#e1f5ff,stroke:#01579b,stroke-width:2px
    classDef phase1 fill:#f3e5f5,stroke:#4a148c,stroke-width:2px
    classDef phase2 fill:#fff3e0,stroke:#e65100,stroke-width:2px
    classDef phase3 fill:#e8f5e9,stroke:#1b5e20,stroke-width:2px
    classDef phase4 fill:#fff9c4,stroke:#f57f17,stroke-width:2px
    classDef phase5 fill:#ffebee,stroke:#b71c1c,stroke-width:2px
    classDef reference fill:#f5f5f5,stroke:#616161,stroke-width:1px,stroke-dasharray: 5 5
    classDef code fill:#e3f2fd,stroke:#0d47a1,stroke-width:2px
    classDef infra fill:#fce4ec,stroke:#880e4f,stroke-width:2px

    class REQ,SPEC,SPEC_CLARIFIED,TASK_BREAKDOWN phase0
    class PLAN,RESEARCH,DATAMODEL,STATETRANS,CONTRACTS,QUICKSTART,WIREFRAMES,PAGEDESIGNS,BATCH_DESIGN phase1
    class TEST_VP phase0
    class CONSTITUTION,UIUX,REF_DATAMODEL,REF_STATE reference
    class CODE_BE,CODE_FE,TESTS code
```

---

## Phase-by-Phase Details

### Phase 0: Specification

```mermaid
flowchart LR
    REQ[Requirements]
    SPEC[spec.md]
    SPEC_CLAR[spec.md<br/>+ Clarifications]
    TASKS[tasks-breakdown/<br/>Portable Work Items]
    BA_REQ[ba-requirement.md]

    REQ -->|"/tdk-specify<br/>feature-id desc"| SPEC
    SPEC -->|"/tdk-clarify<br/>feature-id"| SPEC_CLAR
    SPEC_CLAR -.->|"/tdk-task-breakdown<br/>feature-id"| TASKS
    SPEC_CLAR -->|"/tdk-ba-requirement"| BA_REQ

    BA_REQ -.->|contains| CONTENT["- Functional requirements<br/>- User stories<br/>- Acceptance criteria<br/>- Approval section"]

    classDef input fill:#e1f5ff,stroke:#01579b,stroke-width:2px
    classDef output fill:#b3e5fc,stroke:#01579b,stroke-width:2px
    classDef note fill:#f5f5f5,stroke:#616161,stroke-width:1px

    class REQ input
    class SPEC,SPEC_CLAR,TASKS,BA_REQ output
    class CONTENT note
```

**Promote a large work-item → child spec.** A work-item big enough to be its own
sub-feature can be promoted into an independent child spec at `specs/<child-id>/`, linked
to its parent by a single `parent_spec` frontmatter field (no path nesting). The child
re-runs this same Phase 0 pipeline. See
[Promote Convention](./promote-convention.md) for the manual seed flow, the
`[folder/]ticket` `parent_spec` format rule, and the sizing rule.

### Phase 1: Design & Architecture

```mermaid
flowchart TD
    BA_REQ[ba-requirement.md]

    subgraph REFERENCES[Reference Files]
        CONST[constitution.md]
        UIUX[ui-ux-design.md]
        REF_DM[data-model-template.md.tpl]
    end

    subgraph PLAN_OUTPUT["/tdk-plan output"]
        PLAN[plan.md]
        RESEARCH[research/]
        DATAMODEL[data-model.md]
        STATE[state-transitions.md]
        CONTRACTS[contracts/]
    end

    subgraph DETAILED_DESIGN["Detailed Design (for Approval)"]
        API_DESIGN[api_design.md]
        PAGEDESIGNS[page-designs/]
        UI_DESIGN[ui-design-*.md]
    end

    BA_REQ -->|/tdk-plan| PLAN_OUTPUT
    PLAN -->|/tdk-api-design| API_DESIGN

    CONST -.->|ref| RESEARCH
    UIUX -.->|ref| PAGEDESIGNS
    REF_DM -.->|ref| DATAMODEL

    classDef input fill:#e1f5ff,stroke:#01579b,stroke-width:2px
    classDef output fill:#f3e5f5,stroke:#4a148c,stroke-width:2px
    classDef reference fill:#f5f5f5,stroke:#616161,stroke-width:1px,stroke-dasharray: 5 5

    class BA_REQ input
    class PLAN,RESEARCH,DATAMODEL,STATE,CONTRACTS output
    class API_DESIGN,UI_DESIGN,PAGEDESIGNS output
    class CONST,UIUX,REF_DM reference
```

### Phase 2: Implementation Paths

#### Solo Path (Primary)
```mermaid
flowchart TD
    PLAN[plan.md<br/>## Phases table]

    subgraph IMPL_OUTPUT[Implementation Output]
        CODE_BE[backend/src/]
        CODE_FE[frontend/pages/]
        TESTS[tests/]
    end

    PLAN -->|"/tdk-implement<br/>[--phase NN]"| IMPL_OUTPUT

    classDef input fill:#f3e5f5,stroke:#4a148c,stroke-width:2px
    classDef code fill:#e3f2fd,stroke:#0d47a1,stroke-width:2px

    class PLAN input
    class CODE_BE,CODE_FE,TESTS code
```

`/tdk-implement <id>` runs all runnable rows from `plan.md ## Phases`.
`/tdk-implement <id> --phase NN` runs one selected phase while still honoring dependencies and global stale `in_progress` recovery.

### Unit Testing Pipeline

```mermaid
flowchart TD
    SPEC_UT[spec.md<br/>Feature Spec]
    UT_SKILL["consumer UT skill<br/>.claude/skills/{name}/SKILL.md"]

    subgraph PLANNING_UT["Test Planning"]
        UT_PLAN_CMD["/tdk-ut-backfill-plan id<br/>--sub-workspace name"]
        UT_PLAN["ut/plan.md<br/>Test Strategy"]
        UT_PHASES["ut/phases/{module1}.md<br/>ut/phases/{module2}.md<br/>..."]
    end

    subgraph GENERATION_UT["Routed Test Implementation"]
        UT_GEN["consumer test skill<br/>from ## Delegate Skills"]
        TEST_FILES["*.test.ts / test_*.py<br/>*Test.php + fixtures"]
    end

    ROUTING["plan-skill-routing.md<br/>test domain"]

    ROUTING -->|selects test skill| UT_PLAN_CMD
    UT_SKILL -->|conventions| UT_PLAN_CMD
    UT_PLAN_CMD --> UT_PLAN
    UT_PLAN_CMD --> UT_PHASES
    UT_PHASES -->|## Delegate Skills| UT_GEN
    UT_SKILL -.->|conventions| UT_GEN
    UT_GEN --> TEST_FILES
    UT_AUTO -.->|"automates"| UT_PLAN_CMD
    UT_AUTO -.->|"automates"| UT_GEN
    SPEC_UT -.->|optional input| UT_PLAN_CMD

    classDef planning fill:#f3e5f5,stroke:#4a148c,stroke-width:2px
    classDef generation fill:#fff3e0,stroke:#e65100,stroke-width:2px
    classDef orchestrator fill:#e1f5ff,stroke:#01579b,stroke-width:2px
    classDef reference fill:#f5f5f5,stroke:#616161,stroke-width:1px,stroke-dasharray: 5 5

    class UT_PLAN_CMD,UT_PLAN,UT_PHASES planning
    class UT_GEN,TEST_FILES generation
    class UT_AUTO orchestrator
    class SPEC_UT,UT_SKILL reference
```

`ut:auto` runs the full pipeline in one command; use individual commands for manual control. `--sub-workspace` targets a specific workspace (e.g., `backend`, `frontend`). `--standalone` on `ut:plan` skips spec dependency for existing code.

### Config & Workspace Management

```mermaid
flowchart TD
    subgraph WS_INIT["Workspace Setup"]
        SUB_INIT["/tdk-sub-workdspace-init<br/>frontend / backend"]
        YAML[".specify.yaml<br/>Sub-workspace Config"]
    end

    subgraph DOC_COMPARE["Doc Comparison"]
        DIFF["/tdk-config-diff<br/>--sub-workspace name"]
        DIFF_REPORT["Diff Table<br/>Missing / Outdated / OK"]
    end

    subgraph DOC_SYNC["Synchronization"]
        SYNC_CMD["/tdk-config-sync"]
        TO_SUB["--to-sub-workspace<br/>Workspace → Sub"]
        FROM_SUB["--from-sub-workspace<br/>Sub → Workspace"]
        ALL_WS["--all<br/>All Sub-workspaces"]
    end

    subgraph DOC_INDEX["Documentation Index"]
        INDEX_CMD["/tdk-config-index<br/>--sub-workspace name"]
        DOC_MGR["document-manager.md<br/>Auto-generated Index"]
    end

    SUB_INIT --> YAML
    YAML -->|enables| DIFF
    DIFF --> DIFF_REPORT
    DIFF_REPORT -->|informs| SYNC_CMD
    SYNC_CMD --> TO_SUB
    SYNC_CMD --> FROM_SUB
    SYNC_CMD --> ALL_WS
    YAML -->|enables| INDEX_CMD
    INDEX_CMD --> DOC_MGR

    classDef init fill:#e1f5ff,stroke:#01579b,stroke-width:2px
    classDef compare fill:#fff9c4,stroke:#f57f17,stroke-width:2px
    classDef sync fill:#e8f5e9,stroke:#1b5e20,stroke-width:2px
    classDef index fill:#f3e5f5,stroke:#4a148c,stroke-width:2px

    class SUB_INIT,YAML init
    class DIFF,DIFF_REPORT compare
    class SYNC_CMD,TO_SUB,FROM_SUB,ALL_WS sync
    class INDEX_CMD,DOC_MGR index
```

Always run `config:diff` before `config:sync` to preview changes. Use `--dry-run` with sync for safe previews. `config:index` generates `document-manager.md` for LLM discoverability.

---

## Artifact Matrix

| Artifact | Created By | Input From | Used By | Update Frequency |
|----------|-----------|------------|---------|-----------------|
| `spec.md` | `/tdk-specify` | User description | `/tdk-plan`, all downstream | Feature start |
| `spec.md` (+ Clarifications) | `/tdk-clarify` | `spec.md` | `/tdk-ba-requirement` | After specify |
| `tasks-breakdown/` | `/tdk-task-breakdown` | clarified `spec.md` | Consumer-owned tracker sync | Optional after clarify |
| `ba-requirement.md` | `/tdk-ba-requirement` | `spec.md` | `/tdk-plan` | For Approval |
| `plan.md` | `/tdk-plan` | `ba-requirement.md`, `constitution.md` | `plan.md ## Phases`, `/tdk-implement [--phase NN]` | Feature start |
| `plan.md ## Phases` | `/tdk-plan` | `ba-requirement.md`, design artifacts | `/tdk-implement [--phase NN]` | Feature start |
| `research/` | `/tdk-plan` | `ba-requirement.md` | Reference | Feature start |
| `data-model.md` | `/tdk-plan` | `ba-requirement.md` | Reference | Feature start |
| `api_design.md` | `/tdk-api-design` | `plan.md` | Reference | For Approval |
| `batch-design.md` | `/tdk-batch-design` | `spec.md`, `research/`, `data-model.md` | Reference | For Approval |
| `test-viewpoint.csv` | `/tdk-test-viewpoint` | `spec.md`, `ba-requirement.md` | Manual reference | After ba-requirement |
| `backend/src/**` | `/tdk-implement` | `plan.md ## Phases` | Testing | Implementation |
| `frontend/pages/**` | `/tdk-implement` | `plan.md ## Phases`, `page-designs/` | Testing, review | Implementation |
| `ut/plan.md` | `/tdk-ut-backfill-plan` | `spec.md` (opt), consumer test skill routing | `/tdk-implement` | Feature UT |
| `ut/phases/{module}.md` | `/tdk-ut-backfill-plan` | `spec.md` (opt), `plan-skill-routing.md` | consumer test skill via `## Delegate Skills` | Feature UT |
| `*.test.ts` / `test_*.py` etc. | consumer test skill | `ut/phases/{module}.md` | Test runner | Feature UT |
| `.specify.yaml` | `/tdk-sub-workdspace-init` | Project config | `config:*`, `ut:*` | Project setup |
| `document-manager.md` | `/tdk-config-index` | All docs files | Manual reference, LLM tools | On demand |

---

## Reference Files (Templates)

These files are **read-only references** used by multiple commands but never modified:

```mermaid
flowchart LR
    subgraph TEMPLATES[Reference Files]
        CONST[.specify/memory/<br/>constitution.md]
        UIUX[ui-ux-design.md<br/>Design System]
        REF_DM[.specify/templates/<br/>data-model-template.md.tpl]
        REF_ST[.specify/templates/<br/>state-transitions-template.md.tpl]
    end

    subgraph COMMANDS[Commands That Reference]
        PLAN[tdk-plan]
    end

    CONST -.->|principles| PLAN
    UIUX -.->|design| PLAN
    REF_DM -.->|enum format| PLAN
    REF_ST -.->|state format| PLAN

    classDef reference fill:#f5f5f5,stroke:#616161,stroke-width:2px,stroke-dasharray: 5 5
    classDef command fill:#e3f2fd,stroke:#0d47a1,stroke-width:2px

    class CONST,UIUX,REF_DM,REF_ST reference
    class PLAN command
```

---

## Event-Driven Update Triggers

```mermaid
flowchart TD
    START{Event}

    START -->|New feature| SPECIFY[tdk-specify]
    START -->|API change| UPDATE_CONTRACT[contracts/ manual edit]

    SPECIFY --> CLARIFY[tdk-clarify]
    CLARIFY --> PLAN[tdk-plan]
    PLAN --> IMPLEMENT[tdk-implement]
    
    UPDATE_CONTRACT --> PLAN

    classDef event fill:#fff3e0,stroke:#e65100,stroke-width:2px
    classDef command fill:#e3f2fd,stroke:#0d47a1,stroke-width:2px
    class START event
    class SPECIFY,CLARIFY,PLAN,IMPLEMENT command
```

---

## Artifact Directory Structure

```
.specify/specs/{task-id}/
├── spec.md                             # Phase 0: Feature specification
├── plan.md                             # Phase 1: Implementation plan
├── research/                           # Phase 1: Technology research
├── data-model.md                       # Phase 1: Entity definitions + enums
├── state-transitions.md                # Phase 1: State machine definitions
├── quickstart.md                       # Phase 1: Setup guide
├── contracts/                          # Phase 1: API specifications
│   └── *.yaml
├── design/wireframes/                  # Phase 1: UI wireframes
│   └── wf-*.html
├── page-designs/                       # Phase 1: Screen specifications
│   └── {category}/
│       └── {screen}.md
└── checklists/                         # Quality checklists
    └── requirements.md
```
