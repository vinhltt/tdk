# TDK Workflow Map

> Bản đồ input/output file cho TDK command workflow.
> Dùng file này để xem mỗi command `/tdk-*` đọc file nào, ghi file nào, và truyền gì cho bước sau.

---

![TDK lifecycle workflow](../../assets/lifecycle-share-graph.png)

## Full Workflow Map

```mermaid
flowchart TD
    %% Phase 0: Specification
    REQ[Requirements<br/>Natural Language]
    PRODUCT_CONTEXT[product-context.md<br/>Project Context]
    GREENFIELD_INCEPTION[project-inception.md<br/>Greenfield Intake]
    BROWNFIELD_ONBOARDING[brownfield-onboarding.md<br/>Brownfield Onboarding]
    ARCHITECTURE_REPORTS[architecture-options.md<br/>architecture-decision.md<br/>architecture-recovery.md]
    TOPOLOGY[workspace-layout-proposal.md/json<br/>Layout Proposal]
    CONFIG_PATCH[config topology apply<br/>Dry-run / Guarded Apply]
    POLICY[workspace-dependency-policy.md<br/>enforcement-snippets.md]
    GOLDEN_PATH[golden-path-scaffold-plan.md<br/>golden-path-recipe.json]
    SUB_WORKSPACE_DOCS[sub-workspaces/name/<br/>README architecture interfaces engineering]
    AUTOMATION_RECOMMEND[automation-recommendation.md]
    DISCOVERY[discovery.md + discovery/<br/>Epic Context]
    EPIC_PRD[epic-prd.md + epic-prd/<br/>PRD + Slice Map]
    HLD[high-level-design.md + high-level-design/<br/>Parent HLD]
    TASK_BREAKDOWN[tasks-breakdown.md + tasks-breakdown/<br/>Child Spec Seeds]

    %% Phase 0: Feature Specification
    REQ -.->|/tdk-greenfield-start<br/>project intake| GREENFIELD_INCEPTION
    REQ -.->|/tdk-brownfield-start<br/>repo onboarding| BROWNFIELD_ONBOARDING
    GREENFIELD_INCEPTION -.->|/tdk-architecture-advisor<br/>project decision| ARCHITECTURE_REPORTS
    BROWNFIELD_ONBOARDING -.->|/tdk-architecture-advisor --recover-existing<br/>recovery report| ARCHITECTURE_REPORTS
    ARCHITECTURE_REPORTS -.->|/tdk-workspace-layout-propose<br/>proposal only| TOPOLOGY
    TOPOLOGY -.->|/tdk-workflow-config-apply<br/>review/apply| CONFIG_PATCH
    CONFIG_PATCH -.->|/tdk-workspace-dependency-policy<br/>policy only| POLICY
    POLICY -.->|/tdk-golden-path-scaffold<br/>dry-run first| GOLDEN_PATH
    POLICY -.->|/tdk-sub-workspace-docs<br/>arc42-lite docs| SUB_WORKSPACE_DOCS
    SUB_WORKSPACE_DOCS -.->|/tdk-sub-workspace-automation-recommend<br/>one workspace| AUTOMATION_RECOMMEND
    REQ -.->|/tdk-discovery<br/>optional, epic| DISCOVERY
    DISCOVERY -.->|/tdk-epic-prd<br/>product alignment| EPIC_PRD
    EPIC_PRD -.->|/tdk-epic-hld<br/>parent design| HLD
    HLD -.->|/tdk-task-breakdown<br/>child spec seeds| TASK_BREAKDOWN
    TASK_BREAKDOWN -.->|child /tdk-specify<br/>seed| SPEC
    REQ -->|/tdk-specify| SPEC[spec.md<br/>Feature Specification]
    DISCOVERY -.->|context only| SPEC
    PRODUCT_CONTEXT -.->|project authority| GREENFIELD_INCEPTION
    PRODUCT_CONTEXT -.->|project authority| BROWNFIELD_ONBOARDING
    PRODUCT_CONTEXT -.->|project authority| DISCOVERY
    PRODUCT_CONTEXT -.->|project authority| SPEC
    SPEC -->|/tdk-clarify| SPEC_CLARIFIED[spec.md<br/>+ Clarifications]

    %% Phase 1: Architecture & Design
    SPEC_CLARIFIED -->|/tdk-plan| PLAN[plan.md<br/>Implementation Plan]
    SPEC_CLARIFIED -->|/tdk-plan| RESEARCH[research/<br/>Technology Research]
    SPEC_CLARIFIED -->|/tdk-plan| DATAMODEL[data-model.md<br/>+ Enum Definitions]
    SPEC_CLARIFIED -->|/tdk-plan| STATETRANS[state-transitions.md<br/>State Transitions]
    SPEC_CLARIFIED -->|/tdk-plan| CONTRACTS[contracts/<br/>API Specs YAML/MD]
    SPEC_CLARIFIED -->|/tdk-plan| QUICKSTART[quickstart.md<br/>Setup Guide]
    SPEC_CLARIFIED -->|/tdk-plan| WIREFRAMES[design/wireframes/<br/>wf-*.html]

    %% Phase 2: Implementation
    PLAN -->|/tdk-implement<br/>or --phase NN| CODE_BE[backend/src/<br/>Backend Code]
    PLAN -->|/tdk-implement<br/>or --phase NN| CODE_FE[frontend/pages/<br/>Frontend Code]

    classDef phase0 fill:#e1f5ff,stroke:#01579b,stroke-width:2px,color:#0f172a
    classDef phase1 fill:#f3e5f5,stroke:#4a148c,stroke-width:2px,color:#0f172a
    classDef phase2 fill:#fff3e0,stroke:#e65100,stroke-width:2px,color:#0f172a
    classDef phase3 fill:#e8f5e9,stroke:#1b5e20,stroke-width:2px,color:#0f172a
    classDef phase4 fill:#fff9c4,stroke:#f57f17,stroke-width:2px,color:#0f172a
    classDef phase5 fill:#ffebee,stroke:#b71c1c,stroke-width:2px,color:#0f172a
    classDef reference fill:#f5f5f5,stroke:#616161,stroke-width:1px,stroke-dasharray: 5 5,color:#0f172a
    classDef code fill:#e3f2fd,stroke:#0d47a1,stroke-width:2px,color:#0f172a
    classDef infra fill:#fce4ec,stroke:#880e4f,stroke-width:2px,color:#0f172a

    class REQ,GREENFIELD_INCEPTION,BROWNFIELD_ONBOARDING,TOPOLOGY,CONFIG_PATCH,POLICY,SUB_WORKSPACE_DOCS,AUTOMATION_RECOMMEND,DISCOVERY,EPIC_PRD,HLD,TASK_BREAKDOWN,SPEC,SPEC_CLARIFIED phase0
    class PLAN,RESEARCH,DATAMODEL,STATETRANS,CONTRACTS,QUICKSTART,WIREFRAMES phase1
    class PRODUCT_CONTEXT,CONSTITUTION,UIUX,REF_DATAMODEL,REF_STATE reference
    class CODE_BE,CODE_FE,TESTS code
```

