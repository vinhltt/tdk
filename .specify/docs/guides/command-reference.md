# Tihon Command Suite Guide

> **Last updated**: 2026-06-05
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
| Commands | 9 | 18 | **13** (11 TS + 2 bash fallback) |
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

  Phase 0                Phase 1              Phase 2                Phase 3
  ┌──────────────┐    ┌──────────┐    ┌────────────────┐    ┌───────────────────┐
  │   specify    │───>│ clarify  │───>│      plan      │───>│implement│
  │  (--fast)    │    │ (should) │    │                │    │                   │
  └──────────────┘    └──────────┘    └────────────────┘    └───────────────────┘
         │                  │                │                       |
         v                  v                v                       |
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

**Primary flow**: `specify` → `clarify` → `plan` → `implement`

Each command reads the output of the previous one, building a chain of artifacts: `spec.md` → `plan.md` (with ## Phases table) → source code.

---

## Cheat Sheet

| # | Command | Description |
|---|---------|-------------|
| 1 | `/tdk-specify <id> <desc>` | Create feature specification from natural language |
| 2 | `/tdk-specify <id> <desc> --fast` | Quick specification (skips brainstorm, fewer tokens) |
| 3 | `/tdk-clarify <id>` | Ask up to 5 targeted questions to fill spec gaps |
| 4 | `/tdk-ba-requirement <id>` | Generate BA requirement document for stakeholder approval |
| 5 | `/tdk-plan <id> [content] [flags]` | Generate implementation plan with design artifacts |
| 6 | `/tdk-api-design <id>` | Generate detailed API design (Scenario A/B) with DB schema for approval |
| 10 | `/tdk-analyze <id>` | Cross-artifact consistency and quality analysis |
| 11 | `/tdk-status <id>` | Show workflow progress (read-only, any time) |
| 12 | `/tdk-checklist <id> [focus]` | Generate quality checklist for requirements |
| 13 | `/tdk-constitution [--init <brief|file>]` | Create/update project architecture principles and initialize project memory artifacts |
| — | **Unit Testing** | |
| 16 | `/tdk-ut-backfill-plan <id>` | Generate unit test plan and phase files |
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
| 28 | `/tdk-implement <id> [--phase NN]` | Execute implementation directly from plan.md ## Phases (recommended) |

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

Generates `plan.md` with architecture decisions, file structure, tech stack, and design artifacts (`data-model.md`, `contracts/`, `research/`). The plan includes a `## Phases` table for implementation.

### Step 4 — Implement (Recommended Path)

```
/tdk-implement feat-001
```

Executes implementation directly from `plan.md ## Phases` table. Lightweight approach for small to medium features. Marks completion in the `plan.md` phases table. UT phase files delegate to the consumer test skill listed in `## Delegate Skills`.

To execute one phase only:

```
/tdk-implement feat-001 --phase 03
```

Selected mode still honors dependencies and stale `in_progress` recovery.

### Step 5 — Run unit tests (optional)

Map the `test` domain in `{docs.path}/custom-workflow/plan-skill-routing.md`, then run:

```
/tdk-implement feat-001
```

`/tdk-plan` triggers `/tdk-ut-backfill-plan` when UT planning is needed. The generated `ut/phases/*.md` files delegate implementation to the routed consumer test skill. See [04-unit-testing-full-pipeline.md](scenarios/04-unit-testing-full-pipeline.md) for a detailed walkthrough.

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
├── research/            ← Step 3 (if needed)
├── data-model.md        ← Step 3 (if needed)
├── contracts/           ← Step 3 (if needed)
└── checklists/          ← /tdk-checklist (optional)
```

---

## Command Reference

### Core Commands

| Command | Syntax | Key Flags | Input | Output | Depends On |
|---------|--------|-----------|-------|--------|------------|
| specify | `/tdk-specify <id> <desc>` | — | `.specify.env` | `spec.md`, `checklists/requirements.md` | None (start here) |
| specify (fast) | `/tdk-specify <id> <desc> --fast` | `--fast` | `.specify.env` | `spec.md`, `checklists/requirements.md` | None |
| clarify | `/tdk-clarify <id>` | — | `spec.md` | `spec.md` (updated) | specify |
| ba-requirement | `/tdk-ba-requirement <id>` | `--figma-pc`, `--figma-sp`, `--output` | `spec.md` | `ba-requirement.md` | clarify |
| plan | `/tdk-plan <id> [content] [flags]` | `--fast`, `--hard`, `--red-team`, `--validate` | `spec.md`, `ba-requirement.md` | `plan.md` (with ## Phases table), `research/`, `data-model.md`, `contracts/` | ba-requirement |
| api-design | `/tdk-api-design <id>` | `--scenario A|B` | `spec.md`, `research/` | `api_design.md` (incl. DB schema) | plan |
| implement | `/tdk-implement <id> [--phase NN]` | `--phase NN` | `plan.md` | Source code, `plan.md` Status column | plan |
| analyze | `/tdk-analyze <id>` | — | `spec.md`, `plan.md ## Phases` | Report (no file created) | plan |
| status | `/tdk-status <id>` | — | Feature directory | Progress report (no file created) | specify |

`/tdk-plan` accepts freeform content after `<id>` in every mode. Default, `--fast`, and `--hard` treat content as planning instruction; `--red-team` treats it as review focus; `--validate` treats it as validation focus. Known mode flags can appear after `<id>` before or after the content.

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

### Harness CLI Commands

| Command | Syntax | Key Flags | Input | Output | Depends On |
|---------|--------|-----------|-------|--------|------------|
| harness install | `tdk harness install --harness claude` or `--harness codex` | `--plugins`, `--all-plugins`, `--prefix`, `--dry-run`, `--yes` | TDK plugin source under `.specify/plugins/`; Codex uses generated packages under `.specify/codex-plugins/` | Managed `.claude/` artifacts or `.agents/skills/` + `.codex/` artifacts + ownership manifest | setup |
| harness convert | `tdk harness convert` | `--plugins`, `--all-plugins`, `--dry-run`, `--check` | Maintainer source tree `.specify/plugins/tdk-*` | Generated per-plugin packages under `.specify/codex-plugins/<plugin>/` (official OpenAI layout); `--check` fails on drift | source tree |
| harness convert-flat | `tdk harness convert-flat [root]` | `--dry-run`, `--force`, `--yes` | Existing flat `.claude/` tree | Additive `.codex/` + `.agents/skills/` artifacts + `.specify/state/harness-install/codex.json` ownership manifest | setup |

`harness convert` is source-tree/maintainer-only. Consumer payloads install the generated `.specify/codex-plugins/<plugin>/` packages with `harness install --harness codex`; install never re-transforms source.

`harness install --harness codex` verifies generated-package checksums from `.specify/codex-plugins/manifest.json`, writes skills to `.agents/skills/` and hooks/lib under `.codex/`, generates `.codex/agents/*.toml` and `.codex/config.toml` at install time from plugin source agents, and rejects combined `--harness claude,codex` in v1.

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
| constitution | `/tdk-constitution [principles]` | — | `constitution.md`, templates | `constitution.md` (created/updated) | None (project-level) |
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
| Script execution fails | Git Bash not available on Windows | Install Git for Windows (includes Git Bash) |
| "Feature not found" | Wrong task ID or folder | Check `.specify/specs/` for existing features; verify prefix in `.specify.env` |
| Checklist gate blocks implement | Incomplete checklist items | Complete checklist items or confirm to proceed when prompted |

### Command Order Quick Reference

If you get a "not found" error, follow this dependency chain:

**Primary (Recommended) Path:**
```
constitution (optional, project-level)
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
