# Tihon Command Suite Guide

> **Last updated**: 2026-04-21
>
> **Terminology**: In this guide, `/tdk-*` items are called "commands." Internally they are Claude Code plugin skills. Both terms refer to the same thing.
>
> **Where to run**: All `/tdk-*` commands are typed in the **Claude Code chat interface** (VSCode extension or Claude CLI prompt), NOT in a terminal or bash shell.

---

## Table of Contents

- [Why CommonDragon Tihon?](#why-commondragon-tihon)
- [CommonDragon Exclusive Features](#commondragon-exclusive-features)
- [Overview](#overview)
- [Cheat Sheet](#cheat-sheet)
- [Quick Start](#quick-start)
- [Command Reference](#command-reference)
- [Use Case Scenarios](#use-case-scenarios)
- [Tips & Best Practices](#tips--best-practices)
- [Document Flow](#document-flow)
- [Troubleshooting](#troubleshooting)

---

## Why CommonDragon Tihon?

Tihon (Plan — Act — Verify) is a specification-driven development framework that generates specs, plans, tasks, and code from natural language. You describe a feature; Tihon guides you through the full artifact chain — from requirements to production-ready implementation.

CommonDragon is the third generation of this framework, built natively for Claude Code.

### Evolution

| Dimension | speckit-original | speckit-tdk-jp | CommonDragon |
|-----------|-----------------|----------------|--------------|
| Commands | 9 | 18 | **15** (11 TS + 4 bash fallback) |
| Platform | Agent templates | GitHub Copilot | **Claude Code CLI** |
| UT Framework | -- | -- | **3 commands** |
| Sub-workspace | -- | -- | **Isolation support** |
| Config mgmt | -- | -- | **diff/sync/index** |
| Skills system | -- | -- | **10+ skills** |
| Language | English | Japanese | **English** |

> **Full breakdown**: [tdk-vs-predecessors.md](evolution-comparison.md) — per-dimension table, per-command upgrades, design decisions.

---

## CommonDragon Exclusive Features

These capabilities are not present in the original frameworks.

### Unit Testing Framework

Three dedicated commands cover the full test automation cycle:

| Command | Role |
|---------|------|
| `/tdk-ut-backfill-auto` | Orchestrates the full pipeline in one command |
| `/tdk-ut-backfill-plan` | Generates test plan + phase files from spec or existing code |
| `/tdk-ut-backfill-impl` | Generates test code from UT plan |

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

### Skills Ecosystem

CommonDragon ships with 10+ skills that extend the Claude Code environment: context engineering, DOCX/PDF/PPTX processing, MCP builder, brainstorming, docs-seeker (Context7 integration), and more. Skills are loaded on demand and can be extended without modifying core commands.

### Claude Code Native

Runs in the Claude Code CLI and VSCode extension. No GitHub Copilot subscription needed. Leverages full Claude reasoning — not just prompt triggering.

---

## Overview

The Tihon command suite provides a **specification-driven development** workflow. You describe a feature in natural language, and the commands guide you through specification, planning, task breakdown, and implementation.

### Workflow Pipeline

```
                    ┌─────────────────────────────────────────────────────────────────────┐
                    │                   SPECIFICATION-DRIVEN WORKFLOW                     │
                    └─────────────────────────────────────────────────────────────────────┘

  Phase 0                Phase 1                    Phase 2           Phase 3
  ┌──────────────┐    ┌──────────┐    ┌────────┐    ┌─────────┐    ┌─────────────┐
  │   specify    │───>│ clarify  │───>│  plan  │───>│implement-from-plan (primary) │
  │ specify-fast │    │ (should) │    │        │    │   or tasks→implement-task    │
  └──────────────┘    └──────────┘    └────────┘    │   [legacy]                 │
         │                  │              │         └─────────────────────────────┘
         v                  v              v                |
    ┌──────────┐     ┌──────────────┐ ┌─────────────┐    ┌──────────┐
    │checklist │     │ba-requirement│ │api-design   │    │ ut:auto  │
    │(optional)│     │  (Approval)  │ │db-design    │    │(auto UT) │
    └──────────┘     └──────────────┘ │ (Approval)  │    └──────────┘
                                      └─────────────┘

  Design Documents
  ┌──────────────────┐
  │ batch-design     │
  │ test-viewpoint   │
  └──────────────────┘

  Primary Implementation
  ┌───────────────────────┐
  │implement-from-plan    │
  │(plan.md ## Phases)    │
  └───────────────────────┘

  PROJECT-LEVEL (no task ID needed):
  ┌──────────────┐    ┌─────────────────────┐    ┌──────────────────────────┐
  │ constitution │    │ sub-workspace:init  │    │ config:diff/sync/index   │
  └──────────────┘    │ sub-workspace:list  │    └──────────────────────────┘
                      └─────────────────────┘
```

**Primary flow**: `specify` → `clarify` → `plan` → `implement-from-plan`

Each command reads the output of the previous one, building a chain of artifacts: `spec.md` → `plan.md` (with ## Phases table) → source code.

**Legacy flow** [deprecated]: `specify` → `clarify` → `plan` → `tasks` → `implement-task` (use primary flow instead).

---

## Cheat Sheet

| # | Command | Description |
|---|---------|-------------|
| 1 | `/tdk-specify <id> <desc>` | Create feature specification from natural language |
| 2 | `/tdk-specify-fast <id> <desc>` | Quick specification (skips brainstorm, fewer tokens) |
| 3 | `/tdk-clarify <id>` | Ask up to 5 targeted questions to fill spec gaps |
| 4 | `/tdk-ba-requirement <id>` | Generate BA requirement document for stakeholder approval |
| 5 | `/tdk-plan <id>` | Generate implementation plan with design artifacts |
| 6 | `/tdk-api-design <id>` | Generate detailed API design (Scenario A/B) with DB schema for approval |
| 8 | `/tdk-tasks <id>` [deprecated] | Legacy: Generate dependency-ordered task breakdown |
| 9 | `/tdk-implement-task <id>` [deprecated] | Legacy: Execute all tasks from tasks.md phase-by-phase |
| 10 | `/tdk-analyze <id>` | Cross-artifact consistency and quality analysis |
| 11 | `/tdk-status <id>` | Show workflow progress (read-only, any time) |
| 12 | `/tdk-checklist <id> [focus]` | Generate quality checklist for requirements |
| 13 | `/tdk-constitution` | Create/update project architecture principles |
| — | **Unit Testing** | |
| 15 | `/tdk-ut-backfill-auto <id>` | Automated full unit test workflow |
| 16 | `/tdk-ut-backfill-plan <id>` | Generate unit test plan and phase files |
| 17 | `/tdk-ut-backfill-impl <id>` | Generate test code from UT plan |
| — | **Config & Workspace** | |
| 20 | `/tdk-config-diff` | Compare workspace vs sub-workspace docs |
| 21 | `/tdk-config-sync` | Sync docs between workspace and sub-workspaces |
| 22 | `/tdk-config-index` | Generate/update document manager index |
| 23 | `/tdk-sub-workdspace-init` | Initialize a new sub-workspace |
| 24 | `/tdk-sub-workdspace-list` | List all configured sub-workspaces |
| 25 | `/tdk-sub-workdspace-sync` | ~~Deprecated~~ → use `/tdk-config-sync` instead |
| — | **Design Documents** | |
| 26 | `/tdk-batch-design <id>` | Generate batch processing design document for approval |
| — | **Test Viewpoints** | |
| 27 | `/tdk-test-viewpoint <id>` | Generate high-level test viewpoints (観点) from spec |
| — | **Primary Implementation** | |
| 28 | `/tdk-implement-from-plan <id>` | Execute implementation directly from plan.md ## Phases (recommended) |

---

## Quick Start

Follow this walkthrough to develop your first feature end-to-end.

### Prerequisites

- **Claude Code** installed ([installation guide](https://docs.anthropic.com/en/docs/claude-code))
- **Git Bash** on Windows (included with Git for Windows)
- Project initialized with `.specify/.specify.env` configuration file

### Step 1 — Specify the feature

```
/tdk-specify feat-001 Add user avatar upload with image cropping
```

This creates `.specify/specs/feat-001/spec.md` with user stories, requirements, and acceptance criteria. Answer any clarifying questions Claude asks (up to 3).

### Step 2 — Clarify gaps (optional but recommended)

```
/tdk-clarify feat-001
```

Claude identifies underspecified areas and asks up to 5 targeted questions. Answers are encoded back into `spec.md`.

### Step 3 — Plan the implementation

```
/tdk-plan feat-001
```

Generates `plan.md` with architecture decisions, file structure, tech stack, and design artifacts (`data-model.md`, `contracts/`, `research.md`). The plan includes a `## Phases` table for implementation.

### Step 4 — Implement (Recommended Path)

```
/tdk-implement-from-plan feat-001
```

Executes implementation directly from `plan.md ## Phases` table. Lightweight approach for small to medium features. Marks completion via status comments in `plan.md`. UT phases auto-delegate to `/tdk-ut-backfill-auto`.

### Step 4 (Alternative) — Generate tasks [deprecated]

For larger projects with many dependencies, use the legacy task-based path:

```
/tdk-tasks feat-001
```

[deprecated — legacy path] Creates `tasks.md` with phased, dependency-ordered tasks. Each task has an ID, description, file paths, and parallel markers `[P]`.

Then:

```
/tdk-implement-task feat-001
```

[deprecated — legacy path] Executes all tasks phase-by-phase: setup → tests → core → integration → polish. Marks completed tasks `[X]` in `tasks.md`. UT phases auto-delegate to `/tdk-ut-backfill-auto`.

### Step 5 — Run unit tests (optional)

```
/tdk-ut-backfill-auto feat-001 --sub-workspace backend
```

Reads UT conventions from the consumer UT skill, creates test plan, and generates test code. See [04-unit-testing-full-pipeline.md](scenarios/04-unit-testing-full-pipeline.md) for a detailed walkthrough.

### Check progress any time

```
/tdk-status feat-001
```

Shows a progress bar, completed/remaining phases, and recommendations.

### Artifacts produced (Primary Path)

```
.specify/specs/feat-001/
├── spec.md              ← Step 1
├── plan.md              ← Step 3 (includes ## Phases table)
├── research.md          ← Step 3 (if needed)
├── data-model.md        ← Step 3 (if needed)
├── contracts/           ← Step 3 (if needed)
└── checklists/          ← /tdk-checklist (optional)
```

**Legacy Path** (optional, when using `/tdk-tasks` + `/tdk-implement-task`):
```
├── tasks.md             ← Step 4 [deprecated]
```

---

## Command Reference

### Core Commands

| Command | Syntax | Key Flags | Input | Output | Depends On |
|---------|--------|-----------|-------|--------|------------|
| specify | `/tdk-specify <id> <desc>` | — | `.specify.env` | `spec.md`, `checklists/requirements.md` | None (start here) |
| specify-fast | `/tdk-specify-fast <id> <desc>` | — | `.specify.env` | `spec.md`, `checklists/requirements.md` | None |
| clarify | `/tdk-clarify <id>` | — | `spec.md` | `spec.md` (updated) | specify |
| ba-requirement | `/tdk-ba-requirement <id>` | `--figma-pc`, `--figma-sp`, `--output` | `spec.md` | `ba-requirement.md` | clarify |
| plan | `/tdk-plan <id>` | — | `spec.md`, `ba-requirement.md` | `plan.md` (with ## Phases table), `research.md`, `data-model.md`, `contracts/` | ba-requirement |
| api-design | `/tdk-api-design <id>` | `--scenario A|B` | `spec.md`, `research.md` | `api_design.md` (incl. DB schema) | plan |
| tasks [deprecated] | `/tdk-tasks <id>` | — | `plan.md`, `spec.md` | `tasks.md` | plan |
| implement-from-plan | `/tdk-implement-from-plan <id>` | — | `plan.md` | Source code, `plan.md` (with status markers) | plan |
| implement-task [deprecated] | `/tdk-implement-task <id>` | — | `tasks.md`, `plan.md` | Source code, `tasks.md` (marked `[X]`) | tasks |
| analyze | `/tdk-analyze <id>` | — | `spec.md`, `plan.md`, `tasks.md` (legacy) or `plan.md ## Phases` | Report (no file created) | plan or tasks |
| status | `/tdk-status <id>` | — | Feature directory | Progress report (no file created) | specify |

### UT Commands

| Command | Syntax | Key Flags | Input | Output | Depends On |
|---------|--------|-----------|-------|--------|------------|
| ut:auto | `/tdk-ut-backfill-auto <id>` | `--sub-workspace`, `--skip-run`, `--plan-only`, `--force` | `spec.md` (opt), consumer UT skill | `ut-plan.md`, phase files, test files | None |
| ut:plan | `/tdk-ut-backfill-plan <id>` | `--sub-workspace`, `--review`, `--force`, `--standalone` | `spec.md` (opt), consumer UT skill | `ut-plan.md`, `ut-phase-*.md` | None |
| ut:generate | `/tdk-ut-backfill-impl <id>` | `--sub-workspace` | `ut-plan.md`, `ut-phase-*.md`, consumer UT skill | Test files (`.test.ts`, `test_*.py`, etc.) | ut:plan |

### Config Commands

| Command | Syntax | Key Flags | Input | Output | Depends On |
|---------|--------|-----------|-------|--------|------------|
| config:diff | `/tdk-config-diff` | `--sub-workspace` (required), `--detailed` | Workspace + sub-workspace docs | Diff table (no file) | sub-workspace:init |
| config:sync | `/tdk-config-sync` | `--from-sub-workspace`, `--to-sub-workspace`, `--all`, `--force`, `--dry-run` | Docs paths | Synced files | sub-workspace:init |
| config:index | `/tdk-config-index` | `--sub-workspace`, `--full` | All docs files | `document-manager.md` | None |

### Sub-workspace Commands

| Command | Syntax | Key Flags | Input | Output | Depends On |
|---------|--------|-----------|-------|--------|------------|
| sub-workdspace:init | `/tdk-sub-workdspace-init [name]` | — | Project config | `.specify.yaml`, `rules.md` | None |
| sub-workdspace:list | `/tdk-sub-workdspace-list` | — | `.specify.yaml` | Table display (no file) | sub-workspace:init |
| sub-workdspace:sync | `/tdk-sub-workdspace-sync` | — | — | — | **Deprecated** → `/tdk-config-sync` |

### Other Commands

| Command | Syntax | Key Flags | Input | Output | Depends On |
|---------|--------|-----------|-------|--------|------------|
| constitution | `/tdk-constitution [principles]` | — | `constitution.md`, templates | `constitution.md` (created/updated) | None (project-level) |
| checklist | `/tdk-checklist <id> [focus]` | — | `spec.md`, `plan.md` (opt) | `checklists/{domain}.md` | specify |

### Design Document Commands

| Command | Syntax | Key Flags | Input | Output | Depends On |
|---------|--------|-----------|-------|--------|------------|
| batch-design | `/tdk-batch-design <id>` | `--scenario A\|B` | `spec.md`, `research.md`, `data-model.md` | `batch-design.md` | plan |
| test-viewpoint | `/tdk-test-viewpoint <id>` | — | `spec.md`, `ba-requirement.md` | `test-viewpoint.csv` | ba-requirement |

**`/tdk-batch-design` scenarios:**

| Scenario | Trigger | Data Sources |
|----------|---------|--------------|
| **A: New Batch** | No existing endpoint impact | spec.md, research.md |
| **B: With Impact** | Modifies/extends existing batch or tables | spec.md, data-model.md, research.md |

Detection: `--scenario A|B` flag explicit, else `research.md` exists → B, otherwise → A.

### Primary Implementation Path

| Command | Syntax | Key Flags | Input | Output | Depends On |
|---------|--------|-----------|-------|--------|------------|
| implement-from-plan | `/tdk-implement-from-plan <id>` | — | `plan.md` with ## Phases | Source code, `plan.md` (with status markers) | plan |

`/tdk-implement-from-plan` reads the `## Phases` table from `plan.md` and executes implementation phase-by-phase, marking completion via `<!-- status:done -->` comments. Best for small/medium features completable in one session.

**Re-running `/tdk-plan` after implementation:**
- **(a) Update phases only** — When feature scope expands or phases change: re-run `/tdk-plan <id>` (overwrites plan.md; you lose status markers)
- **(b) Append new phases** — When adding follow-up work: manually add rows to the existing `## Phases` table in plan.md, then resume with `/tdk-implement-from-plan <id>`

### Legacy Implementation Path [deprecated]

For complex features with many dependencies, the legacy task-based pipeline remains available:

| Command | Syntax | Key Flags | Input | Output | Depends On |
|---------|--------|-----------|-------|--------|------------|
| tasks [deprecated] | `/tdk-tasks <id>` | — | `plan.md` | `tasks.md` | plan |
| implement-task [deprecated] | `/tdk-implement-task <id>` | — | `tasks.md`, `plan.md` | Source code, `tasks.md` (marked `[X]`) | tasks |

Use `/tdk-tasks` → `/tdk-implement-task` only if you need granular, dependency-ordered task tracking that exceeds what plan.md ## Phases provides.

## Document Flow

See [tdk-document-flow.md](document-flow.md) for full Mermaid flow diagrams showing input/output relationships between all commands and artifacts.

**Summary flow (Primary Path):**
```
req → /specify → spec.md → /clarify → spec.md (clarified)
  → /ba-requirement → ba-requirement.md (Approval)
  → /plan → plan.md (with ## Phases table), research.md, data-model.md, contracts/, wireframes/
  → /api-design → api_design.md (Approval)
  → /batch-design → batch-design.md (Approval)
  → /db-design → db_design.md (Approval)
  → /implement-from-plan → source code
```

**Legacy flow** [deprecated]:
```
  → /plan → plan.md, research.md, data-model.md, contracts/, wireframes/
  → /tasks → tasks.md → /implement-task → source code
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

### Day-to-Day

| # | Scenario | When to use | Link |
|---|----------|-------------|------|
| 9 | Progress Tracking | Check where you left off | [09-progress-tracking.md](scenarios/09-progress-tracking.md) |
| 10 | Mid-Development Changes | Requirements changed mid-feature | [10-mid-development-changes.md](scenarios/10-mid-development-changes.md) |
| 11 | Resume Existing Feature | Continue work after a break | [11-resume-existing-feature.md](scenarios/11-resume-existing-feature.md) |

---

## Tips & Best Practices

### Workflow Efficiency

- **Start with `specify-fast`** for small, well-understood features. Use full `specify` when scope is unclear and brainstorm exploration helps.
- **Always run `clarify`** before `plan` — it catches ambiguities early, saving rework during implementation.
- **Run `analyze` before `implement`** — it catches spec-plan-tasks inconsistencies that would cause bugs.
- **Use `status` liberally** — it's read-only and shows what's done vs. remaining.

### Common Flag Patterns

| Flag | Used by | Purpose |
|------|---------|---------|
| `--sub-workspace <name>` | ut:*, config:* | Target a specific sub-workspace (e.g., `frontend`, `backend`) |
| `--force` | ut:auto, ut:plan, config:sync | Overwrite existing artifacts without confirmation |
| `--dry-run` | config:sync | Preview changes without writing files |
| `--standalone` | ut:plan | Generate UT plan for existing code without spec |
| `--review` | ut:plan | Review and update existing UT plan |

### When to Skip Optional Commands

| Command | Skip when... |
|---------|-------------|
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
| "Task ID already exists" | Feature directory already created | Work on existing feature or use a different ID |
| "No UT skill found" | Running UT commands without a consumer UT skill | Create one in `.claude/skills/{name}/SKILL.md` with UT conventions |
| "tasks.md not found" [legacy] | Running `/tdk-implement-task` before `/tdk-tasks` | Run `/tdk-tasks <id>` first (legacy path) |
| Script execution fails | Git Bash not available on Windows | Install Git for Windows (includes Git Bash) |
| "Feature not found" | Wrong task ID or folder | Check `.specify/specs/` for existing features; verify prefix in `.specify.env` |
| Checklist gate blocks implement | Incomplete checklist items | Complete checklist items or confirm to proceed when prompted |

### Command Order Quick Reference

If you get a "not found" error, follow this dependency chain:

**Primary (Recommended) Path:**
```
constitution (optional, project-level)
     ↓
specify or specify-fast  →  clarify (optional)  →  checklist (optional)
     ↓
ba-requirement (for Approval)  →  test-viewpoint (optional)
     ↓
   plan (generates ## Phases table)  →  api-design  →  batch-design  →  db-design (as needed)
     ↓
 implement-from-plan  →  status (any time)
```

**Legacy Path [deprecated]:**
```
   plan  →  api-design  →  batch-design  →  db-design (as needed)
     ↓
   tasks  →  analyze (optional)
     ↓
 implement-task  →  status (any time)
```

Each command requires the output of commands above it in the chain.

---

*¹ The term "skill" comes from Claude Code's internal architecture where commands are defined as skill files. For all practical purposes, "command" and "skill" are interchangeable when referring to `/tdk-*` items.*