---

## Chi Tiết Theo Phase

### Phase 0: Specification

```mermaid
flowchart LR
    REQ[Requirements]
    GREENFIELD_INCEPTION[project-inception.md]
    BROWNFIELD_ONBOARDING[brownfield-onboarding.md]
    ARCHITECTURE_REPORTS[architecture reports]
    TOPOLOGY[workspace-layout-proposal.md/json]
    CONFIG_PATCH[config dry-run/apply]
    POLICY[workspace-dependency-policy.md<br/>enforcement-snippets.md]
    GOLDEN_PATH[golden-path scaffold<br/>recipe/report]
    SUB_WORKSPACE_DOCS[sub-workspace docs<br/>arc42-lite]
    AUTOMATION_RECOMMEND[automation recommendation<br/>one workspace]
    DISCOVERY[discovery.md + discovery/<br/>Epic Context]
    EPIC_PRD[epic-prd.md + epic-prd/<br/>PRD + Slice Map]
    HLD[high-level-design.md + high-level-design/<br/>Parent HLD]
    TASKS[tasks-breakdown.md + tasks-breakdown/<br/>Child Spec Seeds]
    SPEC[spec.md]
    SPEC_CLAR[spec.md<br/>+ Clarifications]

    REQ -.->|"/tdk-greenfield-start"| GREENFIELD_INCEPTION
    REQ -.->|"/tdk-brownfield-start"| BROWNFIELD_ONBOARDING
    GREENFIELD_INCEPTION -.->|"/tdk-architecture-advisor"| ARCHITECTURE_REPORTS
    BROWNFIELD_ONBOARDING -.->|"/tdk-architecture-advisor --recover-existing"| ARCHITECTURE_REPORTS
    ARCHITECTURE_REPORTS -.->|"/tdk-workspace-layout-propose"| TOPOLOGY
    TOPOLOGY -.->|"/tdk-workflow-config-apply<br/>review/apply"| CONFIG_PATCH
    CONFIG_PATCH -.->|"/tdk-workspace-dependency-policy<br/>policy only"| POLICY
    POLICY -.->|"/tdk-golden-path-scaffold<br/>dry-run first"| GOLDEN_PATH
    POLICY -.->|"/tdk-sub-workspace-docs"| SUB_WORKSPACE_DOCS
    SUB_WORKSPACE_DOCS -.->|"/tdk-sub-workspace-automation-recommend"| AUTOMATION_RECOMMEND
    REQ -.->|"/tdk-discovery<br/>epic-id brief"| DISCOVERY
    DISCOVERY -.->|"/tdk-epic-prd<br/>epic-id"| EPIC_PRD
    EPIC_PRD -.->|"/tdk-epic-hld<br/>epic-id"| HLD
    HLD -.->|"/tdk-task-breakdown<br/>epic-id"| TASKS
    TASKS -.->|"child /tdk-specify<br/>seed"| SPEC
    REQ -->|"/tdk-specify<br/>feature-id desc"| SPEC
    DISCOVERY -.->|"context only"| SPEC
    SPEC -->|"/tdk-clarify<br/>feature-id"| SPEC_CLAR

    SPEC_CLAR -.->|contains| CONTENT["- Functional requirements<br/>- User stories<br/>- Acceptance criteria<br/>- Clarifications"]

    classDef input fill:#e1f5ff,stroke:#01579b,stroke-width:2px,color:#0f172a
    classDef output fill:#b3e5fc,stroke:#01579b,stroke-width:2px,color:#0f172a
    classDef note fill:#f5f5f5,stroke:#616161,stroke-width:1px,color:#0f172a

    class REQ input
    class GREENFIELD_INCEPTION,BROWNFIELD_ONBOARDING,TOPOLOGY,CONFIG_PATCH,POLICY,SUB_WORKSPACE_DOCS,AUTOMATION_RECOMMEND,DISCOVERY,EPIC_PRD,SPEC,SPEC_CLAR,HLD,TASKS output
    class CONTENT note
```

