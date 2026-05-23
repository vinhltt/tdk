---
name: tdk-plan
description: "Execute the implementation planning workflow using the plan template to generate design artifacts."
metadata:
  version: "2.1.0"
---

## ⛔ CRITICAL: Error Handling

**If ANY script returns an error, you MUST:**
1. **STOP immediately** — Do NOT attempt workarounds or auto-fixes.
2. **Report the error** — Show the exact error message to the user.
3. **Wait for user** — Ask user how to proceed before taking any action.

**DO NOT:**
- Try alternative approaches when scripts fail.
- Create branches manually when script validation fails.
- Guess or assume what the user wants after an error.
- Continue with partial results.

---

## User Input

```text
$ARGUMENTS
```

You **MUST** consider the user input before proceeding (if not empty).

## Core Principles

**YAGNI · KISS · DRY.** Implement only what is required. Prefer simple over clever. Single source of truth. Be honest, brutal, straight to the point, and concise.

## Boundary Declaration

**This command produces:**
- Implementation plan (`plan.md`)
- Research documentation (`research.md`)
- Data models (`data-model.md`)
- API contracts (`contracts/`)

**This command does NOT:**
- Write implementation code.
- Execute tests.
- Create PRs or commits.
- Write unit tests (delegates UT planning to `/tdk-ut-backfill-plan`; UT execution handled by `/tdk-implement-from-plan`).

## When to Use

- Plan a new feature implementation.
- Architect a system design.
- Evaluate technical approaches.
- Break down complex requirements into ordered phases.

## Process Flow (Authoritative)

```mermaid
flowchart TD
    A[Step 0 Parse Args + Validate TASK_ID] --> B[Step 0.1 Load Project Context]
    B --> B2[Step 0.1b Load Skill Routing]
    B2 --> C[Step 0.memory Memory Pre-load]
    C --> S[Step 0.scope Scope Challenge]
    S --> X[Step 0.deps Cross-Plan Scan]
    X --> D[Step 1 Setup]
    D --> E{planExists?}
    E -->|yes| F[Step 1.5 Handle Existing Plan]
    E -->|no| M[Step 1.7 Mode Detection]
    F --> M
    M -->|red-team / validate| RT[Phase 06 / 07 short-circuit]
    M -->|default / fast / hard| G[Step 2 Load Context]
    G --> H[Step 3 Execute Plan Workflow]
    H --> I[Phase 0.guardian]
    I --> J[Step 4 Report Results]
    J --> RT2[Step 4.5 Red Team Review]
    RT2 --> V[Step 4.7 Validation Interview]
```

**This diagram is the authoritative workflow.** Prose sections below provide detail per node.

## Workflow

### Step 0 — Parse Arguments & Validate Task ID
**Inline.** <!-- safety-critical: deterministic split before any script invocation -->
Split `$ARGUMENTS` into `TASK_ID` (first positional) and `FLAGS` (remaining `--[a-z-]+` tokens). Reject anything else with STOP. Allowed flags: `--fast | --hard | --red-team | --validate` — mutually exclusive. Multiple flags or unknown flag → STOP with explicit error (see `references/modes.md`). Then invoke `tdk-validate-task-id` with `TASK_ID` and host skill name `/tdk-plan`. If STOP → halt. Store: `TASK_ID`, `TASK_ID_SOURCE`, `FLAGS`.

### Step 0.1 — Load Project Context
**Inline.** <!-- script invocation -->
Invoke `tdk-load-project-context` with the validated `TASK_ID`. Store: `PROJECT_CONTEXT`, `FEATURE_DIR`.

### Step 0.1b — Load Skill Routing
Load: `references/skill-routing.md`
Resolve skill-routing file per reference. Parse sub-workspace sections. Store: `SKILL_ROUTING` map. Missing file → AskUserQuestion per reference (opt-in create or skip with empty map).

### Step 0.memory — Memory Pre-load
Load: `references/gates.md`
Run only if `.specify/memory/memory-index.md` exists. Pre-load Context Block; carry it forward to Phase 0.guardian. Non-blocking — continue on failure.

### Step 0.scope — Scope Challenge
Load: `references/scope-challenge.md`
Skip if `--fast`, spec.md `$ARGUMENTS` <20 words, "just plan / quick / already decided" signals, or prior scope already recorded. Otherwise: 3-question batched AskUserQuestion → route EXPANSION / HOLD / REDUCTION → write `scope_mode:` + append `## Scope Challenge` session block.

