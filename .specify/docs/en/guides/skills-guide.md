# TDK Skills Guide

> **Last updated**: 2026-07-18
>
> **Source baseline**: TDK `60977e8 v1.103.1`
>
> **Where to run**: All `/tdk-*` commands are typed in the **Claude Code chat interface** (VSCode extension or Claude CLI prompt), NOT in a terminal or bash shell.

---

## Table of Contents

- [Why TDK?](#why-tdk)
- [Overview](#overview)
- [Skill Directory](#skill-directory)
- [Cheat Sheet](#cheat-sheet)
- [Quick Start](#quick-start)
- [Usage Reference](#usage-reference)
- [Workflow Map](#workflow-map)
- [Use Case Scenarios](#use-case-scenarios)
- [Tips & Best Practices](#tips--best-practices)
- [Troubleshooting](#troubleshooting)

---

## Why TDK?

TDK is a specification-driven development framework that generates specs, optional portable task breakdowns, plans, and code from natural language. You describe a feature; TDK guides you through the full artifact chain — from requirements to production-ready implementation.

TDK is the Claude Code native generation of this framework.

## Overview

The TDK command suite provides a **specification-driven development** workflow. You describe a feature in natural language, optionally capture epic discovery and PRD context first, and the commands guide you through specification, optional design and task breakdown, planning, and implementation.

### Workflow Pipeline

![TDK lifecycle workflow](../../assets/lifecycle-share-graph.png)

```
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
                      │quality   │   │spec.md gaps  │   │routed test   │       │status/analyze│
                      │gate in spec│  │resolved      │   │skill         │       │any time      │
                      └──────────┘   └──────────────┘   └──────────────┘       └──────────────┘

  PROJECT-LEVEL (no task ID needed):
  ┌──────────────┐    ┌─────────────────────┐    ┌──────────────────────────┐
  │ constitution │    │ sub-workspace:init  │    │ config:diff/sync/index   │
  └──────────────┘    │ sub-workspace:list  │    └──────────────────────────┘
                      └─────────────────────┘
```

**Minimal feature flow**: `specify` -> `clarify` -> `plan` -> `implement`

**Epic flow**: `constitution` (project-level) -> optional `discovery` -> `epic-prd` -> `epic-hld` -> `task-breakdown` -> child `specify` -> child `clarify` -> child `plan` -> child `implement`

For selective harness installs, make sure the workflow commands you plan to use
are included: feature commands for minimal specs, parent epic commands for
discovery/PRD/HLD/breakdown, or both when following the full epic-to-child flow.
If a `/tdk-` command is unavailable, rerun the harness installer with the needed
workflow commands enabled.

For feature-sized work, skip discovery, epic PRD, HLD, and task breakdown by default. If the feature is small and clear, the current spec continues directly to `plan` and `implement`. For broad epics, `epic-prd.md` plus `epic-prd/` turns discovery into product alignment and slice map, `/tdk-epic-hld` adds parent design context, and `/tdk-task-breakdown` creates child spec seeds. Each seed then starts a child `/tdk-specify` loop.

Each command reads the output of the previous one. For minimal feature work, the chain is `spec.md` -> `plan.md` (with `## Phases`) -> source code. For epic-sized work, optional `discovery.md` plus `discovery/` feeds `epic-prd.md` plus `epic-prd/`; epic PRD feeds parent HLD; parent HLD feeds task breakdown; task breakdown seeds child specs. Child specs do not run HLD by default.

`/tdk-epic-hld` always uses built-in design lenses and may optionally read `{docs.path}/custom-workflow/high-level-design-skill-routing.md` for advisory consumer design skills. This HLD routing file is separate from `plan-skill-routing.md`, which remains implementation/test routing for planning and UT workflows.

### Plugin Ownership And Coupled Base

Plugin ownership defines source/generated packaging and maintenance; it does not
rename `/tdk-*` commands or change their artifact paths.

| Plugin | Ownership |
|---|---|
| `tdk-core` | Child feature delivery (`specify`, `clarify`, `plan`, `implement`, analysis/status) plus the shared hook/runtime gateway |
| `tdk-inception` | Project/workspace foundation: greenfield/brownfield intake, constitution, architecture, layout/config, dependency policy, and sub-workspace docs |
| `tdk-epic` | Parent epic discovery, PRD, HLD, and task breakdown |
| `tdk-utils` | Generic scout, research, docs lookup, context, brainstorm, and problem-solving utilities |
| `tdk-memory` | Domain memory commands and memory agent |
| `tdk-test-api` | API test planning, testcase generation, and Playwright TypeScript generation |
| `tdk-retro` | Retrospective collection, learning proposals, and approved learning application |
| `tdk-scaffold` | Automation recommendations, skill/agent scaffolding, routing, and guarded recipes |

Every harness install resolves the coupled base `tdk-core`, `tdk-inception`,
`tdk-memory`, and `tdk-utils`. Optional plugin selection adds workflows to that
base; it does not create a runtime-independent core-only or inception-only
install. See the [Setup Guide](setup/setup-guide.md) for selectors and clean
reinstall guidance.

---

## Skill Directory

This section is the contact-card directory for user-facing TDK skills. Use it when you need a quick summary of what a skill does, which modes/options it has, and when to use it. Use [Cheat Sheet](#cheat-sheet) for compact command syntax and [Usage Reference](#usage-reference) for workflow inputs, outputs, and dependencies.

### Visibility Rules

Included:

- `tdk-*` skills unless the skill frontmatter says `user-invocable: false`
- verified compatibility routes that still have a current `SKILL.md`
- support guides that users call directly, such as `tdk-skill-guide` and `tdk-setup-guide`

Excluded:

- `_shared` folders
- `user-invocable: false` helper skills
- generic helper skills that are internal implementation details

### Core Workflow

| Skill | Summary | Main modes/options | Use when |
|-------|---------|--------------------|----------|
| `/tdk-discovery` | Create optional epic context before product alignment. | `<epic-id> [brief|file]`, `--force`, `--interview` | The work is broad enough that problem, persona, and MVP context should exist before epic PRD. |
| `/tdk-epic-prd` | Turn discovery into epic PRD, slice map, and blocking questions. | `<epic-id>`, `--force`, `--interview` | Discovery exists and you need product alignment before decomposition. |
| `/tdk-specify` | Create or interview a feature/child `spec.md`. | `<id> [desc]`, `--fast`, `--interview` | You are ready to write the requirement authority for one feature or child slice. |
| `/tdk-clarify` | Ask targeted questions and write answers back into `spec.md`. | `<id>` | `spec.md` has gaps that should be resolved before planning. |
| `/tdk-epic-hld` | Create parent epic high-level design context. | `<epic-id>`, `--force` | Epic PRD exists and needs design lenses before child breakdown. |
| `/tdk-task-breakdown` | Generate child spec seed Markdown from epic PRD plus HLD. | `<epic-id>`, `--force` | An epic needs independently specifiable child slices. |
| `/tdk-plan` | Generate implementation plan and conditional supporting artifacts. | `<id> [content]`, `--fast`, `--hard`, `--tdd`, `--ut-backfill`, `--red-team`, `--validate`, `--migrate-artifacts` | `spec.md` is ready to become implementation phases; use migration only for an existing legacy feature folder. |
| `/tdk-implement` | Execute runnable rows from `plan.md ## Phases`. | `<id>`, `--phase NN` | A plan exists and one or more implementation phases are ready. |
| `/tdk-analyze` | Cross-artifact consistency and quality analysis. | `<id>` | You need read-only verification across spec, plan, and phases. |
| `/tdk-status` | Show workflow progress. | `<id>` | You need a read-only status snapshot. |

### Project And Architecture

| Skill | Summary | Main modes/options | Use when |
|-------|---------|--------------------|----------|
| `/tdk-constitution` | Manage constitution authority, Arc42 summaries, and Typed Memory v3 routes. | `/tdk-constitution` (update), `/tdk-constitution --init <brief\|file>` | Project governance or binding durable facts need initialization/update. |
| `/tdk-greenfield-start` | New-project intake and safe route recommendation. | `[brief|file]`, `--full`, `--quick`, `--unknown` | Starting a new project and not sure which TDK path to run first. |
| `/tdk-brownfield-start` | Observe-first onboarding for an existing repository. | `[repo-root]`, `--full`, `--config-only`, `--unknown` | Onboarding an existing repo without mutating layout/config too early. |
| `/tdk-architecture-advisor` | Write project-level architecture options, decision, or recovery report. | `[input|file]`, `--recover-existing`, `--unknown` | You need architecture guidance without changing runtime config or source code. |
| `/tdk-workspace-layout-propose` | Propose workspace layout markdown and JSON. | `[input|file]`, `--from-existing`, `--unknown` | Architecture evidence should become a reviewable layout proposal. |
| `/tdk-boundary-map` | Compatibility route for workspace layout proposal. | `[input|file]`, `--from-existing`, `--unknown` | Legacy users call the old boundary-map route. Prefer `/tdk-workspace-layout-propose`. |
| `/tdk-workflow-config-apply` | Review/apply `.specify/.specify.json` changes from layout evidence. | no flags, `--dry-run`, `--reconcile`, `--yes --expect-hash <hash>`, `--topology <path>` | A layout proposal is ready for guarded runtime config review/apply. |
| `/tdk-workspace-dependency-policy` | Write dependency policy report and optional enforcement snippets. | `[layout|file]`, `--audit`, `--suggest` | Approved layout evidence should become reviewable dependency guidance. |
| `/tdk-module-boundary-policy` | Compatibility route for dependency policy. | `[topology|file]`, `--audit`, `--suggest` | Legacy users call the old module-boundary route. Prefer `/tdk-workspace-dependency-policy`. |
| `/tdk-golden-path-scaffold` | Create or apply a guarded golden-path scaffold recipe. | `[layout|file]`, `--dry-run`, `--yes`, `--preset <name>` | Approved layout/policy evidence should become safe empty structure/templates. |

### Workspace And Config

| Skill | Summary | Main modes/options | Use when |
|-------|---------|--------------------|----------|
| `/tdk-config-diff` | Compare workspace and sub-workspace docs. | `--sub-workspace`, `--detailed` | Before syncing docs between workspace layers. |
| `/tdk-config-sync` | Synchronize docs between workspace and sub-workspaces. | `--from-sub-workspace`, `--to-sub-workspace`, `--all`, `--force`, `--dry-run` | After diff shows docs should be copied. |
| `/tdk-config-index` | Generate/update document manager index. | `--sub-workspace`, `--full` | Docs should be easier for LLM tools to discover. |
| `/tdk-sub-workspace-init` | Initialize a sub-workspace config entry. | `[name]` | A monorepo/service boundary needs its own docs/rules context. |
| `/tdk-sub-workspace-list` | List configured sub-workspaces. | no flags | You need inventory of sub-workspace config. |
| `/tdk-sub-workspace-docs` | Generate arc42-lite docs for one or all sub-workspaces. | `--sub-workspace NAME`, `--all`, `--force` | Sub-workspace docs need README, architecture, interfaces, and engineering pages. |
| `/tdk-sub-workspace-automation-recommend` | Recommend skills/agents for one sub-workspace. | `--sub-workspace <name>`, `--no-community-search` | Existing sub-workspace docs should drive automation recommendations. |
| `/tdk-scaffold-from-recommendation` | Scaffold approved skill/agent recommendation stubs. | `[path]`, `--dry-run`, `--skills-only`, `--agents-only` | A reviewed automation recommendation is approved for scaffolding. |
| `/tdk-plan-skill-routing` | Manage reviewable plan-skill-routing init, diff, register, verify, and cleanup. | `init`, `inspect`, `check`, `diff`, `register --yes`, `verify`, `optimize` | Scaffold routing suggestions or custom skill routes need explicit review and registration. |

### Testing And API

| Skill | Summary | Main modes/options | Use when |
|-------|---------|--------------------|----------|
| `/tdk-plan --tdd` / `--ut-backfill` | Fold test-first or backfill planning plus `Test Quality Gate` rows into `/tdk-plan` phases. | `<id>`, `--sub-workspace`, `--module`, `--standalone` (backfill only) | Existing feature/code needs test-first or routed unit-test phases as part of the same plan. |
| `/tdk-test-api-plan` | Generate API test plan from endpoints. | OpenAPI, scout, or manual endpoint input | API coverage needs a structured plan before testcase generation. |
| `/tdk-test-api-generate-testcase` | Generate per-endpoint API testcase files and execution manifest. | reads API test plan | Test plan is ready to become concrete testcase files. |
| `/tdk-test-api-gen-code-playwright-ts` | Generate Playwright TypeScript API test code. | reads testcase files and execution manifest | Testcase files should become executable Playwright API tests. |

### Memory And Retro

| Skill | Summary | Main modes/options | Use when |
|-------|---------|--------------------|----------|
| `/tdk-memory-init` | Initialize domain memory structure. | project/domain setup inputs | A project needs `.specify/memory/` scaffolding. |
| `/tdk-memory-update` | Add or modify domain knowledge. | natural-language memory updates | Business rules, services, data models, flows, or decisions changed. |
| `/tdk-memory-query` | Query project memory by natural language. | query text | Planning/implementation needs memory context. |
| `/tdk-memory-changelog` | Record staged memory changes in `CHANGELOG.md`. | staged `.specify/memory/` diff | Memory edits are ready to document before commit. |
| `/tdk-retro-collect` | Collect retrospective feedback after a TDK spec/session. | reviews, drift, UT results, traces, user feedback | A completed workflow should feed the learning loop. |
| `/tdk-retro-propose` | Propose technical or memory learning deltas from feedback. | `retro-feedback.md` | Feedback needs reviewable learning changes. |
| `/tdk-retro-apply` | Apply approved learning deltas. | approved `learning-delta.md` entries | Accepted retro learnings should update skills/docs/memory. |

### Guide And Research Utilities

| Skill | Summary | Main modes/options | Use when |
|-------|---------|--------------------|----------|
| `/tdk-skill-guide` | Interactive guide for skills, commands, scenarios, search, and tips. | no args, `<skill-name>`, `scenario <N>`, `search <keyword>`, `tips <skill-name>` | You need help using a TDK skill from installed docs/source. |
| `/tdk-setup-guide` | Interactive setup guide and verifier. | no args, `check`, `verify`, `troubleshoot`, `<topic>` | Environment setup, prerequisite checks, or troubleshooting is needed. |
| `/tdk-scout` | Codebase navigation and two-tier source analysis. | task-specific scout input | Planning needs repo structure, relevant files, and code context. |
| `docs-seeker` | Route documentation queries to Context7, GitHub, or web fallbacks. | docs query text | You need current library/API docs while working inside TDK. |

### Detailed Mode Notes

#### `/tdk-plan`

| Mode | Effect |
|------|--------|
| default | Normal planning workflow from `spec.md`, with research/design artifacts when needed. |
| `--fast` | Minimal planning path for small clear work; skips heavier research/review steps. Incompatible with `--tdd` and `--ut-backfill`. |
| `--hard` | More rigorous planning with expanded research and review. Composes with `--tdd` or `--ut-backfill`. |
| `--tdd` | Add tests-first sections (`Tests Before` / `Refactor` / `Tests After` / `Test Quality Gate` / `Regression Gate`) to implementation phases. |
| `--ut-backfill` | Generate backfill-focused phases (`Code Summary` / `Mocks & Fixtures Required` / `Test Matrix` / `Test Quality Gate`) for existing code. Accepts `--sub-workspace <name>`, `--module <name>` (requires `--sub-workspace`), and `--standalone`. |
| `--red-team` | Review an existing plan with adversarial focus. Recovery state stays in `.tdk-tmp`; one final timestamped report stays under `reports/`. |
| `--validate` | Interview/validate an existing plan. Freeform content becomes validation focus. |
| `--migrate-artifacts` | Dry-run legacy checklist/data-model/quickstart/prose-contract consolidation, then require confirmation before a backed-up transaction. |

Default outputs: existing `spec.md`, `plan.md`, and `phases/*.md`. Optional
`research/`, `reports/`, and machine-consumable `contracts/` exist only for a
declared consumer and are indexed in `plan.md`. Data models, prose contracts,
and runbooks live in their owner phases.

Executable experiments may use `phase_type: spike`; downstream phases remain
blocked until `/tdk-implement` records evidence and the result is approved or
the plan is revised.

Test-mode phases include `Test Quality Gate` rows. TDK owns baseline rubric,
traceability, and gate row completion; the routed consumer `test` skill owns
framework commands and numeric coverage policy.

Codex harness installs require generated Codex command artifacts. The default
distribution payload omits those generated artifacts, so use the existing setup
CLI `convert` / Codex install path instead of changing `distribute.json` for
test-mode planning.

#### `/tdk-specify`

| Mode | Effect |
|------|--------|
| default | Create or update `spec.md` from feature description and available context. |
| `--fast` | Token-efficient specification for clear work. |
| `--interview` | Recheck existing or newly generated spec through targeted questions. |

Output: `spec.md`, including `## Specification Quality Gate`. `/tdk-clarify`
reruns the same embedded gate after requirement changes.

#### Architecture Inception

Use `greenfield-start` or `brownfield-start` first when project shape is uncertain. Use `architecture-advisor` for report-only options/decision/recovery. Use `workspace-layout-propose` for proposal-only layout artifacts. Use `workflow-config-apply` only after layout evidence is ready for guarded config review/apply.

#### Memory And Retro

Memory skills maintain durable domain knowledge. Memory v3 uses `memory-index.md`
as the route/template source of truth and `memory.yaml` with it as the control
plane. `constitution.md` plus Typed Memory v3 routes under `decisions/`,
`risks-and-debt/`, `quality-requirements/`, `integrations/`, `operations/`, and
`glossary/` carry authoritative facts with `binding: true`. `arc42/` contains
`binding: false` summaries that link to typed binding facts. Retro skills
collect what happened, propose changes, and apply only approved deltas. Keep
these separate: retrospectives propose; memory updates store accepted domain
knowledge.

#### API Test Generation

API test work is a three-step chain:

```text
/tdk-test-api-plan -> /tdk-test-api-generate-testcase -> /tdk-test-api-gen-code-playwright-ts
```

Use unit-test backfill separately when the goal is project/module unit testing instead of API testcase/code generation.

### Internal Helpers Not Listed As User Commands

These exist in source but are not cataloged as direct user commands: `_shared`, `tdk-memory-checksum`, `tdk-load-project-context`, `tdk-validate-task-id`, `brainstorming`, `common`, `context-engineering`, `obsidian-brain`, `problem-solving`, `research`, and other `user-invocable: false` helpers.

---

## Cheat Sheet

| # | Command | Description |
|---|---------|-------------|
| 0 | `/tdk-discovery <epic-id> [<brief\|file>] [--force] [--interview]` | Optional epic discovery context before `tdk-epic-prd`; ID-only `--interview` rechecks existing discovery artifacts |
| 0a | `/tdk-epic-prd <epic-id> [--force] [--interview]` | Optional epic product alignment, slice map, and blocking-question gate after discovery; ID-only `--interview` rechecks existing PRD artifacts |
| 1 | `/tdk-specify <id> [<desc>] [--interview]` | Create a child or feature spec, or run ID-only `--interview` against existing `spec.md` |
| 2 | `/tdk-specify <id> <desc> --fast [--interview]` | Quick specification (skips brainstorm, fewer tokens); `--fast --interview` is valid |
| 3 | `/tdk-clarify <id>` | Ask up to 5 targeted questions to fill spec gaps |
| 4 | `/tdk-epic-hld <epic-id> [--force]` | Generate parent epic high-level design artifacts from epic PRD |
| 5 | `/tdk-task-breakdown <epic-id> [--force]` | Generate child spec seed Markdown from epic PRD + HLD |
| 7 | `/tdk-plan <id> [content] [flags]` | Generate implementation plan with design artifacts |
| 10 | `/tdk-analyze <id>` | Cross-artifact consistency and quality analysis |
| 11 | `/tdk-status <id>` | Show workflow progress (read-only, any time) |
| 13 | `/tdk-constitution` (update) or `/tdk-constitution --init <brief\|file>` | Update project authority or initialize constitution and Memory v3 artifacts |
| 14 | `/tdk-greenfield-start [brief\|file] [--full\|--quick\|--unknown]` | New-project intake and routing report |
| 15 | `/tdk-brownfield-start [repo-root] [--full\|--config-only\|--unknown]` | Existing-repo onboarding and safe setup recommendations |
| 16 | `/tdk-architecture-advisor [input\|file] [--recover-existing\|--unknown]` | Project architecture options, decision, or recovery reports |
| 17 | `/tdk-workspace-layout-propose [input\|file] [--from-existing\|--unknown]` | Workspace layout proposal markdown and JSON |
| 17c | `/tdk-boundary-map [input\|file] [--from-existing\|--unknown]` | Deprecated compatibility route for workspace layout proposal |
| 18 | `/tdk-workspace-dependency-policy [layout\|file] [--audit\|--suggest]` | Optional workspace dependency policy report and non-applied enforcement snippets |
| 18c | `/tdk-module-boundary-policy [topology\|file] [--audit\|--suggest]` | Deprecated compatibility route for workspace dependency policy |
| 19 | `/tdk-golden-path-scaffold [layout\|file] [--dry-run\|--yes] [--preset <name>]` | Guarded golden-path scaffold plan and recipe |
| — | **Unit Testing** | |
| 20 | `/tdk-plan <id> --tdd` \| `/tdk-plan <id> --ut-backfill` | Fold TDD or unit-test backfill planning into `/tdk-plan` phases |
| — | **Config & Workspace** | |
| 21 | `/tdk-config-diff` | Compare workspace vs sub-workspace docs |
| 22 | `/tdk-config-sync` | Sync docs between workspace and sub-workspaces |
| 23 | `/tdk-config-index` | Generate/update document manager index |
| 24 | `/tdk-workflow-config-apply [(no flags)\|--dry-run\|--reconcile\|--yes --expect-hash <hash>] [--topology <path>]` | Interactive runtime config review/apply from workspace layout proposal |
| 25 | `/tdk-sub-workspace-init` | Initialize a new sub-workspace |
| 26 | `/tdk-sub-workspace-list` | List all configured sub-workspaces |
| 27 | `/tdk-sub-workspace-docs [--sub-workspace NAME\|--all] [--force]` | Generate arc42-lite docs under `<docsPath>/sub-workspaces/<name>/` |
| 28 | `/tdk-sub-workspace-automation-recommend --sub-workspace <name> [--no-community-search]` | Recommend skills/agents for one selected sub-workspace |
| 29 | `/tdk-scaffold-from-recommendation [path] [--dry-run] [--skills-only] [--agents-only]` | Scaffold reviewed skills/agents from an approved recommendation |
| 30 | `/tdk-plan-skill-routing <init\|inspect\|check\|diff\|register\|verify\|optimize> [--proposal <path>] [--yes]` | Review and register plan-skill-routing proposals explicitly |
| — | **Primary Implementation** | |
| 33 | `/tdk-implement <id> [--phase NN]` | Execute implementation directly from plan.md ## Phases (recommended) |

---

## Quick Start

Use this file for command lookup. For runnable step-by-step workflows, start with the scenario that matches your situation:

| Situation | Start with |
|---|---|
| Setup or command installation is not complete | [Setup Guide](setup/setup-guide.md) |
| Broad epic, vague idea, or work that needs child spec seeds | [Epic Start Guide](scenarios/00-epic-start-guide.md) |
| One clear child seed or one small feature to implement | [Child Feature Implementation](scenarios/01-child-feature-implementation.md) |
| Small well-understood feature where brainstorm can be skipped | [Quick Specification](scenarios/02-quick-specification.md) |
| You need a status snapshot or progress check | [Progress Tracking](scenarios/04-progress-tracking.md) |
| New project needs architecture and layout guidance | [Greenfield Full Start, Architecture, Topology](scenarios/10-greenfield-full-start-architecture-topology.md) |

For the full scenario list, use the [Scenario Catalog](scenarios/scenario-catalog.md). For file input/output relationships, use the [Workflow Map](workflow-map.md). Keep this guide open when you need command syntax, flags, modes, inputs, and outputs.

---

## Usage Reference

### Core Commands

| Command | Syntax | Key Flags | Input | Output | Depends On |
|---------|--------|-----------|-------|--------|------------|
| discovery | `/tdk-discovery <epic-id> [<brief\|file>] [--force] [--interview]` | `--force`, `--interview` | Project context, constitution/memory, brief or file; existing discovery files for ID-only `--interview` | `discovery/problem.md`, `discovery/personas.md`, `discovery/mvp-scope.md`, `discovery.md` | Optional after constitution, before epic-prd |
| epic-prd | `/tdk-epic-prd <epic-id> [--force] [--interview]` | `--force`, `--interview` | Existing `discovery.md`, `problem.md`, `personas.md`, `mvp-scope.md`; existing PRD files for ID-only `--interview` | `epic-prd.md`, `epic-prd/prd.md`, `epic-prd/slice-map.md`, `epic-prd/open-questions.md` | discovery |
| specify | `/tdk-specify <id> [<desc>] [--interview]` | `--interview` | `.specify.env`; explicit feature description or `tasks-breakdown` seed; existing `spec.md` for ID-only `--interview` | `spec.md` with embedded quality gate | None, or child seed from task breakdown |
| specify (fast) | `/tdk-specify <id> <desc> --fast [--interview]` | `--fast`, `--interview` | `.specify.env` | `spec.md` with embedded quality gate | None |
| clarify | `/tdk-clarify <id>` | — | `spec.md` | `spec.md` (updated) | specify |
| high-level-design | `/tdk-epic-hld <epic-id>` | `--force` | `epic-prd.md`, `prd.md`, `slice-map.md`, `open-questions.md`; optional HLD routing | `high-level-design.md` + 5 design artifacts | epic-prd |
| task-breakdown | `/tdk-task-breakdown <epic-id>` | `--force` | `epic-prd.md` + `epic-prd/`; `high-level-design.md` + `high-level-design/` | `tasks-breakdown.md`, `tasks-breakdown/task-NNN-*.md` child spec seed files | high-level-design |
| plan | `/tdk-plan <id> [content] [flags]` | `--fast`, `--hard`, `--tdd`, `--ut-backfill`, `--red-team`, `--validate`, `--migrate-artifacts` | `spec.md` plus clarified requirements and optional context | `plan.md`, `phases/*.md`; conditional indexed `research/`, `reports/`, machine `contracts/` | clarify |
| implement | `/tdk-implement <id> [--phase NN]` | `--phase NN` | `plan.md` | Source code, `plan.md` Status column | plan |
| analyze | `/tdk-analyze <id>` | — | `spec.md`, `plan.md ## Phases` | Report (no file created) | plan |
| status | `/tdk-status <id>` | — | Feature directory | Progress report (no file created) | specify |

`/tdk-plan` accepts freeform content after `<id>` in every mode. Default, `--fast`, and `--hard` treat content as planning instruction; `--red-team` treats it as review focus; `--validate` treats it as validation focus. Known mode flags can appear after `<id>` before or after the content. `--tdd` and `--ut-backfill` are independent test-mode flags: they select whether generated phases include tests-first or backfill sections with `Test Quality Gate` rows, and compose with the default or `--hard` speed mode (not `--fast`).

### Project Inception Commands

| Command | Syntax | Key Flags | Input | Output | Depends On |
|---------|--------|-----------|-------|--------|------------|
| greenfield:start | `/tdk-greenfield-start [brief\|file] [--full\|--quick\|--unknown]` | `--full`, `--quick`, `--unknown` | Project brief, optional README/docs | `.specify/configurations/inception/project-inception.md` with readiness, assumptions, unresolved questions, and recommendation confidence | None |
| brownfield:start | `/tdk-brownfield-start [repo-root] [--full\|--config-only\|--unknown]` | `--full`, `--config-only`, `--unknown` | Existing repo evidence, optional scout output | `.specify/configurations/inception/brownfield-onboarding.md` with observed evidence separated from inferred recommendations | None |
| architecture:advisor | `/tdk-architecture-advisor [input\|file] [--recover-existing\|--unknown]` | `--recover-existing`, `--unknown` | Inception, onboarding, discovery, spec, scout, README, or bounded repo evidence | `.specify/configurations/architecture/architecture-options.md`, `.specify/configurations/architecture/architecture-decision.md`, or `.specify/configurations/architecture/architecture-recovery.md` | Optional after start/scout/discovery |
| workspace-layout:propose | `/tdk-workspace-layout-propose [input\|file] [--from-existing\|--unknown]` | `--from-existing`, `--unknown` | Architecture reports, inception/onboarding evidence, scout, README, or bounded repo evidence | `.specify/configurations/workspace-layout/workspace-layout-proposal.md`, `.specify/configurations/workspace-layout/workspace-layout-proposal.json` | Optional after advisor/start/scout |
| boundary:map | `/tdk-boundary-map [input\|file] [--from-existing\|--unknown]` | `--from-existing`, `--unknown` | Compatibility route for layout proposal | legacy `.specify/configurations/workspace-topology/workspace-topology.md`, legacy `.specify/configurations/workspace-topology/workspace-topology.json` | Compatibility only |
| workflow-config:apply | `/tdk-workflow-config-apply [(no flags)\|--dry-run\|--reconcile\|--yes --expect-hash <hash>] [--topology <path>]` | no flags, `--dry-run`, `--reconcile`, `--yes`, `--expect-hash`, `--accept-overwrites`, `--topology` | `workspace-layout-proposal.json`, legacy `workspace-topology.json`, existing JSON `.specify/.specify.json` | Interactive patch review/apply; explicit preview/apply for automation | Optional after layout proposal or human-authored proposal |
| workspace-dependency:policy | `/tdk-workspace-dependency-policy [layout\|file] [--audit\|--suggest]` | `--audit`, `--suggest` | `workspace-layout-proposal.json`, `workspace-layout-proposal.md`, legacy topology artifacts, `.specify/.specify.json`, repo stack evidence | `workspace-dependency-policy.md`, optional `enforcement-snippets.md` | Optional after layout review/apply |
| module-boundary:policy | `/tdk-module-boundary-policy [topology\|file] [--audit\|--suggest]` | `--audit`, `--suggest` | Compatibility route for dependency policy | legacy `module-boundary-policy.md`, optional `enforcement-snippets.md` | Compatibility only |
| golden-path:scaffold | `/tdk-golden-path-scaffold [layout\|file] [--dry-run\|--yes] [--preset <name>]` | `--dry-run`, `--yes`, `--preset` | approved layout/config evidence, architecture decision/recovery, optional dependency policy | `golden-path-scaffold-plan.md`, `golden-path-recipe.json`, `generated-files-report.md` | Optional after layout/policy review |
| sub-workspace:docs | `/tdk-sub-workspace-docs [--sub-workspace NAME\|--all] [--force]` | `--sub-workspace`, `--all`, `--force` | `.specify/.specify.json`, sub-workspace source, scout output, optional dependency policy | `README.md`, `architecture.md`, `interfaces.md`, `engineering.md` per sub-workspace | After config apply |
| sub-workspace:automation-recommend | `/tdk-sub-workspace-automation-recommend --sub-workspace <name> [--no-community-search]` | `--sub-workspace`, `--no-community-search` | selected sub-workspace docs, dependency policy, official docs, local installed skill catalog, optional `npx skills find` or skills.sh lookup | `automation-recommendation.md` | After sub-workspace docs |
| scaffold:from-recommendation | `/tdk-scaffold-from-recommendation [path] [--dry-run] [--skills-only] [--agents-only]` | `--dry-run`, `--skills-only`, `--agents-only` | approved `automation-recommendation.md` or legacy recommendation file | Scaffolded skill/agent starter files | After recommendation approval |
| plan-skill:routing | `/tdk-plan-skill-routing <init\|inspect\|check\|diff\|register\|verify\|optimize> [--proposal <path>] [--yes]` | `--proposal`, `--yes` | `plan-skill-routing.md`, optional `plan-skill-routing-proposal.json` | JSON route inspection, diff, registration, verification, or optimization result | After scaffold routing proposal or custom routing opt-in |

Greenfield and brownfield start commands are report/routing entrypoints. They do not create specs, plans, tracker issues, source code, or `.specify/.specify.json`. Greenfield full mode runs a project-inception interview before strong routing. Quick mode records unanswered critical gaps. Unknown mode classifies only unless minimum facts are present. Brownfield full mode uses bounded repo evidence, config-only mode focuses on `.specify` state, and unknown mode recommends one evidence-backed next route.

`/tdk-architecture-advisor` is project-level and report-only. Standard mode
writes architecture options and a decision artifact. If evidence is insufficient
for an accepted decision, the decision artifact uses `Status: Deferred`.
`--recover-existing` writes `architecture-recovery.md` by default and writes or
updates `architecture-decision.md` only after explicit user confirmation.
`--unknown` records evidence gaps and recommends the next safe route.

Syntax: `/tdk-architecture-advisor [input|file] [--recover-existing|--unknown]`.

`/tdk-workspace-layout-propose` is project-level and proposal-only. Standard mode writes
`workspace-layout-proposal.md` and `workspace-layout-proposal.json` from architecture evidence.
`--from-existing` keeps JSON limited to observed folders/packages by default and
records desired-state deltas in markdown. `--unknown` writes readiness guidance
and avoids overwriting JSON when evidence is insufficient.

Syntax: `/tdk-workspace-layout-propose [input|file] [--from-existing|--unknown]`.

Compatibility syntax: `/tdk-boundary-map [input|file] [--from-existing|--unknown]`.

`/tdk-workflow-config-apply` wraps the TypeScript CLI guarded apply flow.
For normal human use, run it without flags:

```text
/tdk-workflow-config-apply
```

The skill runs dry-run, parses `planHash`, shows diff/warnings/confirmation
findings, asks whether to apply, then calls the CLI with
`--yes --expect-hash <planHash>` internally. Use `--reconcile` for brownfield
config drift review without applying.

Automation can still use the explicit CLI-shaped sequence:

```bash
bun src/index.ts config topology apply --dry-run --topology .specify/configurations/workspace-layout/workspace-layout-proposal.json
bun src/index.ts config topology apply --topology .specify/configurations/workspace-layout/workspace-layout-proposal.json --yes --expect-hash "$PLAN_HASH"
```

Apply requires an existing JSON `.specify/.specify.json` and an apply-eligible
proposal under `.specify/configurations/workspace-layout/` or legacy topology
under `.specify/configurations/workspace-topology/`. Same-name
overwrites, architecture type changes, and normalized path collisions require
explicit approval before `--accept-overwrites` is passed. `--reconcile` remains
report-only.

`/tdk-workspace-dependency-policy` is optional policy/report work after layout is
reviewed. Standard mode writes
`.specify/configurations/workspace-dependency-policy/workspace-dependency-policy.md`.
`--audit` compares existing repo evidence against layout intent and writes
findings only. `--suggest` writes
`.specify/configurations/workspace-dependency-policy/enforcement-snippets.md` with
copy-after-review snippets for detected stacks such as Nx, Turborepo, ESLint,
TypeScript ESLint, or dependency-cruiser. Non-JS tools stay manual/deferred
unless matching repo evidence exists.

Syntax: `/tdk-workspace-dependency-policy [layout|file] [--audit|--suggest]`.

Compatibility syntax: `/tdk-module-boundary-policy [topology|file] [--audit|--suggest]`.

`/tdk-golden-path-scaffold` is a guarded scaffold workflow after layout review.
Dry-run writes `.specify/configurations/golden-path/golden-path-scaffold-plan.md`,
`.specify/configurations/golden-path/golden-path-recipe.json`, and
`.specify/configurations/golden-path/generated-files-report.md`. Apply mode
requires `--yes` and `golden-path-recipe.json` with `status: approved`, then
creates only allowlisted skeleton artifacts such as empty directories,
`.gitkeep`, `.specify` guidance docs, and explicitly templated config files.

Syntax: `/tdk-golden-path-scaffold [layout|file] [--dry-run|--yes] [--preset <name>]`.

`/tdk-sub-workspace-docs` generates an arc42-lite four-file docs set
for one configured sub-workspace or all configured sub-workspaces:
`README.md`, `architecture.md`, `interfaces.md`, and `engineering.md` under
`<docsPath>/sub-workspaces/<name>/`. It updates managed AUTO-GEN sections and
does not delete old generated docs.

Syntax: `/tdk-sub-workspace-docs [--sub-workspace NAME|--all] [--force]`.

`/tdk-sub-workspace-automation-recommend` recommends skills and agents for one
selected sub-workspace. It reads the selected sub-workspace docs, workspace
dependency policy, official docs or primary sources, local installed skill
catalog, and optional direct community lookup through `npx skills find` or
skills.sh. It does not support `--all` and does not use `ck:find-skills`.

Syntax: `/tdk-sub-workspace-automation-recommend --sub-workspace <name> [--no-community-search]`.

`/tdk-scaffold-from-recommendation` reads an approved recommendation and creates
starter skill/agent files. It prefers
`.specify/configurations/automation-recommendations/sub-workspaces/<name>/automation-recommendation.md`
and keeps legacy recommendation file fallbacks.

Syntax: `/tdk-scaffold-from-recommendation [path] [--dry-run] [--skills-only] [--agents-only]`.

`/tdk-plan-skill-routing` manages the explicit route file used by planning and
UT workflows. Use it to initialize the route file, inspect/check current routes,
diff scaffolded `plan-skill-routing-proposal.json`, register approved entries
with `--yes`, verify proposals, or dry-run optimize repeated entries.

Syntax: `/tdk-plan-skill-routing <init|inspect|check|diff|register|verify|optimize> [--proposal <path>] [--yes]`.

### UT Commands

| Command | Syntax | Key Flags | Input | Output | Depends On |
|---------|--------|-----------|-------|--------|------------|
| unit-test planning | `/tdk-plan <id> --tdd` \| `/tdk-plan <id> --ut-backfill` | `--sub-workspace`, `--module`, `--standalone` (backfill only) | `spec.md` (opt), consumer test skill routing | `plan.md`, `phases/phase-NN-*.md` with TDD/backfill sections and `Test Quality Gate` rows | plan |

### Config Commands

| Command | Syntax | Key Flags | Input | Output | Depends On |
|---------|--------|-----------|-------|--------|------------|
| config:diff | `/tdk-config-diff` | `--sub-workspace` (required), `--detailed` | Workspace + sub-workspace docs | Diff table (no file) | sub-workspace:init |
| config:sync | `/tdk-config-sync` | `--from-sub-workspace`, `--to-sub-workspace`, `--all`, `--force`, `--dry-run` | Docs paths | Synced files | sub-workspace:init |
| config:index | `/tdk-config-index` | `--sub-workspace`, `--full` | All docs files | `document-manager.md` | None |
| config topology apply | `bun src/index.ts config topology apply [--dry-run] [--reconcile] [--topology <path>] [--yes --expect-hash <hash>] [--accept-overwrites]` | `--dry-run`, `--reconcile`, `--topology`, `--yes`, `--expect-hash`, `--accept-overwrites` | `workspace-layout-proposal.json`, legacy `workspace-topology.json`, existing JSON `.specify/.specify.json` | JSON dry-run patch preview or guarded config write | None |

> Harness install, convert, and convert-flat are managed by the standalone setup CLI in the source checkout. They are not part of the consumer-facing workflow CLI documented here. See the setup CLI README in the source checkout for usage.

### Sub-workspace Commands

| Command | Syntax | Key Flags | Input | Output | Depends On |
|---------|--------|-----------|-------|--------|------------|
| sub-workspace:init | `/tdk-sub-workspace-init [name]` | — | Project config | `.specify/.specify.json`, rules/docs path config | None |
| sub-workspace:list | `/tdk-sub-workspace-list` | — | `.specify/.specify.json` | Table display (no file) | sub-workspace:init |

### Other Commands

| Command | Syntax | Key Flags | Input | Output | Depends On |
|---------|--------|-----------|-------|--------|------------|
| constitution | `/tdk-constitution` (update) or `/tdk-constitution --init <brief\|file>` | `--init <brief\|file>` | Existing `constitution.md`, Memory v3 control plane, accepted brief/deltas, templates | `constitution.md`; `memory-index.md` and `memory.yaml` when init bootstraps missing memory; `arc42/` summaries; typed Memory v3 files when evidence exists | None (project-level) |

### Primary Implementation Path

| Command | Syntax | Key Flags | Input | Output | Depends On |
|---------|--------|-----------|-------|--------|------------|
| implement | `/tdk-implement <id> [--phase NN]` | `--phase NN` | `plan.md` with ## Phases | Source code, `plan.md` Status column | plan |

`/tdk-implement` reads the `## Phases` table from `plan.md` and executes all runnable phases by default, marking progress in the table's Status column. Use `/tdk-implement <id> --phase NN` to execute one numeric phase only; selected mode does not auto-run dependencies. Best for small/medium features completable in one session.

**Re-running `/tdk-plan` after implementation:**
- **(a) Update phases only** — When feature scope expands or phases change: re-run `/tdk-plan <id>` (overwrites plan.md; you lose current Status-column progress)
- **(b) Append new phases** — When adding follow-up work: manually add rows to the existing `## Phases` table in plan.md, then resume with `/tdk-implement <id> [--phase NN]`

## Workflow Map

See [workflow-map.md](workflow-map.md) for full Mermaid flow diagrams showing input/output relationships between commands and files.

**Summary flow (Primary Path):**
```
req → /specify → spec.md → /clarify → spec.md (clarified)
  → /plan → plan.md + phases/*.md; optional indexed research/, reports/, machine contracts/
  → /implement → source code
```

---

## Use Case Scenarios

Detailed walkthroughs live in [Scenario Catalog](scenarios/scenario-catalog.md). This file intentionally keeps only command reference material so scenario pages remain the source of truth for step-by-step workflows.

---

## Tips & Best Practices

### Workflow Efficiency

- **Use `/tdk-specify --fast`** for small, well-understood features. Default mode includes brainstorm exploration for unclear scope. Auto-detect picks mode based on description complexity.
- **Add `--interview`** when hidden assumptions would be costly. It asks artifact-grounded alignment questions and records only accepted artifact changes or unresolved questions.
- **Use ID-only `--interview`** only for existing artifacts: `/tdk-discovery <id> --interview` requires the four discovery files, `/tdk-epic-prd <id> --interview` requires the four epic PRD files, and `/tdk-specify <id> --interview` requires `spec.md`.
- **Always run `clarify`** before `plan` — it catches ambiguities early, saving rework during implementation.
- **Run `analyze` before `implement`** — it catches spec-plan-tasks inconsistencies that would cause bugs.
- **Use `status` liberally** — it's read-only and shows what's done vs. remaining.

### Common Flag Patterns

| Flag | Used by | Purpose |
|------|---------|---------|
| `--sub-workspace <name>` | `/tdk-plan --ut-backfill`, config commands | Target a specific sub-workspace (e.g., `frontend`, `backend`) |
| `--force` | `/tdk-config-sync` | Overwrite existing artifacts without confirmation |
| `--dry-run` | config:sync, workflow-config:apply | Preview changes without writing files; workflow config apply emits `planHash` for automation/debug |
| `--standalone` | `/tdk-plan --ut-backfill` | Generate UT phases for existing code without spec |
| `--tdd` / `--ut-backfill` | `/tdk-plan` | Select tests-first or backfill sections for generated phases |

### When to Skip Optional Commands

| Command | Skip when... |
|---------|-------------|
| `discovery` | Work is already feature-sized or the problem/personas/MVP boundary is clear |
| `epic-prd` | Work is feature-sized, or discovery does not need product alignment and child spec slicing |
| `clarify` | Spec is already detailed and unambiguous |
| `checklist` | Feature has no complex quality dimensions (UX, security, API) |
| `analyze` | Small feature with simple spec/plan/tasks chain |
| `constitution` | Project principles already established and stable |

---

## Troubleshooting

| Error | Cause | Resolution |
|-------|-------|------------|
| "spec.md not found" | Running `plan` or implementation before `specify` | Run `/tdk-specify <id> <description>` first |
| "plan.md not found" | Running implementation before `plan` | Run `/tdk-plan <id>` first |
| "Invalid prefix" | Task ID prefix not in allowed list | Check `ERCSPEC_PREFIX_LIST` in `.specify/.specify.env` |
| "Task ID already exists" | `spec.md` or an existing guarded artifact already exists | Work on existing feature or use a different ID. A directory containing `discovery.md` but no `spec.md` is a parent epic directory; continue with `/tdk-epic-prd <id>` |
| "Discovery already exists" | `discovery.md` already exists | Re-run `/tdk-discovery ... --force` only when replacing discovery context intentionally |
| "Discovery replay interview requires existing discovery artifacts" | Running `/tdk-discovery <id> --interview` before all four discovery files exist | Create discovery first with `/tdk-discovery <id> <brief\|file> --interview` |
| "Epic PRD requires existing discovery artifacts" | Running `/tdk-epic-prd <id>` before the four discovery files exist | Create discovery first with `/tdk-discovery <id> <brief\|file>` |
| "Epic PRD already exists" | `epic-prd.md` already exists | Re-run `/tdk-epic-prd ... --force` only when replacing PRD artifacts, or use `--interview` to replay alignment |
| "Spec replay interview requires existing `spec.md`" | Running `/tdk-specify <id> --interview` before spec creation | Create the spec first with `/tdk-specify <id> <description> --interview` |
| "Did you mean `--interview`?" | Using positional `interview` as a mode | Replace `interview` with the `--interview` flag |
| "No UT skill found" | Running UT commands without a consumer UT skill | Create one in `.claude/skills/{name}/SKILL.md` with UT conventions |
| Script execution fails | Git Bash not available on Windows | Install Git for Windows (includes Git Bash) |
| "Feature not found" | Wrong task ID or folder | Check `.specify/specs/` for existing features; verify prefix in `.specify.env` |
| Checklist gate blocks implement | Incomplete checklist items | Complete checklist items or confirm to proceed when prompted |

### Command Order Quick Reference

If a command reports a missing prerequisite, use [Workflow Map](workflow-map.md) to inspect file inputs/outputs and use [Scenario Catalog](scenarios/scenario-catalog.md) to choose the matching runnable workflow. The short path for feature-sized work is:

```text
specify [--fast] -> clarify -> plan -> implement -> status
```

For broad epics, start with [Epic Start Guide](scenarios/00-epic-start-guide.md) instead of planning the parent epic directly.

---

*¹ The term "skill" comes from Claude Code's internal architecture where commands are defined as skill files. For all practical purposes, "command" and "skill" are interchangeable when referring to `/tdk-*` items.*