**Tạo child spec từ seed.** Một seed `tasks-breakdown/task-NNN-{slice}.md`
có thể spec độc lập có thể trở thành child spec tại `specs/<child-id>/`.
Traceability của parent epic nằm trong seed refs; `parent_spec` chỉ dành cho
link rõ ràng tới một parent `spec.md` đã tồn tại. Xem
[Promote Convention](concepts/promote-convention.md) để biết manual seed flow,
optional `parent_spec` rule, và sizing rule.

### Phase 1: Design & Architecture

```mermaid
flowchart TD
    SPEC_CLAR[spec.md<br/>+ Clarifications]

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

    SPEC_CLAR -->|/tdk-plan| PLAN_OUTPUT

    CONST -.->|ref| RESEARCH
    REF_DM -.->|ref| DATAMODEL

    classDef input fill:#e1f5ff,stroke:#01579b,stroke-width:2px,color:#0f172a
    classDef output fill:#f3e5f5,stroke:#4a148c,stroke-width:2px,color:#0f172a
    classDef reference fill:#f5f5f5,stroke:#616161,stroke-width:1px,stroke-dasharray: 5 5,color:#0f172a

    class SPEC_CLAR input
    class PLAN,RESEARCH,DATAMODEL,STATE,CONTRACTS output
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

    classDef input fill:#f3e5f5,stroke:#4a148c,stroke-width:2px,color:#0f172a
    classDef code fill:#e3f2fd,stroke:#0d47a1,stroke-width:2px,color:#0f172a

    class PLAN input
    class CODE_BE,CODE_FE,TESTS code
```

