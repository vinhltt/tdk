# TDK Skills Guide

> **Last updated**: 2026-07-02
>
> **Source baseline**: TDK `547655e v1.94.1`
>
> **Terminology**: Trong guide này, các item `/tdk-*` được gọi là "commands". Bên trong chúng là Claude Code plugin skills. Hai từ này cùng chỉ một thứ trong ngữ cảnh TDK.
>
> **Chạy ở đâu**: Tất cả command `/tdk-*` được gõ trong **Claude Code chat interface** như VSCode extension hoặc Claude CLI prompt, KHÔNG gõ trong terminal hoặc bash shell.

---

## Mục Lục

- [Vì sao dùng TDK?](#vì-sao-dùng-tdk)
- [Tổng Quan](#tổng-quan)
- [Danh Bạ Skill](#danh-bạ-skill)
- [Bảng Tra Nhanh](#bảng-tra-nhanh)
- [Bắt Đầu Nhanh](#bắt-đầu-nhanh)
- [Tham Chiếu Sử Dụng](#tham-chiếu-sử-dụng)
- [Workflow Map](#workflow-map)
- [Các Tình Huống Sử Dụng](#các-tình-huống-sử-dụng)
- [Gợi Ý Và Best Practices](#gợi-ý-và-best-practices)
- [Khắc Phục Sự Cố](#khắc-phục-sự-cố)

---

## Vì sao dùng TDK?

TDK là framework specification-driven development giúp tạo specs, optional portable task breakdowns, plans, và code từ natural language. Bạn mô tả feature; TDK dẫn bạn qua toàn bộ artifact chain — từ requirements đến implementation sẵn sàng đưa vào production.

TDK là bản native cho Claude Code của framework này.

## Tổng Quan

TDK command suite cung cấp workflow **specification-driven development**. Bạn mô tả feature bằng natural language, optional capture epic discovery và PRD context trước, rồi commands dẫn bạn qua specification, optional design và task breakdown, planning, và implementation.

### Workflow Pipeline

![TDK lifecycle workflow](../../assets/lifecycle-share-graph.png)

```text
                    ┌─────────────────────────────────────────────────────────────────────┐
                    │                   SPECIFICATION-DRIVEN WORKFLOW                     │
                    └─────────────────────────────────────────────────────────────────────┘

  EPIC SETUP (optional, parent-level)
  ┌──────────────┐    ┌───────────┐    ┌────────────┐    ┌──────────┐    ┌────────────────┐
  │ constitution │    │ discovery │───>│ epic-prd   │───>│ epic-hld │───>│ task-breakdown │
  │ project ctx  │    │ context   │    │ slice map  │    │ design   │    │ child seeds    │
  └──────────────┘    └───────────┘    └────────────┘    └──────────┘    └───────┬────────┘
                                                                                  │
                                                                                  v

  FEATURE / CHILD SPEC LOOP
  ┌──────────────┐    ┌──────────┐    ┌──────────┐    ┌────────────────┐    ┌───────────────────┐
  │ feature brief│───>│ specify  │───>│ clarify  │───>│      plan      │───>│ implement         │
  │ or child seed│    │ (--fast) │    │ (should) │    │ plan.md phases │    │ phase execution   │
  └──────────────┘    └────┬─────┘    └────┬─────┘    └───────┬────────┘    └─────────┬─────────┘
                           │               │                  │                       │
                           v               v                  v                       v
                      ┌──────────┐   ┌──────────────┐   ┌──────────────┐       ┌──────────────┐
                      │checklist │   │spec.md gaps  │   │routed test   │       │status/analyze│
                      │optional  │   │resolved      │   │skill         │       │any time      │
                      └──────────┘   └──────────────┘   └──────────────┘       └──────────────┘

  PROJECT-LEVEL (no task ID needed):
  ┌──────────────┐    ┌─────────────────────┐    ┌──────────────────────────┐
  │ constitution │    │ sub-workspace:init  │    │ config:diff/sync/index   │
  └──────────────┘    │ sub-workspace:list  │    └──────────────────────────┘
                      └─────────────────────┘
```

**Minimal feature flow**: `specify` -> `clarify` -> `plan` -> `implement`

**Epic flow**: `constitution` (project-level) -> optional `discovery` -> `epic-prd` -> `epic-hld` -> `task-breakdown` -> child `specify` -> child `clarify` -> child `plan` -> child `implement`

Với feature-sized work, mặc định bỏ qua discovery, epic PRD, HLD, và task breakdown. Nếu feature nhỏ và rõ, spec hiện tại đi thẳng đến `plan` và `implement`. Với broad epic, `epic-prd.md` cộng với `epic-prd/` biến discovery thành product alignment và slice map, `/tdk-epic-hld` thêm parent design context, và `/tdk-task-breakdown` tạo child spec seeds. Mỗi seed sau đó bắt đầu một child `/tdk-specify` loop.

Mỗi command đọc output của command trước đó. Với minimal feature work, chain là `spec.md` -> `plan.md` với `## Phases` -> source code. Với epic-sized work, optional `discovery.md` cộng với `discovery/` feed `epic-prd.md` cộng với `epic-prd/`; epic PRD feed parent HLD; parent HLD feed task breakdown; task breakdown seed child specs. Child specs không chạy HLD by default.

`/tdk-epic-hld` luôn dùng built-in design lenses và có thể optional đọc `{docs.path}/custom-workflow/high-level-design-skill-routing.md` cho advisory consumer design skills. File HLD routing này tách biệt với `plan-skill-routing.md`, vốn vẫn là implementation/test routing cho planning và UT workflows.

---

## Danh Bạ Skill

Section này là contact-card directory cho user-facing TDK skills. Dùng khi cần summary nhanh skill làm gì, có mode/option nào, và khi nào dùng. Dùng [Cheat Sheet](#cheat-sheet) để xem command syntax ngắn gọn và [Usage Reference](#usage-reference) để xem input, output, dependency.

### Visibility Rules

Included:

- `tdk-*` skills trừ khi frontmatter ghi `user-invocable: false`
- verified compatibility routes vẫn có `SKILL.md` hiện hành
- support guides mà user gọi trực tiếp, như `tdk-skill-guide` và `tdk-setup-guide`

Excluded:

- `_shared` folders
- helper skills có `user-invocable: false`
- generic helper skills là internal implementation details

### Core Workflow

| Skill | Summary | Main modes/options | Dùng khi |
|-------|---------|--------------------|----------|
| `/tdk-discovery` | Tạo optional epic context trước product alignment. | `<epic-id> [brief\|file]`, `--force`, `--interview` | Work đủ rộng để problem, persona, và MVP context nên tồn tại trước epic PRD. |
| `/tdk-epic-prd` | Biến discovery thành epic PRD, slice map, và blocking questions. | `<epic-id>`, `--force`, `--interview` | Discovery đã tồn tại và bạn cần product alignment trước decomposition. |
| `/tdk-specify` | Tạo hoặc interview feature/child `spec.md`. | `<id> [desc]`, `--fast`, `--interview` | Bạn sẵn sàng viết requirement authority cho một feature hoặc child slice. |
| `/tdk-clarify` | Hỏi targeted questions và ghi answer lại vào `spec.md`. | `<id>` | `spec.md` có gaps cần resolve trước planning. |
| `/tdk-epic-hld` | Tạo parent epic high-level design context. | `<epic-id>`, `--force` | Epic PRD tồn tại và cần design lenses trước child breakdown. |
| `/tdk-task-breakdown` | Generate child spec seed Markdown từ epic PRD cộng HLD. | `<epic-id>`, `--force` | Một epic cần các child slices có thể spec độc lập. |
| `/tdk-plan` | Generate implementation plan và design artifacts. | `<id> [content]`, `--fast`, `--hard`, `--tdd`, `--ut-backfill`, `--red-team`, `--validate` | `spec.md` đã sẵn sàng trở thành implementation phases; thêm `--tdd`/`--ut-backfill` khi test planning nên nằm trong cùng phases. |
| `/tdk-implement` | Execute runnable rows từ `plan.md ## Phases`. | `<id>`, `--phase NN` | Plan đã tồn tại và một hoặc nhiều implementation phases đã ready. |
| `/tdk-analyze` | Cross-artifact consistency và quality analysis. | `<id>` | Bạn cần read-only verification trên spec, plan, và phases. |
| `/tdk-checklist` | Generate focused quality checklist. | `<id> [focus]` | Requirements cần gate trước downstream implementation. |
| `/tdk-status` | Hiển thị workflow progress. | `<id>` | Bạn cần read-only status snapshot. |

### Project And Architecture

| Skill | Summary | Main modes/options | Dùng khi |
|-------|---------|--------------------|----------|
| `/tdk-constitution` | Tạo hoặc update constitution-owned project context. | `[--init brief\|file]` | Project principles hoặc durable product context cần init/update. |
| `/tdk-greenfield-start` | New-project intake và safe route recommendation. | `[brief\|file]`, `--full`, `--quick`, `--unknown` | Bắt đầu project mới và chưa chắc nên chạy TDK path nào trước. |
| `/tdk-brownfield-start` | Observe-first onboarding cho existing repository. | `[repo-root]`, `--full`, `--config-only`, `--unknown` | Onboard repo có sẵn mà chưa muốn mutate layout/config quá sớm. |
| `/tdk-architecture-advisor` | Ghi project-level architecture options, decision, hoặc recovery report. | `[input\|file]`, `--recover-existing`, `--unknown` | Cần architecture guidance mà không đổi runtime config hoặc source code. |
| `/tdk-workspace-layout-propose` | Đề xuất workspace layout markdown và JSON. | `[input\|file]`, `--from-existing`, `--unknown` | Architecture evidence nên thành reviewable layout proposal. |
| `/tdk-boundary-map` | Compatibility route cho workspace layout proposal. | `[input\|file]`, `--from-existing`, `--unknown` | Legacy users gọi route cũ. Ưu tiên `/tdk-workspace-layout-propose`. |
| `/tdk-workflow-config-apply` | Review/apply `.specify/.specify.json` changes từ layout evidence. | no flags, `--dry-run`, `--reconcile`, `--yes --expect-hash <hash>`, `--topology <path>` | Layout proposal ready cho guarded runtime config review/apply. |
| `/tdk-workspace-dependency-policy` | Ghi dependency policy report và optional enforcement snippets. | `[layout\|file]`, `--audit`, `--suggest` | Approved layout evidence nên thành reviewable dependency guidance. |
| `/tdk-module-boundary-policy` | Compatibility route cho dependency policy. | `[topology\|file]`, `--audit`, `--suggest` | Legacy users gọi module-boundary route cũ. Ưu tiên `/tdk-workspace-dependency-policy`. |
| `/tdk-golden-path-scaffold` | Tạo hoặc apply guarded golden-path scaffold recipe. | `[layout\|file]`, `--dry-run`, `--yes`, `--preset <name>` | Approved layout/policy evidence nên thành safe empty structure/templates. |

### Workspace And Config

| Skill | Summary | Main modes/options | Dùng khi |
|-------|---------|--------------------|----------|
| `/tdk-config-diff` | Compare workspace và sub-workspace docs. | `--sub-workspace`, `--detailed` | Trước khi sync docs giữa workspace layers. |
| `/tdk-config-sync` | Synchronize docs giữa workspace và sub-workspaces. | `--from-sub-workspace`, `--to-sub-workspace`, `--all`, `--force`, `--dry-run` | Sau khi diff cho thấy docs nên được copy. |
| `/tdk-config-index` | Generate/update document manager index. | `--sub-workspace`, `--full` | Docs cần dễ discover hơn cho LLM tools. |
| `/tdk-sub-workspace-init` | Initialize sub-workspace config entry. | `[name]` | Monorepo/service boundary cần docs/rules context riêng. |
| `/tdk-sub-workspace-list` | List configured sub-workspaces. | no flags | Bạn cần inventory sub-workspace config. |
| `/tdk-sub-workspace-docs` | Generate arc42-lite docs cho một hoặc tất cả sub-workspaces. | `--sub-workspace NAME`, `--all`, `--force` | Sub-workspace docs cần README, architecture, interfaces, và engineering pages. |
| `/tdk-sub-workspace-automation-recommend` | Recommend skills/agents cho một sub-workspace. | `--sub-workspace <name>`, `--no-community-search` | Existing sub-workspace docs nên drive automation recommendations. |
| `/tdk-scaffold-from-recommendation` | Scaffold approved skill/agent recommendation stubs. | `[path]`, `--dry-run`, `--skills-only`, `--agents-only` | Reviewed automation recommendation được approve để scaffold. |

### Testing And API

| Skill | Summary | Main modes/options | Dùng khi |
|-------|---------|--------------------|----------|
| `/tdk-plan --tdd` / `--ut-backfill` | Fold test-first hoặc backfill planning vào `/tdk-plan` phases. | `<id>`, `--sub-workspace`, `--module`, `--standalone` (chỉ backfill) | Existing feature/code cần test-first hoặc routed unit-test phases như một phần của cùng plan. |
| `/tdk-test-api-plan` | Generate API test plan từ endpoints. | OpenAPI, scout, hoặc manual endpoint input | API coverage cần structured plan trước testcase generation. |
| `/tdk-test-api-generate-testcase` | Generate per-endpoint API testcase files và execution manifest. | reads API test plan | Test plan ready để thành concrete testcase files. |
| `/tdk-test-api-gen-code-playwright-ts` | Generate Playwright TypeScript API test code. | reads testcase files và execution manifest | Testcase files nên thành executable Playwright API tests. |

### Memory And Retro

| Skill | Summary | Main modes/options | Dùng khi |
|-------|---------|--------------------|----------|
| `/tdk-memory-init` | Initialize domain memory structure. | project/domain setup inputs | Project cần `.specify/memory/` scaffolding. |
| `/tdk-memory-update` | Add hoặc modify domain knowledge. | natural-language memory updates | Business rules, services, data models, flows, hoặc decisions thay đổi. |
| `/tdk-memory-query` | Query project memory bằng natural language. | query text | Planning/implementation cần memory context. |
| `/tdk-memory-changelog` | Record staged memory changes trong `CHANGELOG.md`. | staged `.specify/memory/` diff | Memory edits ready để document trước commit. |
| `/tdk-retro-collect` | Collect retrospective feedback sau TDK spec/session. | reviews, drift, UT results, traces, user feedback | Completed workflow nên feed learning loop. |
| `/tdk-retro-propose` | Propose technical hoặc memory learning deltas từ feedback. | `retro-feedback.md` | Feedback cần reviewable learning changes. |
| `/tdk-retro-apply` | Apply approved learning deltas. | approved `learning-delta.md` entries | Accepted retro learnings nên update skills/docs/memory. |

### Guide And Research Utilities

| Skill | Summary | Main modes/options | Dùng khi |
|-------|---------|--------------------|----------|
| `/tdk-skill-guide` | Interactive guide cho skills, commands, scenarios, search, và tips. | no args, `<skill-name>`, `scenario <N>`, `search <keyword>`, `tips <skill-name>` | Bạn cần help dùng TDK skill từ installed docs/source. |
| `/tdk-setup-guide` | Interactive setup guide và verifier. | no args, `check`, `verify`, `troubleshoot`, `<topic>` | Cần environment setup, prerequisite checks, hoặc troubleshooting. |
| `/tdk-scout` | Codebase navigation và two-tier source analysis. | task-specific scout input | Planning cần repo structure, relevant files, và code context. |
| `docs-seeker` | Route documentation queries tới Context7, GitHub, hoặc web fallbacks. | docs query text | Bạn cần current library/API docs khi làm việc trong TDK. |

### Detailed Mode Notes

#### `/tdk-plan`

| Mode | Effect |
|------|--------|
| default | Normal planning workflow từ `spec.md`, có research/design artifacts khi cần. |
| `--fast` | Minimal planning path cho work nhỏ rõ; skip research/review nặng hơn. |
| `--hard` | Planning nghiêm ngặt hơn với expanded research và review. |
| `--red-team` | Review existing plan theo adversarial focus. Freeform content trở thành review focus. |
| `--validate` | Interview/validate existing plan. Freeform content trở thành validation focus. |

Outputs: `plan.md`, phase details, optional `research/`, `data-model.md`, và `contracts/`.

#### `/tdk-specify`

| Mode | Effect |
|------|--------|
| default | Create hoặc update `spec.md` từ feature description và context có sẵn. |
| `--fast` | Token-efficient specification cho work rõ. |
| `--interview` | Recheck existing hoặc newly generated spec qua targeted questions. |

Outputs: `spec.md` và `checklists/requirements.md`.

#### Architecture Inception

Dùng `greenfield-start` hoặc `brownfield-start` trước khi project shape chưa chắc chắn. Dùng `architecture-advisor` cho options/decision/recovery dạng report-only. Dùng `workspace-layout-propose` cho proposal-only layout artifacts. Chỉ dùng `workflow-config-apply` sau khi layout evidence đã ready cho guarded config review/apply.

#### Memory And Retro

Memory skills maintain durable domain knowledge. Retro skills collect những gì đã xảy ra, propose changes, và chỉ apply approved deltas. Giữ hai nhóm này tách biệt: retrospectives propose; memory updates lưu accepted domain knowledge.

#### API Test Generation

API test work là chain ba bước:

```text
/tdk-test-api-plan -> /tdk-test-api-generate-testcase -> /tdk-test-api-gen-code-playwright-ts
```

Dùng unit-test backfill riêng khi mục tiêu là project/module unit testing thay vì API testcase/code generation.

### Internal Helpers Not Listed As User Commands

Các helper này tồn tại trong source nhưng không được catalog như direct user commands: `_shared`, `tdk-memory-checksum`, `tdk-load-project-context`, `tdk-validate-task-id`, `brainstorming`, `common`, `context-engineering`, `obsidian-brain`, `problem-solving`, `repomix`, `research`, và các helper `user-invocable: false` khác.

---

## Bảng Tra Nhanh

| # | Command | Description |
|---|---------|-------------|
| 0 | `/tdk-discovery <epic-id> [<brief\|file>] [--force] [--interview]` | Optional epic discovery context trước `tdk-epic-prd`; ID-only `--interview` recheck existing discovery artifacts |
| 0a | `/tdk-epic-prd <epic-id> [--force] [--interview]` | Optional epic product alignment, slice map, và blocking-question gate sau discovery; ID-only `--interview` recheck existing PRD artifacts |
| 1 | `/tdk-specify <id> [<desc>] [--interview]` | Tạo child hoặc feature spec, hoặc run ID-only `--interview` trên existing `spec.md` |
| 2 | `/tdk-specify <id> <desc> --fast [--interview]` | Quick specification, skip brainstorm, ít token hơn; `--fast --interview` hợp lệ |
| 3 | `/tdk-clarify <id>` | Hỏi tối đa 5 targeted questions để fill spec gaps |
| 4 | `/tdk-epic-hld <epic-id> [--force]` | Generate parent epic high-level design artifacts từ epic PRD |
| 5 | `/tdk-task-breakdown <epic-id> [--force]` | Generate child spec seed Markdown từ epic PRD + HLD |
| 7 | `/tdk-plan <id> [content] [flags]` | Generate implementation plan với design artifacts |
| 10 | `/tdk-analyze <id>` | Cross-artifact consistency và quality analysis |
| 11 | `/tdk-status <id>` | Hiển thị workflow progress, read-only, bất cứ lúc nào |
| 12 | `/tdk-checklist <id> [focus]` | Generate quality checklist cho requirements |
| 13 | `/tdk-constitution [--init <brief\|file>]` | Create/update project architecture principles và initialize project memory artifacts |
| 14 | `/tdk-greenfield-start [brief\|file] [--full\|--quick\|--unknown]` | New-project intake và routing report |
| 15 | `/tdk-brownfield-start [repo-root] [--full\|--config-only\|--unknown]` | Existing-repo onboarding và safe setup recommendations |
| 16 | `/tdk-architecture-advisor [input\|file] [--recover-existing\|--unknown]` | Project architecture options, decision, hoặc recovery reports |
| 17 | `/tdk-workspace-layout-propose [input\|file] [--from-existing\|--unknown]` | Workspace layout proposal markdown và JSON |
| 17c | `/tdk-boundary-map [input\|file] [--from-existing\|--unknown]` | Deprecated compatibility route cho workspace layout proposal |
| 18 | `/tdk-workspace-dependency-policy [layout\|file] [--audit\|--suggest]` | Optional workspace dependency policy report và non-applied enforcement snippets |
| 18c | `/tdk-module-boundary-policy [topology\|file] [--audit\|--suggest]` | Deprecated compatibility route cho workspace dependency policy |
| 19 | `/tdk-golden-path-scaffold [layout\|file] [--dry-run\|--yes] [--preset <name>]` | Guarded golden-path scaffold plan và recipe |
| — | **Unit Testing** | |
| 20 | `/tdk-plan <id> --tdd` \| `/tdk-plan <id> --ut-backfill` | Fold TDD hoặc unit-test backfill planning vào `/tdk-plan` phases |
| — | **Config & Workspace** | |
| 21 | `/tdk-config-diff` | Compare workspace vs sub-workspace docs |
| 22 | `/tdk-config-sync` | Sync docs giữa workspace và sub-workspaces |
| 23 | `/tdk-config-index` | Generate/update document manager index |
| 24 | `/tdk-workflow-config-apply [(no flags)\|--dry-run\|--reconcile\|--yes --expect-hash <hash>] [--topology <path>]` | Interactive runtime config review/apply từ workspace layout proposal |
| 25 | `/tdk-sub-workspace-init` | Initialize sub-workspace mới |
| 26 | `/tdk-sub-workspace-list` | List tất cả configured sub-workspaces |
| 27 | `/tdk-sub-workspace-docs [--sub-workspace NAME\|--all] [--force]` | Generate arc42-lite docs dưới `<docsPath>/sub-workspaces/<name>/` |
| 28 | `/tdk-sub-workspace-automation-recommend --sub-workspace <name> [--no-community-search]` | Recommend skills/agents cho một selected sub-workspace |
| 29 | `/tdk-scaffold-from-recommendation [path] [--dry-run] [--skills-only] [--agents-only]` | Scaffold reviewed skills/agents từ approved recommendation |
| — | **Primary Implementation** | |
| 33 | `/tdk-implement <id> [--phase NN]` | Execute implementation trực tiếp từ `plan.md ## Phases` |

---

## Bắt Đầu Nhanh

Dùng file này để tra cứu command. Nếu cần workflow từng bước để chạy thật, bắt đầu bằng scenario khớp với tình huống của bạn:

| Tình huống | Bắt đầu với |
|---|---|
| Setup hoặc command installation chưa xong | [Setup Guide](setup/setup-guide.md) |
| Epic rộng, ý tưởng mơ hồ, hoặc work cần child spec seeds | [Epic Start Guide](scenarios/00-epic-start-guide.md) |
| Một child seed rõ hoặc một feature nhỏ cần implement | [Child Feature Implementation](scenarios/01-child-feature-implementation.md) |
| Feature nhỏ đã hiểu rõ và có thể skip brainstorm | [Quick Specification](scenarios/02-quick-specification.md) |
| Cần status snapshot hoặc progress check | [Progress Tracking](scenarios/04-progress-tracking.md) |
| Project mới cần architecture và layout guidance | [Greenfield Full Start, Architecture, Topology](scenarios/10-greenfield-full-start-architecture-topology.md) |

Để xem đầy đủ danh sách scenario, dùng [Scenario Catalog](scenarios/scenario-catalog.md). Để xem quan hệ input/output giữa files, dùng [Workflow Map](workflow-map.md). Giữ guide này để tra cứu command syntax, flags, modes, inputs, và outputs.

---

## Tham Chiếu Sử Dụng

### Core Commands

| Command | Syntax | Key Flags | Input | Output | Depends On |
|---------|--------|-----------|-------|--------|------------|
| discovery | `/tdk-discovery <epic-id> [<brief\|file>] [--force] [--interview]` | `--force`, `--interview` | Project context, constitution/memory, brief hoặc file; existing discovery files cho ID-only `--interview` | `discovery/problem.md`, `discovery/personas.md`, `discovery/mvp-scope.md`, `discovery.md` | Optional sau constitution, trước epic-prd |
| epic-prd | `/tdk-epic-prd <epic-id> [--force] [--interview]` | `--force`, `--interview` | Existing `discovery.md`, `problem.md`, `personas.md`, `mvp-scope.md`; existing PRD files cho ID-only `--interview` | `epic-prd.md`, `epic-prd/prd.md`, `epic-prd/slice-map.md`, `epic-prd/open-questions.md` | discovery |
| specify | `/tdk-specify <id> [<desc>] [--interview]` | `--interview` | `.specify.env`; explicit feature description hoặc `tasks-breakdown` seed; existing `spec.md` cho ID-only `--interview` | `spec.md`, `checklists/requirements.md` | None, hoặc child seed từ task breakdown |
| specify (fast) | `/tdk-specify <id> <desc> --fast [--interview]` | `--fast`, `--interview` | `.specify.env` | `spec.md`, `checklists/requirements.md` | None |
| clarify | `/tdk-clarify <id>` | — | `spec.md` | `spec.md` updated | specify |
| high-level-design | `/tdk-epic-hld <epic-id>` | `--force` | `epic-prd.md`, `prd.md`, `slice-map.md`, `open-questions.md`; optional HLD routing | `high-level-design.md` + 5 design artifacts | epic-prd |
| task-breakdown | `/tdk-task-breakdown <epic-id>` | `--force` | `epic-prd.md` + `epic-prd/`; `high-level-design.md` + `high-level-design/` | `tasks-breakdown.md`, `tasks-breakdown/task-NNN-*.md` child spec seed files | high-level-design |
| plan | `/tdk-plan <id> [content] [flags]` | `--fast`, `--hard`, `--red-team`, `--validate` | `spec.md` cộng clarified requirements và optional context | `plan.md` với ## Phases table, `research/`, `data-model.md`, `contracts/` | clarify |
| implement | `/tdk-implement <id> [--phase NN]` | `--phase NN` | `plan.md` | Source code, `plan.md` Status column | plan |
| analyze | `/tdk-analyze <id>` | — | `spec.md`, `plan.md ## Phases` | Report, không tạo file | plan |
| status | `/tdk-status <id>` | — | Feature directory | Progress report, không tạo file | specify |

`/tdk-plan` nhận freeform content sau `<id>` trong mọi mode. Default, `--fast`, và `--hard` xem content là planning instruction; `--red-team` xem là review focus; `--validate` xem là validation focus. Mode flags có thể đứng sau `<id>` trước hoặc sau content.

### Project Inception Commands

| Command | Syntax | Key Flags | Input | Output | Depends On |
|---------|--------|-----------|-------|--------|------------|
| greenfield:start | `/tdk-greenfield-start [brief\|file] [--full\|--quick\|--unknown]` | `--full`, `--quick`, `--unknown` | Project brief, optional README/docs | `.specify/configurations/inception/project-inception.md` với readiness, assumptions, unresolved questions, và recommendation confidence | None |
| brownfield:start | `/tdk-brownfield-start [repo-root] [--full\|--config-only\|--unknown]` | `--full`, `--config-only`, `--unknown` | Existing repo evidence, optional scout output | `.specify/configurations/inception/brownfield-onboarding.md` với observed evidence tách khỏi inferred recommendations | None |
| architecture:advisor | `/tdk-architecture-advisor [input\|file] [--recover-existing\|--unknown]` | `--recover-existing`, `--unknown` | Inception, onboarding, discovery, spec, scout, README, hoặc bounded repo evidence | `.specify/configurations/architecture/architecture-options.md`, `.specify/configurations/architecture/architecture-decision.md`, hoặc `.specify/configurations/architecture/architecture-recovery.md` | Optional sau start/scout/discovery |
| workspace-layout:propose | `/tdk-workspace-layout-propose [input\|file] [--from-existing\|--unknown]` | `--from-existing`, `--unknown` | Architecture reports, inception/onboarding evidence, scout, README, hoặc bounded repo evidence | `.specify/configurations/workspace-layout/workspace-layout-proposal.md`, `.specify/configurations/workspace-layout/workspace-layout-proposal.json` | Optional sau advisor/start/scout |
| boundary:map | `/tdk-boundary-map [input\|file] [--from-existing\|--unknown]` | `--from-existing`, `--unknown` | Compatibility route cho layout proposal | legacy `.specify/configurations/workspace-topology/workspace-topology.md`, legacy `.specify/configurations/workspace-topology/workspace-topology.json` | Compatibility only |
| workflow-config:apply | `/tdk-workflow-config-apply [(no flags)\|--dry-run\|--reconcile\|--yes --expect-hash <hash>] [--topology <path>]` | no flags, `--dry-run`, `--reconcile`, `--yes`, `--expect-hash`, `--accept-overwrites`, `--topology` | `workspace-layout-proposal.json`, legacy `workspace-topology.json`, existing JSON `.specify/.specify.json` | Interactive patch review/apply; explicit preview/apply cho automation | Optional sau layout proposal hoặc human-authored proposal |
| workspace-dependency:policy | `/tdk-workspace-dependency-policy [layout\|file] [--audit\|--suggest]` | `--audit`, `--suggest` | `workspace-layout-proposal.json`, `workspace-layout-proposal.md`, legacy topology artifacts, `.specify/.specify.json`, repo stack evidence | `workspace-dependency-policy.md`, optional `enforcement-snippets.md` | Optional sau layout review/apply |
| module-boundary:policy | `/tdk-module-boundary-policy [topology\|file] [--audit\|--suggest]` | `--audit`, `--suggest` | Compatibility route cho dependency policy | legacy `module-boundary-policy.md`, optional `enforcement-snippets.md` | Compatibility only |
| golden-path:scaffold | `/tdk-golden-path-scaffold [layout\|file] [--dry-run\|--yes] [--preset <name>]` | `--dry-run`, `--yes`, `--preset` | approved layout/config evidence, architecture decision/recovery, optional dependency policy | `golden-path-scaffold-plan.md`, `golden-path-recipe.json`, `generated-files-report.md` | Optional sau layout/policy review |
| sub-workspace:docs | `/tdk-sub-workspace-docs [--sub-workspace NAME\|--all] [--force]` | `--sub-workspace`, `--all`, `--force` | `.specify/.specify.json`, sub-workspace source, scout output, optional dependency policy | `README.md`, `architecture.md`, `interfaces.md`, `engineering.md` theo sub-workspace | Sau config apply |
| sub-workspace:automation-recommend | `/tdk-sub-workspace-automation-recommend --sub-workspace <name> [--no-community-search]` | `--sub-workspace`, `--no-community-search` | selected sub-workspace docs, dependency policy, official docs, local installed skill catalog, optional `npx skills find` hoặc skills.sh lookup | `automation-recommendation.md` | Sau sub-workspace docs |
| scaffold:from-recommendation | `/tdk-scaffold-from-recommendation [path] [--dry-run] [--skills-only] [--agents-only]` | `--dry-run`, `--skills-only`, `--agents-only` | approved `automation-recommendation.md` hoặc legacy recommendation file | Scaffolded skill/agent starter files | Sau recommendation approval |

Greenfield và brownfield start commands là report/routing entrypoints. Chúng không tạo specs, plans, tracker issues, source code, hoặc `.specify/.specify.json`. Greenfield full mode chạy project-inception interview trước strong routing. Quick mode ghi unanswered critical gaps. Unknown mode chỉ classify nếu chưa đủ minimum facts. Brownfield full mode dùng bounded repo evidence, config-only mode tập trung vào `.specify` state, và unknown mode recommend một evidence-backed next route.

`/tdk-architecture-advisor` là project-level và report-only. Standard mode ghi architecture options và decision artifact. Nếu evidence chưa đủ cho accepted decision, decision artifact dùng `Status: Deferred`. `--recover-existing` mặc định ghi `architecture-recovery.md` và chỉ ghi/update `architecture-decision.md` sau explicit user confirmation. `--unknown` ghi evidence gaps và recommend next safe route.

Syntax: `/tdk-architecture-advisor [input|file] [--recover-existing|--unknown]`.

`/tdk-workspace-layout-propose` là project-level và proposal-only. Standard mode ghi `workspace-layout-proposal.md` và `workspace-layout-proposal.json` từ architecture evidence. `--from-existing` giữ JSON giới hạn ở observed folders/packages by default và ghi desired-state deltas trong markdown. `--unknown` ghi readiness guidance và tránh overwrite JSON khi evidence chưa đủ.

Syntax: `/tdk-workspace-layout-propose [input|file] [--from-existing|--unknown]`.

Compatibility syntax: `/tdk-boundary-map [input|file] [--from-existing|--unknown]`.

`/tdk-workflow-config-apply` wrap TypeScript CLI guarded apply flow. Với normal human use, chạy không flag:

```text
/tdk-workflow-config-apply
```

Skill chạy dry-run, parse `planHash`, hiển thị diff/warnings/confirmation findings, hỏi có apply không, rồi gọi CLI với `--yes --expect-hash <planHash>` internally. Dùng `--reconcile` để review brownfield config drift mà không apply.

Automation vẫn có thể dùng explicit CLI-shaped sequence:

```bash
bun src/index.ts config topology apply --dry-run --topology .specify/configurations/workspace-layout/workspace-layout-proposal.json
bun src/index.ts config topology apply --topology .specify/configurations/workspace-layout/workspace-layout-proposal.json --yes --expect-hash "$PLAN_HASH"
```

Apply cần existing JSON `.specify/.specify.json` và apply-eligible proposal dưới `.specify/configurations/workspace-layout/` hoặc legacy topology dưới `.specify/configurations/workspace-topology/`. Same-name overwrites, architecture type changes, và normalized path collisions cần explicit approval trước khi pass `--accept-overwrites`. `--reconcile` vẫn report-only.

`/tdk-workspace-dependency-policy` là optional policy/report work sau layout review. Standard mode ghi `.specify/configurations/workspace-dependency-policy/workspace-dependency-policy.md`. `--audit` compare existing repo evidence với layout intent và chỉ ghi findings. `--suggest` ghi `.specify/configurations/workspace-dependency-policy/enforcement-snippets.md` với copy-after-review snippets cho detected stacks như Nx, Turborepo, ESLint, TypeScript ESLint, hoặc dependency-cruiser. Non-JS tools giữ manual/deferred trừ khi có matching repo evidence.

Syntax: `/tdk-workspace-dependency-policy [layout|file] [--audit|--suggest]`.

Compatibility syntax: `/tdk-module-boundary-policy [topology|file] [--audit|--suggest]`.

`/tdk-golden-path-scaffold` là guarded scaffold workflow sau layout review. Dry-run ghi `.specify/configurations/golden-path/golden-path-scaffold-plan.md`, `.specify/configurations/golden-path/golden-path-recipe.json`, và `.specify/configurations/golden-path/generated-files-report.md`. Apply mode cần `--yes` và `golden-path-recipe.json` với `status: approved`, rồi chỉ tạo allowlisted skeleton artifacts như empty directories, `.gitkeep`, `.specify` guidance docs, và explicitly templated config files.

Syntax: `/tdk-golden-path-scaffold [layout|file] [--dry-run|--yes] [--preset <name>]`.

`/tdk-sub-workspace-docs` generate arc42-lite docs set gồm bốn file cho một configured sub-workspace hoặc tất cả configured sub-workspaces: `README.md`, `architecture.md`, `interfaces.md`, và `engineering.md` dưới `<docsPath>/sub-workspaces/<name>/`. Nó update managed AUTO-GEN sections và không delete old generated docs.

Syntax: `/tdk-sub-workspace-docs [--sub-workspace NAME|--all] [--force]`.

`/tdk-sub-workspace-automation-recommend` recommend skills và agents cho một selected sub-workspace. Nó đọc selected sub-workspace docs, workspace dependency policy, official docs hoặc primary sources, local installed skill catalog, và optional direct community lookup qua `npx skills find` hoặc skills.sh. Nó không support `--all` và không dùng `ck:find-skills`.

Syntax: `/tdk-sub-workspace-automation-recommend --sub-workspace <name> [--no-community-search]`.

`/tdk-scaffold-from-recommendation` đọc approved recommendation và tạo starter skill/agent files. Nó ưu tiên `.specify/configurations/automation-recommendations/sub-workspaces/<name>/automation-recommendation.md` và giữ legacy recommendation file fallbacks.

Syntax: `/tdk-scaffold-from-recommendation [path] [--dry-run] [--skills-only] [--agents-only]`.

### UT Commands

| Command | Syntax | Key Flags | Input | Output | Depends On |
|---------|--------|-----------|-------|--------|------------|
| unit-test planning | `/tdk-plan <id> --tdd` \| `/tdk-plan <id> --ut-backfill` | `--sub-workspace`, `--module`, `--standalone` (chỉ backfill) | `spec.md` optional, consumer test skill routing | `plan.md`, `phases/phase-NN-*.md` với TDD hoặc backfill sections | plan |

### Config Commands

| Command | Syntax | Key Flags | Input | Output | Depends On |
|---------|--------|-----------|-------|--------|------------|
| config:diff | `/tdk-config-diff` | `--sub-workspace` required, `--detailed` | Workspace + sub-workspace docs | Diff table, không file | sub-workspace:init |
| config:sync | `/tdk-config-sync` | `--from-sub-workspace`, `--to-sub-workspace`, `--all`, `--force`, `--dry-run` | Docs paths | Synced files | sub-workspace:init |
| config:index | `/tdk-config-index` | `--sub-workspace`, `--full` | All docs files | `document-manager.md` | None |
| config topology apply | `bun src/index.ts config topology apply [--dry-run] [--reconcile] [--topology <path>] [--yes --expect-hash <hash>] [--accept-overwrites]` | `--dry-run`, `--reconcile`, `--topology`, `--yes`, `--expect-hash`, `--accept-overwrites` | `workspace-layout-proposal.json`, legacy `workspace-topology.json`, existing JSON `.specify/.specify.json` | JSON dry-run patch preview hoặc guarded config write | None |

> Harness install, convert, và convert-flat được quản lý bởi standalone setup CLI trong source checkout. Chúng không thuộc consumer-facing workflow CLI được document ở đây. Xem setup CLI README trong source checkout để biết usage.

### Sub-workspace Commands

| Command | Syntax | Key Flags | Input | Output | Depends On |
|---------|--------|-----------|-------|--------|------------|
| sub-workspace:init | `/tdk-sub-workspace-init [name]` | — | Project config | `.specify/.specify.json`, rules/docs path config | None |
| sub-workspace:list | `/tdk-sub-workspace-list` | — | `.specify/.specify.json` | Table display, không file | sub-workspace:init |

### Other Commands

| Command | Syntax | Key Flags | Input | Output | Depends On |
|---------|--------|-----------|-------|--------|------------|
| constitution | `/tdk-constitution [principles]` | `--init <brief\|file>` | `constitution.md`, templates | `constitution.md`, `product-context.md`, project docs | None, project-level |
| checklist | `/tdk-checklist <id> [focus]` | — | `spec.md`, `plan.md` optional | `checklists/{domain}.md` | specify |

### Primary Implementation Path

| Command | Syntax | Key Flags | Input | Output | Depends On |
|---------|--------|-----------|-------|--------|------------|
| implement | `/tdk-implement <id> [--phase NN]` | `--phase NN` | `plan.md` with ## Phases | Source code, `plan.md` Status column | plan |

`/tdk-implement` đọc `## Phases` table từ `plan.md` và execute tất cả runnable phases by default, mark progress trong Status column. Dùng `/tdk-implement <id> --phase NN` để execute một numeric phase; selected mode không auto-run dependencies. Phù hợp nhất với small/medium features có thể complete trong một session.

**Re-running `/tdk-plan` after implementation:**

- **(a) Update phases only** — Khi feature scope mở rộng hoặc phases đổi: re-run `/tdk-plan <id>`; command overwrite `plan.md`, bạn mất current Status-column progress.
- **(b) Append new phases** — Khi thêm follow-up work: manually add rows vào existing `## Phases` table trong `plan.md`, rồi resume với `/tdk-implement <id> [--phase NN]`.

## Workflow Map

Xem [workflow-map.md](workflow-map.md) để có full Mermaid flow diagrams mô tả quan hệ input/output giữa commands và files.

**Summary flow, Primary Path:**

```text
req → /specify → spec.md → /clarify → spec.md (clarified)
  → /plan → plan.md (with ## Phases table), research/, data-model.md, contracts/, wireframes/
  → /implement → source code
```

---

## Các Tình Huống Sử Dụng

Walkthrough chi tiết nằm trong [Scenario Catalog](scenarios/scenario-catalog.md). File này cố ý chỉ giữ nội dung command reference để scenario pages là source of truth cho workflow từng bước.

---

## Gợi Ý Và Best Practices

### Hiệu Quả Workflow

- **Dùng `/tdk-specify --fast`** cho feature nhỏ, đã hiểu rõ. Default mode có brainstorm exploration cho unclear scope. Auto-detect chọn mode dựa trên description complexity.
- **Thêm `--interview`** khi hidden assumptions sẽ tốn kém nếu sai. Command hỏi artifact-grounded alignment questions và chỉ ghi accepted artifact changes hoặc unresolved questions.
- **Dùng ID-only `--interview`** chỉ cho existing artifacts: `/tdk-discovery <id> --interview` cần bốn discovery files, `/tdk-epic-prd <id> --interview` cần bốn epic PRD files, và `/tdk-specify <id> --interview` cần `spec.md`.
- **Luôn chạy `clarify`** trước `plan` — nó bắt ambiguities sớm, giảm rework trong implementation.
- **Chạy `analyze` trước `implement`** — nó bắt spec-plan-tasks inconsistencies có thể tạo bug.
- **Dùng `status` thoải mái** — nó read-only và hiển thị phần đã xong vs. còn lại.

### Các Flag Thường Gặp

| Flag | Used by | Purpose |
|------|---------|---------|
| `--sub-workspace <name>` | `/tdk-plan --ut-backfill`, config commands | Target sub-workspace cụ thể, ví dụ `frontend`, `backend` |
| `--force` | `/tdk-config-sync` | Overwrite existing artifacts không cần confirmation |
| `--dry-run` | config:sync, workflow-config:apply | Preview changes mà không ghi files; workflow config apply emit `planHash` cho automation/debug |
| `--standalone` | `/tdk-plan --ut-backfill` | Generate UT phases cho existing code không có spec |
| `--tdd` / `--ut-backfill` | `/tdk-plan` | Chọn test-first hoặc backfill sections cho generated phases |

### Khi Nào Skip Optional Commands

| Command | Skip khi... |
|---------|-------------|
| `discovery` | Work đã feature-sized hoặc problem/personas/MVP boundary đã rõ |
| `epic-prd` | Work feature-sized, hoặc discovery không cần product alignment và child spec slicing |
| `clarify` | Spec đã detailed và unambiguous |
| `checklist` | Feature không có quality dimensions phức tạp như UX, security, API |
| `analyze` | Small feature với simple spec/plan/tasks chain |
| `constitution` | Project principles đã established và stable |

---

## Khắc Phục Sự Cố

| Error | Cause | Resolution |
|-------|-------|------------|
| "spec.md not found" | Chạy `plan` hoặc implementation trước `specify` | Run `/tdk-specify <id> <description>` trước |
| "plan.md not found" | Chạy implementation trước `plan` | Run `/tdk-plan <id>` trước |
| "Invalid prefix" | Task ID prefix không nằm trong allowed list | Check `ERCSPEC_PREFIX_LIST` trong `.specify/.specify.env` |
| "Task ID already exists" | `spec.md` hoặc existing guarded artifact đã tồn tại | Work trên existing feature hoặc dùng ID khác. Directory có `discovery.md` nhưng không có `spec.md` là parent epic directory; tiếp tục với `/tdk-epic-prd <id>` |
| "Discovery already exists" | `discovery.md` đã tồn tại | Re-run `/tdk-discovery ... --force` chỉ khi cố ý replace discovery context |
| "Discovery replay interview requires existing discovery artifacts" | Chạy `/tdk-discovery <id> --interview` trước khi đủ bốn discovery files | Create discovery trước bằng `/tdk-discovery <id> <brief\|file> --interview` |
| "Epic PRD requires existing discovery artifacts" | Chạy `/tdk-epic-prd <id>` trước khi bốn discovery files tồn tại | Create discovery trước bằng `/tdk-discovery <id> <brief\|file>` |
| "Epic PRD already exists" | `epic-prd.md` đã tồn tại | Re-run `/tdk-epic-prd ... --force` chỉ khi replace PRD artifacts, hoặc dùng `--interview` để replay alignment |
| "Spec replay interview requires existing `spec.md`" | Chạy `/tdk-specify <id> --interview` trước spec creation | Create spec trước bằng `/tdk-specify <id> <description> --interview` |
| "Did you mean `--interview`?" | Dùng positional `interview` như mode | Thay `interview` bằng flag `--interview` |
| "No UT skill found" | Chạy UT commands khi chưa có consumer UT skill | Tạo skill trong `.claude/skills/{name}/SKILL.md` với UT conventions |
| Script execution fails | Windows không có Git Bash | Cài Git for Windows, có Git Bash |
| "Feature not found" | Sai task ID hoặc folder | Check `.specify/specs/` để xem existing features; verify prefix trong `.specify.env` |
| Checklist gate blocks implement | Checklist items chưa complete | Complete checklist items hoặc confirm proceed khi được hỏi |

### Thứ Tự Command Nhanh

Nếu một command báo thiếu prerequisite, dùng [Workflow Map](workflow-map.md) để xem file inputs/outputs và dùng [Scenario Catalog](scenarios/scenario-catalog.md) để chọn đúng runnable workflow. Short path cho feature-sized work là:

```text
specify [--fast] -> clarify -> plan -> implement -> status
```

Với broad epic, bắt đầu bằng [Epic Start Guide](scenarios/00-epic-start-guide.md) thay vì plan parent epic trực tiếp.

---

*¹ Thuật ngữ "skill" đến từ kiến trúc nội bộ của Claude Code, nơi commands được define bằng skill files. Trong thực tế, "command" và "skill" có thể dùng thay thế nhau khi nói về các item `/tdk-*`.*