### Step 0.deps — Cross-Plan Dependencies Scan
Load: `references/cross-plan-deps.md`
Skip if `--fast` in `FLAGS` (Step 1.7 hasn't resolved `MODE` yet at this point in the flow). Otherwise invoke `bun .specify/scripts/ts/src/commands/util/scan-cross-plan-deps.ts --current <TASK_ID> --json`, parse findings, optionally auto-fix D1 bidirectional gaps via AskUserQuestion + dirty-tree gate (Validation S3 D12). Advisory only — never STOPs plan creation.

### Step 1 — Setup
**Inline.** <!-- safety-critical script invocation -->
Run `cd $CLAUDE_PROJECT_DIR/.specify/scripts/ts && bun src/commands/util/setup-plan.ts {task_id} --json` from repo root. Parse JSON for `taskId`, `featureSpec`, `implPlan`, `featureDir`, `hasGit`, **`planExists`**.

### Step 1.5 — Handle Existing Plan
Load: `references/handle-existing-plan.md`
**Trigger:** only if `planExists == "true"`. Implements Rewrite / Append / Abort + F13 Soft Dirty Guard + F19 Lowercase Enforcement + Phase File Content Template.

### Step 1.7 — Mode Detection
Load: `references/modes.md`
Resolve `MODE` from `FLAGS`: `fast` | `hard` | `red-team` | `validate` | `default` (no flag). Conflict / unknown → already STOPped at Step 0. `--red-team` / `--validate` short-circuit to Phase 06 / 07 over the existing plan and skip Steps 2–4. Other modes continue to Step 2.

### Step 2 — Load Context
Load: `references/gates.md`
Read `featureSpec` and `.specify/memory/constitution.md`. Apply Constitution Check + Skip Conditions. Choose UPDATE vs REGENERATE mode based on Step 1.5 outcome. Per-step skip rules under each mode are defined in `references/modes.md`.

**New spec format sections to read**: ## 1. Problem Statement, ## 2. Scope Boundary, ## 3. Impact Surface, ## 5. User Requirements & Testing (with `[sw/module]` tags), ## 6. Functional Requirements (with tags), ## 7. Success Criteria, ## 8. Risks & Mitigations.

### Step 3 — Execute Plan Workflow

#### 3a — Research
Load: `references/research-phase.md`

#### 3b — Design
Load: `references/design-phase.md`
Includes Solution Design, Embedded Brainstorming, Sequential Thinking for phase decomposition, and UT Phase Auto-inclusion.

#### 3c — Plan Layout & Output
Load: `references/plan-organization.md`
Load: `references/output-standards.md`
Reserves the closed YAML frontmatter schema (S3.F6). Quality checklist + Decisions Made table + sanitization rules.

### Phase 0.guardian — Business Logic Validation
Load: `references/gates.md` <!-- semantics in same file as Step 0.memory -->
Spawn `memory-guardian` agent. Read Guardian Report; act per `BLOCK_IMPL` / `REVIEW` / `CLEAR` outcome.

### Step 4 — Report Results
**Inline.** <!-- terminal output, <10 lines -->
Command ends after Phase 1 design. Report: branch, `implPlan` path, generated artifacts, `## Decisions Made` summary. When `MODE != default`, print the one-line banner from `references/modes.md` (e.g. `Mode: fast — research / scope / deps / red-team / validate / UT skipped.`).

### Step 4.5 — Red Team Review
Load: `references/red-team-workflow.md`
Skip if `MODE in {default, fast}` AND `--red-team` not set. Otherwise spawn the 3 hostile personas (skeptic + security + reliability) in parallel, adjudicate via markdown-table + free-text reply, apply accepted findings as session-prefixed markers, append `## Red Team Review` to `plan.md`. Bumps `red_team_session: N`.

### Step 4.7 — Validation Interview
Load: `references/validate-workflow.md`
Skip if `MODE == "fast"`. Otherwise: orphan-detect any prior `(in-progress)` session (Resume / Discard / Cancel via AskUserQuestion + trust-ask). On fresh run, prompt user `Run validation interview? [y/N]` (auto-yes on `--validate` action). Generate 3–8 questions via template framework, batch in groups of 4, write `## Validation Log` with `(in-progress) → (completed | partial)` marker + `validation_cursor` resume state. Bumps `validation_session: N`.

## Reference Stub Safety

References under `references/` may be **stubs** populated by later phases of the hybrid refactor. As of this commit, all current references are filled; the marker check below remains in force as a defensive policy for any future stubs added by downstream phases. Before issuing any new `Load: references/X.md` directive, the orchestrator MUST `head -1` the target and STOP with a user-friendly message if it begins with `<!-- DO NOT LOAD`.

## Subcommands

| Command | Reference | Purpose |
|---------|-----------|---------|
| `/tdk-plan <ID> --red-team` | `references/red-team-workflow.md` | Spawn 3 hostile personas (skeptic + security + reliability), adjudicate findings, apply session-prefixed markers. |
| `/tdk-plan <ID> --validate` | `references/validate-workflow.md` | Template-based 3–8 question interview across 8 categories (3 tdk-prioritized + 5 ck-plan). Resume-able via `validation_cursor`. |

<!-- Phase 01 intentionally created the table with header only (F13 + S2.F1); rows populate as features ship. -->

## Quality Standards

- Thorough and specific; long-term maintainability over cleverness.
- Address security and performance concerns up front.
- Detailed enough for a junior developer to execute.
- Validate against existing codebase patterns and constitution.

## Key Rules

- Use absolute paths in plan artifacts.
- ERROR on gate failures or unresolved clarifications — see `references/gates.md`.

**Remember:** plan quality determines implementation success.