`/tdk-implement <id>` chạy toàn bộ runnable rows từ `plan.md ## Phases`.
`/tdk-implement <id> --phase NN` chạy một selected phase, đồng thời vẫn tôn trọng dependencies và global stale `in_progress` recovery.

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
    SPEC_UT -.->|optional input| UT_PLAN_CMD

    classDef planning fill:#f3e5f5,stroke:#4a148c,stroke-width:2px,color:#0f172a
    classDef generation fill:#fff3e0,stroke:#e65100,stroke-width:2px,color:#0f172a
    classDef orchestrator fill:#e1f5ff,stroke:#01579b,stroke-width:2px,color:#0f172a
    classDef reference fill:#f5f5f5,stroke:#616161,stroke-width:1px,stroke-dasharray: 5 5,color:#0f172a

    class UT_PLAN_CMD,UT_PLAN,UT_PHASES planning
    class UT_GEN,TEST_FILES generation
    class SPEC_UT,UT_SKILL reference
```

Dùng `/tdk-ut-backfill-plan` để tạo unit-test plan và phase files, sau đó `/tdk-implement` chạy phase delegates qua consumer test skill được liệt kê trong `## Delegate Skills`. `--sub-workspace` target workspace cụ thể, ví dụ `backend`, `frontend`. `--standalone` trên `/tdk-ut-backfill-plan` bỏ qua spec dependency cho existing code.

### Config & Workspace Management

```mermaid
flowchart TD
    subgraph WS_INIT["Workspace Setup"]
        SUB_INIT["/tdk-sub-workspace-init<br/>frontend / backend"]
        JSON[".specify/.specify.json<br/>Sub-workspace Config"]
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

    SUB_INIT --> JSON
    JSON -->|enables| DIFF
    DIFF --> DIFF_REPORT
    DIFF_REPORT -->|informs| SYNC_CMD
    SYNC_CMD --> TO_SUB
    SYNC_CMD --> FROM_SUB
    SYNC_CMD --> ALL_WS
    JSON -->|enables| INDEX_CMD
    INDEX_CMD --> DOC_MGR

    classDef init fill:#e1f5ff,stroke:#01579b,stroke-width:2px,color:#0f172a
    classDef compare fill:#fff9c4,stroke:#f57f17,stroke-width:2px,color:#0f172a
    classDef sync fill:#e8f5e9,stroke:#1b5e20,stroke-width:2px,color:#0f172a
    classDef index fill:#f3e5f5,stroke:#4a148c,stroke-width:2px,color:#0f172a

    class SUB_INIT,JSON init
    class DIFF,DIFF_REPORT compare
    class SYNC_CMD,TO_SUB,FROM_SUB,ALL_WS sync
    class INDEX_CMD,DOC_MGR index
```

Luôn chạy `config:diff` trước `config:sync` để preview changes. Dùng `--dry-run` với sync để preview an toàn. `config:index` generate `document-manager.md` để LLM dễ discover.

---

## Workflow File Matrix

