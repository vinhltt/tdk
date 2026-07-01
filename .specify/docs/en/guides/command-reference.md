# TDK Command Suite Guide

> **Last updated**: 2026-07-01
>
> **Terminology**: In this guide, `/tdk-*` items are called "commands." Internally they are Claude Code plugin skills. Both terms refer to the same thing.
>
> **Where to run**: All `/tdk-*` commands are typed in the **Claude Code chat interface** (VSCode extension or Claude CLI prompt), NOT in a terminal or bash shell.

---

## Table of Contents

- [Why TDK?](#why-tdk)
- [TDK Native Features](#tdk-native-features)
- [Overview](#overview)
- [Cheat Sheet](#cheat-sheet)
- [Quick Start](#quick-start)
- [Command Reference](#command-reference)
- [Use Case Scenarios](#use-case-scenarios)
- [Tips & Best Practices](#tips--best-practices)
- [Document Flow](#document-flow)
- [Troubleshooting](#troubleshooting)

---

## Why TDK?

TDK is a specification-driven development framework that generates specs, optional portable task breakdowns, plans, and code from natural language. You describe a feature; TDK guides you through the full artifact chain — from requirements to production-ready implementation.

TDK is the Claude Code native generation of this framework.

### Evolution

| Dimension | speckit-original | speckit-tdk-jp | TDK |
|-----------|-----------------|----------------|--------------|
| Commands | 9 | 18 | **13** (11 TS + 2 bash fallback) |
| Platform | Agent templates | GitHub Copilot | **Claude Code CLI** |
| UT Framework | -- | -- | **3 commands** |
| Sub-workspace | -- | -- | **Isolation support** |
| Config mgmt | -- | -- | **diff/sync/index** |
| Skills system | -- | -- | **10+ skills** |
| Language | English | Japanese | **English** |

> **Full breakdown**: [tdk-vs-predecessors.md](evolution-comparison.md) — per-dimension table, per-command upgrades, design decisions.

---

## TDK Native Features

These capabilities are not present in the original frameworks.

### Unit Testing Framework

Unit-test planning is handled by TDK. Test implementation is routed to consumer-owned skills through `plan-skill-routing.md`.

| Command | Role |
|---------|------|
| `/tdk-ut-backfill-plan` | Generates test plan + phase files from spec or existing code |
| `/tdk-implement` | Executes all runnable phases, or one selected phase with `--phase NN`; runs `## Delegate Skills` before generic implementation |
| consumer test skill | Generates/runs tests according to project conventions |

### Sub-Workspace Isolation

Commands: `/tdk-sub-workdspace-init`, `/tdk-sub-workdspace-list`

Use `--sub-workspace <name>` on all UT and config commands to target a specific workspace (e.g., `frontend`, `backend`). Essential for monorepo and multi-service projects where each service has its own framework, conventions, and documentation.

> **Note**: The `sub-workdspace` spelling in command names is intentional — it matches the internal implementation.

### Config Management Trilogy

| Command | Purpose |
|---------|---------|
| `/tdk-config-diff` | Compare workspace docs vs. sub-workspace docs |
| `/tdk-config-sync` | Bidirectional sync with `--dry-run`, `--all`, `--force` |
| `/tdk-config-index` | Auto-generate `document-manager.md` for LLM discoverability |

Run `diff → sync → index` to keep docs consistent across workspaces.

### Architecture Workflow Inception

| Command | Purpose |
|---------|---------|
| `/tdk-greenfield-start` | New-project intake that writes readiness-aware `project-inception.md` and recommends the next command chain without mutating runtime config |
| `/tdk-brownfield-start` | Observe-first repo onboarding that writes evidence/confidence-based `brownfield-onboarding.md` and recommends scout/layout/docs steps |
| `/tdk-architecture-advisor` | Project-level architecture advisor that writes report-only options, decision, or recovery artifacts |
| `/tdk-workspace-layout-propose` | Workspace layout proposal workflow that writes `workspace-layout-proposal.md` and `workspace-layout-proposal.json` without runtime config mutation |
| `/tdk-boundary-map` | Deprecated compatibility route for `/tdk-workspace-layout-propose`; legacy `workspace-topology.md/json` artifacts remain readable |
| `/tdk-workflow-config-apply` | Interactive review/apply of `.specify/.specify.json` changes derived from `workspace-layout-proposal.json` or legacy `workspace-topology.json`; automation can still use explicit dry-run/apply flags |
| `/tdk-workspace-dependency-policy` | Optional workspace dependency policy report and non-applied enforcement snippets from approved layout evidence |
| `/tdk-module-boundary-policy` | Deprecated compatibility route for `/tdk-workspace-dependency-policy`; legacy policy artifacts remain readable |
| `/tdk-golden-path-scaffold` | Dry-run-first scaffold plan and recipe for approved layout skeletons; guarded apply creates only safe empty structure and `.specify` templates |
| `/tdk-sub-workspace-docs` | Arc42-lite docs for one or all configured sub-workspaces |
| `/tdk-sub-workspace-automation-recommend` | One-sub-workspace skill/agent recommendation from docs, dependency policy, official docs, local skills, and optional direct community lookup |

Architecture advisor is report-only. It does not write runtime config, layout
files, source code, plans, tasks, tracker issues, or ADR files. Workspace layout
proposal is proposal-only: it writes layout markdown/JSON and does not change runtime
config, source directories, or dependency policy. Workflow config apply previews
first, shows diff/warnings, asks before writing, and passes the parsed
`planHash` internally. Automation can still run `--dry-run`, then
`--yes --expect-hash <planHash>`.
It does not create source directories or apply `--reconcile`. Workspace dependency
policy follows layout review/apply and writes advisory Markdown only; it never
changes source, lint, workspace, package manager, routing, or runtime config.
Golden-path scaffold follows approved layout/policy review and defaults to a
reviewable dry-run recipe under `.specify/configurations/golden-path/`; `--yes`
requires `golden-path-recipe.json` to be approved and never creates business
code.

### Skills Ecosystem

TDK ships with 10+ skills that extend the Claude Code environment: context engineering, DOCX/PDF/PPTX processing, MCP builder, brainstorming, docs-seeker (Context7 integration), and more. Skills are loaded on demand and can be extended without modifying core commands.

### Claude Code Native

Runs in the Claude Code CLI and VSCode extension. No GitHub Copilot subscription needed. Leverages full Claude reasoning — not just prompt triggering.

---

## Overview

The TDK command suite provides a **specification-driven development** workflow. You describe a feature in natural language, optionally capture epic discovery context first, and the commands guide you through specification, optional design and task breakdown, planning, and implementation.

### Workflow Pipeline

![TDK lifecycle workflow](../../assets/tdk-lifecycle-share-graph.png)

```
                    ┌─────────────────────────────────────────────────────────────────────┐
                    │                   SPECIFICATION-DRIVEN WORKFLOW                     │
                    └─────────────────────────────────────────────────────────────────────┘

  Phase 0                Phase 1              Optional              Phase 2                Phase 3
  ┌──────────────┐    ┌──────────┐    ┌────────────────┐    ┌────────────────┐    ┌───────────────────┐
  │   specify    │───>│ clarify  │───>│task-breakdown  │───>│      plan      │───>│implement│
  │  (--fast)    │    │ (should) │    │                │    │                   │
  └──────────────┘    └──────────┘    └────────────────┘    └────────────────┘    └───────────────────┘
         │                  │                │                       │                       |
         v                  v                v                       v                       |
    ┌──────────┐     ┌──────────────┐  ┌─────────────┐        ┌──────────────┐
    │checklist │     │ba-requirement│  │api-design   │        │routed test   │
    │(optional)│     │  (Approval)  │  │db-design    │        │skill         │
    └──────────┘     └──────────────┘  │ (Approval)  │        └──────────────┘
                                       └─────────────┘

  Design Documents
  ┌──────────────────┐
  │ batch-design     │
  │ test-viewpoint   │
  └──────────────────┘

  Primary Implementation
  ┌───────────────────────┐
  │implement    │
  │(plan.md ## Phases)    │
  └───────────────────────┘

  PROJECT-LEVEL (no task ID needed):
  ┌──────────────┐    ┌─────────────────────┐    ┌──────────────────────────┐
  │ constitution │    │ sub-workspace:init  │    │ config:diff/sync/index   │
  └──────────────┘    │ sub-workspace:list  │    └──────────────────────────┘
                      └─────────────────────┘
```

**Minimal feature flow**: `specify` -> `clarify` -> `plan` -> `implement`

**Epic flow**: `constitution` (project-level) -> optional `discovery` -> `specify` -> `clarify` -> optional `high-level-design` -> `task-breakdown` -> tracker sync -> child `specify` -> child `clarify` -> child `plan` -> child `implement`

For feature-sized work, skip discovery, HLD, and task breakdown by default. If the feature is small and clear, the current spec continues directly to `plan` and `implement`. For epic-sized work, `task-breakdown` usually becomes the handoff to consumer-owned tracker sub-issues; each sub-issue is then seeded into a child spec that runs its own `specify -> clarify -> plan -> implement` loop.

Each command reads the output of the previous one. For minimal feature work, the chain is `spec.md` -> `plan.md` (with `## Phases`) -> source code. For epic-sized work, optional `discovery/` and optional `high-level-design/` enrich the parent spec before `tasks-breakdown/`; then task files are synced to tracker sub-issues and seeded into child specs.

`/tdk-high-level-design` always uses built-in design lenses and may optionally read `{docs.path}/custom-workflow/high-level-design-skill-routing.md` for advisory consumer design skills. This HLD routing file is separate from `plan-skill-routing.md`, which remains implementation/test routing for planning and UT workflows.

---

## Cheat Sheet

| # | Command | Description |
|---|---------|-------------|
| 0 | `/tdk-discovery <epic-id> [<brief\|file>] [--force] [--interview]` | Optional epic discovery context before `tdk-specify`; ID-only `--interview` rechecks existing discovery artifacts |
| 1 | `/tdk-specify <id> [<desc>] [--interview]` | Create a feature spec, or run ID-only `--interview` against existing `spec.md` |
| 2 | `/tdk-specify <id> <desc> --fast [--interview]` | Quick specification (skips brainstorm, fewer tokens); `--fast --interview` is valid |
| 3 | `/tdk-clarify <id>` | Ask up to 5 targeted questions to fill spec gaps |
| 4 | `/tdk-high-level-design <id> [--greenfield] [--force]` | Generate approval-level high-level design artifacts from a clarified spec (greenfield, optional) |
| 5 | `/tdk-task-breakdown <id>` | Generate portable Markdown work-item files from a clarified spec |
| 6 | `/tdk-ba-requirement <id>` | Generate BA requirement document for stakeholder approval |
| 7 | `/tdk-plan <id> [content] [flags]` | Generate implementation plan with design artifacts |
| 8 | `/tdk-api-design <id>` | Generate detailed API design (Scenario A/B) with DB schema for approval |
| 10 | `/tdk-analyze <id>` | Cross-artifact consistency and quality analysis |
| 11 | `/tdk-status <id>` | Show workflow progress (read-only, any time) |
| 12 | `/tdk-checklist <id> [focus]` | Generate quality checklist for requirements |
| 13 | `/tdk-constitution [--init <brief|file>]` | Create/update project architecture principles and initialize project memory artifacts |
| 14 | `/tdk-greenfield-start [brief|file] [--full|--quick|--unknown]` | New-project intake and routing report |
| 15 | `/tdk-brownfield-start [repo-root] [--full|--config-only|--unknown]` | Existing-repo onboarding and safe setup recommendations |
| 16 | `/tdk-architecture-advisor [input|file] [--recover-existing|--unknown]` | Project architecture options, decision, or recovery reports |
| 17 | `/tdk-workspace-layout-propose [input|file] [--from-existing|--unknown]` | Workspace layout proposal markdown and JSON |
| 17c | `/tdk-boundary-map [input|file] [--from-existing|--unknown]` | Deprecated compatibility route for workspace layout proposal |
| 18 | `/tdk-workspace-dependency-policy [layout|file] [--audit|--suggest]` | Optional workspace dependency policy report and non-applied enforcement snippets |
| 18c | `/tdk-module-boundary-policy [topology|file] [--audit|--suggest]` | Deprecated compatibility route for workspace dependency policy |
| 19 | `/tdk-golden-path-scaffold [layout|file] [--dry-run|--yes] [--preset <name>]` | Guarded golden-path scaffold plan and recipe |
| — | **Unit Testing** | |
| 20 | `/tdk-ut-backfill-plan <id>` | Generate unit test plan and phase files |
| — | **Config & Workspace** | |
| 21 | `/tdk-config-diff` | Compare workspace vs sub-workspace docs |
| 22 | `/tdk-config-sync` | Sync docs between workspace and sub-workspaces |
| 23 | `/tdk-config-index` | Generate/update document manager index |
| 24 | `/tdk-workflow-config-apply [(no flags)\|--dry-run\|--reconcile\|--yes --expect-hash <hash>] [--topology <path>]` | Interactive runtime config review/apply from workspace layout proposal |
| 25 | `/tdk-sub-workdspace-init` | Initialize a new sub-workspace |
| 26 | `/tdk-sub-workdspace-list` | List all configured sub-workspaces |
| 27 | `/tdk-sub-workspace-docs [--sub-workspace NAME\|--all] [--force]` | Generate arc42-lite docs under `<docsPath>/sub-workspaces/<name>/` |
| 28 | `/tdk-sub-workspace-automation-recommend --sub-workspace <name> [--no-community-search]` | Recommend skills/agents for one selected sub-workspace |
| 29 | `/tdk-scaffold-from-recommendation [path] [--dry-run] [--skills-only] [--agents-only]` | Scaffold reviewed skills/agents from an approved recommendation |
| 30 | `/tdk-sub-workdspace-sync` | ~~Deprecated~~ → use `/tdk-config-sync` instead |
| — | **Design Documents** | |
| 31 | `/tdk-batch-design <id>` | Generate batch processing design document for approval |
| — | **Test Viewpoints** | |
| 32 | `/tdk-test-viewpoint <id>` | Generate high-level test viewpoints (観点) from spec |
| — | **Primary Implementation** | |
| 33 | `/tdk-implement <id> [--phase NN]` | Execute implementation directly from plan.md ## Phases (recommended) |

---

## Quick Start

Follow this walkthrough to develop your first feature end-to-end.

If you are starting from a broad or vague epic, read the [Epic Start Guide](epic-start-guide.md) first. It explains when to use discovery, what each artifact means, and which readiness gates must pass before moving on.

### Prerequisites

- **Claude Code** installed ([installation guide](https://docs.anthropic.com/en/docs/claude-code))
- **Git Bash** on Windows (included with Git for Windows)
- Project initialized with `.specify/.specify.env` configuration file

### Step 1 — Discover or specify

For a broad epic, optionally capture context before the spec:

```
/tdk-discovery feat-001 "User avatar upload, cropping, validation, storage, and moderation"
```

This creates `discovery/problem.md`, `discovery/personas.md`, `discovery/mvp-scope.md`, and `discovery/index.md`. Discovery is context-only: it does not create `spec.md`, plans, work items, tracker records, or `UR-*` / `FR-*` / `SC-*` IDs. Skip it for small feature-sized work.

Add `--interview` when the epic is broad or risky enough that you want to challenge the generated discovery text before completion. It folds accepted changes into the same four discovery files and creates no separate interview artifact or tracker record.

After discovery exists, use `/tdk-discovery <id> --interview` to rerun the alignment interview against the current four discovery files. This replay path does not regenerate discovery. Do not use positional `interview`; use `--interview`.

Before specifying a broad epic, open `discovery/index.md` and confirm problem, personas, and MVP scope are clear enough to become requirements.

```
/tdk-specify feat-001 Add user avatar upload with image cropping
```

This creates `.specify/specs/feat-001/spec.md` with user stories, requirements, and acceptance criteria. Answer any clarifying questions Claude asks (up to 3).

Use `/tdk-specify <id> <desc> --interview` to review the draft spec against your intent before unresolved-question handling. `--fast --interview` is valid: `--fast` controls draft depth, while `--interview` controls the alignment gate.

After `spec.md` exists, use `/tdk-specify <id> --interview` to rerun the alignment interview against the current spec without creating a new spec. `--fast --interview` still requires a description.

### Step 2 — Clarify gaps (optional but recommended)

```
/tdk-clarify feat-001
```

Claude identifies underspecified areas and asks up to 5 targeted questions. Answers are encoded back into `spec.md`.

For HLD, task breakdown, or child planning, `## 9. Unresolved Questions` must be exactly `None`.

### Step 3 — Produce high-level design (optional)

```
/tdk-high-level-design feat-001
```

Creates `high-level-design/index.md` and five design artifacts from a clarified spec. Use this when stakeholders need approval-level design before task breakdown or planning. HLD enriches existing `UR-*`, `FR-*`, and `SC-*`; it does not create new requirement IDs.

### Step 4 — Generate portable work items (optional)

```
/tdk-task-breakdown feat-001
```

Creates `tasks-breakdown/index.md` and `tasks-breakdown/task-NNN-*.md` files from a clarified spec. This is tracker-neutral Markdown only; GitHub, GitLab, Backlog, Jira, or other issue sync stays consumer-owned.

For epic-sized work, the task files are usually synced into tracker sub-issues by consumer-owned tooling. Each sub-issue is then seeded into a child spec and runs its own `specify -> clarify -> plan -> implement` loop. For small feature-sized work, you can skip this child-spec loop and plan the current spec directly.

### Step 5 — Plan the implementation

```
/tdk-plan feat-001
```

Generates `plan.md` with architecture decisions, file structure, tech stack, and design artifacts (`data-model.md`, `contracts/`, `research/`). The plan includes a `## Phases` table for implementation.

For direct feature-sized work, plan the current spec ID. For epic-sized work after task breakdown, plan each child spec ID created from a tracker sub-issue; do not plan the parent epic as one large implementation unit unless you intentionally decide it is small enough.

### Step 6 — Implement (Recommended Path)

```
/tdk-implement feat-001
```

Executes implementation directly from `plan.md ## Phases` table. Lightweight approach for small to medium features. Marks completion in the `plan.md` phases table. UT phase files delegate to the consumer test skill listed in `## Delegate Skills`.

To execute one phase only:

```
/tdk-implement feat-001 --phase 03
```

Selected mode still honors dependencies and stale `in_progress` recovery.

### Step 6 — Run unit tests (optional)

Map the `test` domain in `{docs.path}/custom-workflow/plan-skill-routing.md`, then run:

```
/tdk-implement feat-001
```

`/tdk-plan` triggers `/tdk-ut-backfill-plan` when UT planning is needed. The generated `ut/phases/*.md` files delegate implementation to the routed consumer test skill. See [04-unit-testing-full-pipeline.md](scenarios/04-unit-testing-full-pipeline.md) for a detailed walkthrough.

### Optional HLD design routing

To add project-specific advisory design skills, copy `.specify/templates/high-level-design/high-level-design-skill-routing-template.tpl` to `{docs.path}/custom-workflow/high-level-design-skill-routing.md` and map lenses such as `architecture`, `security`, `data`, `api`, `ux`, or `operability`.

Missing HLD routing is non-blocking; `/tdk-high-level-design` continues with built-in lenses. Consumer HLD skills are read-only/advisory and do not write artifacts.

### Check progress any time

```
/tdk-status feat-001
```

Shows a progress bar, completed/remaining phases, and recommendations.

### Artifacts produced (Primary Path)

```
.specify/specs/feat-001/
├── discovery/           ← Optional epic context before Step 1
├── spec.md              ← Step 1
├── high-level-design/   ← Optional design after clarification
├── tasks-breakdown/     ← Step 3 optional portable work items
├── plan.md              ← Step 4 (includes ## Phases table)
├── research/            ← Step 4 (if needed)
├── data-model.md        ← Step 4 (if needed)
├── contracts/           ← Step 4 (if needed)
└── checklists/          ← /tdk-checklist (optional)
```

---

## Command Reference

### Core Commands

| Command | Syntax | Key Flags | Input | Output | Depends On |
|---------|--------|-----------|-------|--------|------------|
| discovery | `/tdk-discovery <epic-id> [<brief\|file>] [--force] [--interview]` | `--force`, `--interview` | Project context, constitution/memory, brief or file; existing discovery files for ID-only `--interview` | `discovery/problem.md`, `discovery/personas.md`, `discovery/mvp-scope.md`, `discovery/index.md` | Optional after constitution, before specify |
| specify | `/tdk-specify <id> [<desc>] [--interview]` | `--interview` | `.specify.env`; optional `discovery/index.md`; existing `spec.md` for ID-only `--interview` | `spec.md`, `checklists/requirements.md` | None, or discovery context |
| specify (fast) | `/tdk-specify <id> <desc> --fast [--interview]` | `--fast`, `--interview` | `.specify.env` | `spec.md`, `checklists/requirements.md` | None |
| clarify | `/tdk-clarify <id>` | — | `spec.md` | `spec.md` (updated) | specify |
| high-level-design | `/tdk-high-level-design <id>` | `--greenfield`, `--force` | `spec.md` with unresolved questions set to `None`; optional HLD routing | `high-level-design/index.md` + 5 design artifacts | clarify |
| task-breakdown | `/tdk-task-breakdown <id>` | — | `spec.md` with unresolved questions set to `None`; optional `high-level-design/` | `tasks-breakdown/index.md`, `tasks-breakdown/task-NNN-*.md` | clarify |
| ba-requirement | `/tdk-ba-requirement <id>` | `--figma-pc`, `--figma-sp`, `--output` | `spec.md` | `ba-requirement.md` | clarify |
| plan | `/tdk-plan <id> [content] [flags]` | `--fast`, `--hard`, `--red-team`, `--validate` | `spec.md`, `ba-requirement.md` | `plan.md` (with ## Phases table), `research/`, `data-model.md`, `contracts/` | ba-requirement |
| api-design | `/tdk-api-design <id>` | `--scenario A|B` | `spec.md`, `research/` | `api_design.md` (incl. DB schema) | plan |
| implement | `/tdk-implement <id> [--phase NN]` | `--phase NN` | `plan.md` | Source code, `plan.md` Status column | plan |
| analyze | `/tdk-analyze <id>` | — | `spec.md`, `plan.md ## Phases` | Report (no file created) | plan |
| status | `/tdk-status <id>` | — | Feature directory | Progress report (no file created) | specify |

`/tdk-plan` accepts freeform content after `<id>` in every mode. Default, `--fast`, and `--hard` treat content as planning instruction; `--red-team` treats it as review focus; `--validate` treats it as validation focus. Known mode flags can appear after `<id>` before or after the content.

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

### UT Commands

| Command | Syntax | Key Flags | Input | Output | Depends On |
|---------|--------|-----------|-------|--------|------------|
| ut:plan | `/tdk-ut-backfill-plan <id>` | `--sub-workspace`, `--review`, `--force`, `--standalone` | `spec.md` (opt), consumer test skill routing | `ut/plan.md`, `ut/phases/*.md` | plan or direct invocation |

### Config Commands

| Command | Syntax | Key Flags | Input | Output | Depends On |
|---------|--------|-----------|-------|--------|------------|
| config:diff | `/tdk-config-diff` | `--sub-workspace` (required), `--detailed` | Workspace + sub-workspace docs | Diff table (no file) | sub-workspace:init |
| config:sync | `/tdk-config-sync` | `--from-sub-workspace`, `--to-sub-workspace`, `--all`, `--force`, `--dry-run` | Docs paths | Synced files | sub-workspace:init |
| config:index | `/tdk-config-index` | `--sub-workspace`, `--full` | All docs files | `document-manager.md` | None |
| config topology apply | `bun src/index.ts config topology apply [--dry-run] [--reconcile] [--topology <path>] [--yes --expect-hash <hash>] [--accept-overwrites]` | `--dry-run`, `--reconcile`, `--topology`, `--yes`, `--expect-hash`, `--accept-overwrites` | `workspace-layout-proposal.json`, legacy `workspace-topology.json`, existing JSON `.specify/.specify.json` | JSON dry-run patch preview or guarded config write | None |

### Harness CLI Commands

| Command | Syntax | Key Flags | Input | Output | Depends On |
|---------|--------|-----------|-------|--------|------------|
| harness install | `tdk harness install --harness claude` or `--harness codex` | `--plugins`, `--all-plugins`, `--prefix`, `--dry-run`, `--yes` | TDK plugin source under `.specify/plugins/`; Codex uses generated packages under `.specify/codex-plugins/` | Managed `.claude/` artifacts or `.agents/skills/` + `.codex/` artifacts + ownership manifest | setup |
| harness convert | `tdk harness convert` | `--plugins`, `--all-plugins`, `--dry-run`, `--check` | Maintainer source tree `.specify/plugins/tdk-*` | Generated per-plugin packages under `.specify/codex-plugins/<plugin>/` (official OpenAI layout); `--check` fails on drift | source tree |
| harness convert-flat | `tdk harness convert-flat [root]` | `--dry-run`, `--force`, `--yes` | Existing flat `.claude/` tree | Additive `.codex/` + `.agents/skills/` artifacts + `.specify/state/harness-install/codex.json` ownership manifest | setup |

`harness convert` is source-tree/maintainer-only. Consumer payloads install the generated `.specify/codex-plugins/<plugin>/` packages with `harness install --harness codex`; install never re-transforms source.

`harness install --harness codex` verifies generated-package checksums from `.specify/codex-plugins/manifest.json`, writes skills to `.agents/skills/` and hooks/lib under `.codex/`, generates `.codex/agents/*.toml` and `.codex/config.toml` at install time from plugin source agents, and rejects combined `--harness claude,codex` in v1.

Underscore-prefixed shared skill directories such as `_shared` are copied as reference assets, but their `SKILL.md` entrypoint is not installed as a loadable Codex skill.

`harness convert-flat` never deletes or modifies the source `.claude/` tree. Unknown flat `.claude/` entries are reported and skipped; originals remain in place. Existing unowned `.codex/` targets are conflicts by default and are skipped unless `--force` is passed.

### Sub-workspace Commands

| Command | Syntax | Key Flags | Input | Output | Depends On |
|---------|--------|-----------|-------|--------|------------|
| sub-workdspace:init | `/tdk-sub-workdspace-init [name]` | — | Project config | `.specify.yaml`, `rules.md` | None |
| sub-workdspace:list | `/tdk-sub-workdspace-list` | — | `.specify.yaml` | Table display (no file) | sub-workspace:init |
| sub-workdspace:sync | `/tdk-sub-workdspace-sync` | — | — | — | **Deprecated** → `/tdk-config-sync` |

### Other Commands

| Command | Syntax | Key Flags | Input | Output | Depends On |
|---------|--------|-----------|-------|--------|------------|
| constitution | `/tdk-constitution [principles]` | `--init <brief\|file>` | `constitution.md`, templates | `constitution.md`, `product-context.md`, project docs | None (project-level) |
| checklist | `/tdk-checklist <id> [focus]` | — | `spec.md`, `plan.md` (opt) | `checklists/{domain}.md` | specify |

### Design Document Commands

| Command | Syntax | Key Flags | Input | Output | Depends On |
|---------|--------|-----------|-------|--------|------------|
| batch-design | `/tdk-batch-design <id>` | `--scenario A\|B` | `spec.md`, `research/`, `data-model.md` | `batch-design.md` | plan |
| test-viewpoint | `/tdk-test-viewpoint <id>` | — | `spec.md`, `ba-requirement.md` | `test-viewpoint.csv` | ba-requirement |

**`/tdk-batch-design` scenarios:**

| Scenario | Trigger | Data Sources |
|----------|---------|--------------|
| **A: New Batch** | No existing endpoint impact | spec.md, research/ |
| **B: With Impact** | Modifies/extends existing batch or tables | spec.md, data-model.md, research/ |

Detection: `--scenario A|B` flag explicit, else `research/` has reports → B, otherwise → A.

### Primary Implementation Path

| Command | Syntax | Key Flags | Input | Output | Depends On |
|---------|--------|-----------|-------|--------|------------|
| implement | `/tdk-implement <id> [--phase NN]` | `--phase NN` | `plan.md` with ## Phases | Source code, `plan.md` Status column | plan |

`/tdk-implement` reads the `## Phases` table from `plan.md` and executes all runnable phases by default, marking progress in the table's Status column. Use `/tdk-implement <id> --phase NN` to execute one numeric phase only; selected mode does not auto-run dependencies. Best for small/medium features completable in one session.

**Re-running `/tdk-plan` after implementation:**
- **(a) Update phases only** — When feature scope expands or phases change: re-run `/tdk-plan <id>` (overwrites plan.md; you lose current Status-column progress)
- **(b) Append new phases** — When adding follow-up work: manually add rows to the existing `## Phases` table in plan.md, then resume with `/tdk-implement <id> [--phase NN]`

## Document Flow

See [tdk-document-flow.md](document-flow.md) for full Mermaid flow diagrams showing input/output relationships between all commands and artifacts.

**Summary flow (Primary Path):**
```
req → /specify → spec.md → /clarify → spec.md (clarified)
  → /ba-requirement → ba-requirement.md (Approval)
  → /plan → plan.md (with ## Phases table), research/, data-model.md, contracts/, wireframes/
  → /api-design → api_design.md (Approval)
  → /batch-design → batch-design.md (Approval)
  → /db-design → db_design.md (Approval)
  → /implement → source code
```

---

## Use Case Scenarios

Detailed walkthroughs for common development situations. Each scenario includes problem context, exact command sequence, and step-by-step instructions.

### Core Workflows

| # | Scenario | When to use | Link |
|---|----------|-------------|------|
| 1 | Full Feature Development | New feature from scratch | [01-full-feature-development.md](scenarios/01-full-feature-development.md) |
| 2 | Quick Specification | Small feature, skip brainstorm | [02-quick-specification.md](scenarios/02-quick-specification.md) |
| 3 | Quality Review & Analysis | Before PR, validate consistency | [03-quality-review-analysis.md](scenarios/03-quality-review-analysis.md) |
| 4 | Unit Testing — Full Pipeline | Set up rules + plan + generate tests | [04-unit-testing-full-pipeline.md](scenarios/04-unit-testing-full-pipeline.md) |
| 5 | Unit Testing — Automated | One-command UT workflow | [05-unit-testing-automated.md](scenarios/05-unit-testing-automated.md) |
| 6 | Unit Testing — Standalone | Write tests for existing code (no spec) | [06-unit-testing-standalone.md](scenarios/06-unit-testing-standalone.md) |

### Setup & Management

| # | Scenario | When to use | Link |
|---|----------|-------------|------|
| 7 | Project Setup & Constitution | New project or team onboarding | [07-project-setup-constitution.md](scenarios/07-project-setup-constitution.md) |
| 8 | Workspace Docs Management | Sync and organize docs | [08-workspace-docs-management.md](scenarios/08-workspace-docs-management.md) |

### Advanced Workflows

| # | Scenario | When to use | Link |
|---|----------|-------------|------|
| 13 | Multi-Sub-Workspace Monorepo | Multi-service project setup | [13-multi-sub-workspace-monorepo.md](scenarios/13-multi-sub-workspace-monorepo.md) |
| 14 | Greenfield Full Start, Architecture, And Topology | New project start through architecture, topology, boundary policy, and sub-workspace docs | [14-greenfield-full-start-architecture-topology.md](scenarios/14-greenfield-full-start-architecture-topology.md) |

### Day-to-Day

| # | Scenario | When to use | Link |
|---|----------|-------------|------|
| 9 | Progress Tracking | Check where you left off | [09-progress-tracking.md](scenarios/09-progress-tracking.md) |
| 10 | Mid-Development Changes | Requirements changed mid-feature | [10-mid-development-changes.md](scenarios/10-mid-development-changes.md) |
| 11 | Resume Existing Feature | Continue work after a break | [11-resume-existing-feature.md](scenarios/11-resume-existing-feature.md) |

---

## Tips & Best Practices

### Workflow Efficiency

- **Use `/tdk-specify --fast`** for small, well-understood features. Default mode includes brainstorm exploration for unclear scope. Auto-detect picks mode based on description complexity.
- **Add `--interview`** when hidden assumptions would be costly. It asks artifact-grounded alignment questions and records only accepted artifact changes or unresolved questions.
- **Use ID-only `--interview`** only for existing artifacts: `/tdk-discovery <id> --interview` requires the four discovery files, and `/tdk-specify <id> --interview` requires `spec.md`.
- **Always run `clarify`** before `plan` — it catches ambiguities early, saving rework during implementation.
- **Run `analyze` before `implement`** — it catches spec-plan-tasks inconsistencies that would cause bugs.
- **Use `status` liberally** — it's read-only and shows what's done vs. remaining.

### Common Flag Patterns

| Flag | Used by | Purpose |
|------|---------|---------|
| `--sub-workspace <name>` | ut:*, config:* | Target a specific sub-workspace (e.g., `frontend`, `backend`) |
| `--force` | ut:auto, ut:plan, config:sync | Overwrite existing artifacts without confirmation |
| `--dry-run` | config:sync, workflow-config:apply | Preview changes without writing files; workflow config apply emits `planHash` for automation/debug |
| `--standalone` | ut:plan | Generate UT plan for existing code without spec |
| `--review` | ut:plan | Review and update existing UT plan |

### When to Skip Optional Commands

| Command | Skip when... |
|---------|-------------|
| `discovery` | Work is already feature-sized or the problem/personas/MVP boundary is clear |
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
| "Task ID already exists" | `spec.md` or an existing guarded artifact already exists | Work on existing feature or use a different ID. A directory containing only `discovery/` can continue to `/tdk-specify` |
| "Discovery already exists" | `discovery/index.md` already exists | Re-run `/tdk-discovery ... --force` only when replacing discovery context intentionally |
| "Discovery replay interview requires existing discovery artifacts" | Running `/tdk-discovery <id> --interview` before all four discovery files exist | Create discovery first with `/tdk-discovery <id> <brief\|file> --interview` |
| "Spec replay interview requires existing `spec.md`" | Running `/tdk-specify <id> --interview` before spec creation | Create the spec first with `/tdk-specify <id> <description> --interview` |
| "Did you mean `--interview`?" | Using positional `interview` as a mode | Replace `interview` with the `--interview` flag |
| "No UT skill found" | Running UT commands without a consumer UT skill | Create one in `.claude/skills/{name}/SKILL.md` with UT conventions |
| Script execution fails | Git Bash not available on Windows | Install Git for Windows (includes Git Bash) |
| "Feature not found" | Wrong task ID or folder | Check `.specify/specs/` for existing features; verify prefix in `.specify.env` |
| Checklist gate blocks implement | Incomplete checklist items | Complete checklist items or confirm to proceed when prompted |

### Command Order Quick Reference

If you get a "not found" error, follow this dependency chain:

**Primary (Recommended) Path:**
```
constitution (optional, project-level)
     ↓
greenfield-start or brownfield-start (optional, project-level)
     ↓
architecture-advisor (optional, project-level report-only)
     ↓
boundary-map (optional, project-level proposal-only)
     ↓
workflow-config-apply, or explicit --dry-run then --yes --expect-hash for automation (optional, project-level)
     ↓
golden-path-scaffold --dry-run, then --yes when recipe approved (optional, skeleton only)
     ↓
discovery (optional, epic-level context)
     ↓
specify [--fast]  →  clarify (optional)  →  checklist (optional)
     ↓
ba-requirement (for Approval)  →  test-viewpoint (optional)
     ↓
   plan (generates ## Phases table)  →  api-design  →  batch-design  →  db-design (as needed)
     ↓
 implement  →  status (any time)
```

Each command requires the output of commands above it in the chain.

---

*¹ The term "skill" comes from Claude Code's internal architecture where commands are defined as skill files. For all practical purposes, "command" and "skill" are interchangeable when referring to `/tdk-*` items.*