| File | Created By | Input From | Used By | Update Frequency |
|----------|-----------|------------|---------|-----------------|
| `product-context.md` | `/tdk-constitution --init/update` | constitution, memory, accepted project brief/update feedback | `/tdk-discovery`, `/tdk-specify`, `/tdk-plan` context | Khi project authority đổi |
| `.specify/configurations/inception/project-inception.md` | `/tdk-greenfield-start` | Project brief hoặc workspace-local file cộng với project-inception questions | Readiness-aware recommended greenfield route | New-project intake |
| `.specify/configurations/inception/brownfield-onboarding.md` | `/tdk-brownfield-start` | Existing repo evidence, optional scout output | Evidence/confidence-based brownfield onboarding route | Existing-repo intake |
| `.specify/configurations/architecture/architecture-options.md` | `/tdk-architecture-advisor` | Inception, onboarding, discovery, spec, scout, README, hoặc bounded repo evidence | Architecture decision review | Project architecture options |
| `.specify/configurations/architecture/architecture-decision.md` | `/tdk-architecture-advisor` | `architecture-options.md` cộng với accepted assumptions | `/tdk-workspace-layout-propose` hoặc future layout work | Project architecture decision |
| `.specify/configurations/architecture/architecture-recovery.md` | `/tdk-architecture-advisor --recover-existing` | Brownfield onboarding, scout, README, hoặc bounded repo evidence | Brownfield-safe architecture recovery review | Existing-repo recovery |
| `.specify/configurations/workspace-layout/workspace-layout-proposal.md` | `/tdk-workspace-layout-propose` hoặc human-authored layout proposal | Architecture decision/recovery cộng với inception/onboarding/scout evidence | Human review trước dry-run preview | Project layout proposal |
| `.specify/configurations/workspace-layout/workspace-layout-proposal.json` | `/tdk-workspace-layout-propose` hoặc human-authored layout proposal | Architecture decision/recovery cộng với inception/onboarding/scout evidence | `/tdk-workflow-config-apply` interactive review/apply, hoặc explicit `--dry-run` cho automation preview | Project layout changes |
| `.specify/configurations/workspace-topology/workspace-topology.md` | `/tdk-boundary-map` compatibility hoặc human-authored legacy topology proposal | Legacy topology evidence | Human review trước dry-run preview | Legacy project topology proposal |
| `.specify/configurations/workspace-topology/workspace-topology.json` | `/tdk-boundary-map` compatibility hoặc human-authored legacy topology proposal | Legacy topology evidence | `/tdk-workflow-config-apply` legacy fallback | Legacy project topology changes |
| `config topology dry-run/apply` | `/tdk-workflow-config-apply` | `workspace-layout-proposal.json`, legacy `workspace-topology.json`, existing JSON `.specify/.specify.json` | Human review; parsed `planHash` được truyền internally cho guarded write | Runtime config preview hoặc guarded config write |
| `.specify/configurations/workspace-dependency-policy/workspace-dependency-policy.md` | `/tdk-workspace-dependency-policy` | layout files, existing `.specify/.specify.json`, repo stack evidence | Human review dependency guidance | Optional project dependency policy |
| `.specify/configurations/workspace-dependency-policy/enforcement-snippets.md` | `/tdk-workspace-dependency-policy --suggest` | policy report và detected stack evidence | Human-applied enforcement config candidates | Optional snippet guidance |
| `.specify/configurations/module-boundary-policy/module-boundary-policy.md` | `/tdk-module-boundary-policy` compatibility | legacy topology files, existing `.specify/.specify.json`, repo stack evidence | Human review legacy boundary guidance | Legacy optional project boundary policy |
| `.specify/configurations/golden-path/golden-path-scaffold-plan.md` | `/tdk-golden-path-scaffold --dry-run` | approved layout/config evidence, architecture decision/recovery, optional dependency policy | Human review trước recipe approval | Optional skeleton plan |
| `.specify/configurations/golden-path/golden-path-recipe.json` | `/tdk-golden-path-scaffold --dry-run` | scaffold plan và approved layout/config evidence | Set `status: approved` trước guarded apply | Optional skeleton recipe |
| `.specify/configurations/golden-path/generated-files-report.md` | `/tdk-golden-path-scaffold --dry-run` hoặc `--yes` | recipe và safety gates | Review created/skipped/existing/refused paths | Scaffold report |
| `<docsPath>/sub-workspaces/<name>/{README,architecture,interfaces,engineering}.md` | `/tdk-sub-workspace-docs` | configured sub-workspace path, repomix pack, scout output, optional dependency policy | `/tdk-sub-workspace-automation-recommend` | Refresh docs theo sub-workspace |
| `.specify/configurations/automation-recommendations/sub-workspaces/<name>/automation-recommendation.md` | `/tdk-sub-workspace-automation-recommend` | selected sub-workspace docs, dependency policy, official docs, local skill catalog, optional direct skill search | `/tdk-scaffold-from-recommendation` sau approval | Automation review theo sub-workspace |
| `discovery.md` + `discovery/` | `/tdk-discovery` | Epic brief hoặc file, project context, memory, constitution; existing discovery files cho ID-only `--interview` | Optional context cho `/tdk-epic-prd` | Optional trước epic PRD |
| `epic-prd.md` + `epic-prd/` | `/tdk-epic-prd` | Existing `discovery.md`, `problem.md`, `personas.md`, và `mvp-scope.md`; existing PRD files cho ID-only `--interview` | Feed `/tdk-epic-hld`, rồi `/tdk-task-breakdown` child spec seeds | Optional sau discovery |
| `spec.md` | `/tdk-specify` | User description, child seed từ `tasks-breakdown/`, hoặc existing `spec.md` cho ID-only `--interview` | `/tdk-clarify`, `/tdk-plan`, toàn bộ downstream | Feature hoặc child-slice start |
| `spec.md` (+ Clarifications) | `/tdk-clarify` | `spec.md` | `/tdk-plan` | Sau specify |
| `{docs.path}/custom-workflow/high-level-design-skill-routing.md` | Human-authored từ `.specify/templates/high-level-design/high-level-design-skill-routing-template.tpl` | Consumer HLD design skills | `/tdk-epic-hld` như advisory read-only routing | Optional project setup |
| `high-level-design.md` + `high-level-design/` | `/tdk-epic-hld` | `epic-prd.md` + `epic-prd/`; built-in lenses; optional HLD routing | `/tdk-task-breakdown` | Parent epic sau PRD |
| `tasks-breakdown.md` + `tasks-breakdown/` | `/tdk-task-breakdown` | `epic-prd.md` + `epic-prd/`; `high-level-design.md` + `high-level-design/` | Child `/tdk-specify` seeds | Parent epic sau HLD |
| `plan.md` | `/tdk-plan` | `spec.md`, `constitution.md`, optional context | `plan.md ## Phases`, `/tdk-implement [--phase NN]` | Feature start |
| `plan.md ## Phases` | `/tdk-plan` | `spec.md`, design files | `/tdk-implement [--phase NN]` | Feature start |
| `research/` | `/tdk-plan` | `spec.md` | Reference | Feature start |
| `data-model.md` | `/tdk-plan` | `spec.md` | Reference | Feature start |
| `backend/src/**` | `/tdk-implement` | `plan.md ## Phases` | Testing | Implementation |
| `frontend/pages/**` | `/tdk-implement` | `plan.md ## Phases`, `page-designs/` | Testing, review | Implementation |
| `ut/plan.md` | `/tdk-ut-backfill-plan` | `spec.md` (opt), consumer test skill routing | `/tdk-implement` | Feature UT |
| `ut/phases/{module}.md` | `/tdk-ut-backfill-plan` | `spec.md` (opt), `plan-skill-routing.md` | consumer test skill qua `## Delegate Skills` | Feature UT |
| `*.test.ts` / `test_*.py` etc. | consumer test skill | `ut/phases/{module}.md` | Test runner | Feature UT |
| `.specify/.specify.json` | `/tdk-sub-workspace-init` | Project config | `config:*`, unit-test routing, sub-workspace docs | Project setup |
| `document-manager.md` | `/tdk-config-index` | Tất cả docs files | Manual reference, LLM tools | Khi cần |

---

## Reference Files (Templates)

Các file này là **read-only references** được nhiều command dùng nhưng không bao giờ modify:

```mermaid
flowchart LR
    subgraph TEMPLATES[Reference Files]
        CONST[.specify/memory/<br/>constitution.md]
        PRODUCT[.specify/memory/<br/>product-context.md]
        UIUX[ui-ux-design.md<br/>Design System]
        REF_DM[.specify/templates/<br/>data-model-template.md.tpl]
        REF_ST[.specify/templates/<br/>state-transitions-template.md.tpl]
    end

    subgraph COMMANDS[Commands That Reference]
        DISCOVERY_CMD[tdk-discovery]
        SPECIFY_CMD[tdk-specify]
        PLAN[tdk-plan]
    end

    CONST -.->|principles| PLAN
    PRODUCT -.->|product facts| DISCOVERY_CMD
    PRODUCT -.->|product facts| SPECIFY_CMD
    UIUX -.->|design| PLAN
    REF_DM -.->|enum format| PLAN
    REF_ST -.->|state format| PLAN

    classDef reference fill:#f5f5f5,stroke:#616161,stroke-width:2px,stroke-dasharray: 5 5,color:#0f172a
    classDef command fill:#e3f2fd,stroke:#0d47a1,stroke-width:2px,color:#0f172a

    class CONST,PRODUCT,UIUX,REF_DM,REF_ST reference
    class DISCOVERY_CMD,SPECIFY_CMD,PLAN command
```

---

## Event-Driven Update Triggers

```mermaid
flowchart TD
    START{Event}

    START -->|New epic| DISCOVERY[tdk-discovery]
    START -->|New feature| SPECIFY[tdk-specify]
    START -->|API change| UPDATE_CONTRACT[contracts/ manual edit]

    DISCOVERY --> EPIC_PRD[tdk-epic-prd]
    EPIC_PRD --> HLD_CMD[tdk-epic-hld]
    HLD_CMD --> BREAKDOWN[tdk-task-breakdown]
    BREAKDOWN --> TRACKER[Consumer-owned tracker sync]
    TRACKER --> CHILD_SPEC[child tdk-specify]
    SPECIFY --> CLARIFY[tdk-clarify]
    CHILD_SPEC --> CHILD_CLARIFY[child tdk-clarify]
    CHILD_CLARIFY --> CHILD_PLAN[child tdk-plan]
    CLARIFY --> PLAN[tdk-plan]
    CHILD_PLAN --> IMPLEMENT[tdk-implement]
    PLAN --> IMPLEMENT
    
    UPDATE_CONTRACT --> PLAN

    classDef event fill:#fff3e0,stroke:#e65100,stroke-width:2px,color:#0f172a
    classDef command fill:#e3f2fd,stroke:#0d47a1,stroke-width:2px,color:#0f172a
    class START event
    class DISCOVERY,EPIC_PRD,SPECIFY,CLARIFY,HLD_CMD,BREAKDOWN,CHILD_SPEC,CHILD_PLAN,PLAN,IMPLEMENT command
```

---

## Workflow File Directory Structure

```text
.specify/specs/{task-id}/
├── index.md                            # Epic dashboard và next-command summary
├── discovery.md                        # Optional discovery stage manifest
├── discovery/                          # Optional discovery detail files
├── epic-prd.md                         # Optional epic PRD stage manifest
├── epic-prd/                           # Optional epic PRD details, slice map, và open questions
├── spec.md                             # Phase 0: Feature specification
├── high-level-design.md                # Optional parent epic HLD stage manifest
├── high-level-design/                  # Optional parent epic HLD detail files
├── tasks-breakdown.md                  # Optional child spec seed manifest
├── tasks-breakdown/                    # Optional child spec seed files sau HLD
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
