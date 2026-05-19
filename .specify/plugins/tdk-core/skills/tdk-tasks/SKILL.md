---
name: tdk-tasks
description: "[deprecated - scheduled for removal in future version] Generate an actionable, dependency-ordered tasks.md for the feature based on available design artifacts."
metadata: 
  version: "1.0.5"
---

## ⛔ CRITICAL: Error Handling

**If ANY script returns an error, you MUST:**
1. **STOP immediately** - Do NOT attempt workarounds or auto-fixes
2. **Report the error** - Show the exact error message to the user
3. **Wait for user** - Ask user how to proceed before taking any action

**DO NOT:**
- Try alternative approaches when scripts fail
- Create branches manually when script validation fails
- Guess or assume what the user wants after an error
- Continue with partial results

---

## User Input

```text
$ARGUMENTS
```

You **MUST** consider the user input before proceeding (if not empty).

## Skill References

<!-- from: .claude/skills/common/references/principles.md -->
### Core Principles

**YAGNI (You Aren't Gonna Need It)**
- Implement only what is explicitly required
- No speculative features
- Question every addition: "Is this needed NOW?"

**KISS (Keep It Simple, Stupid)**
- Prefer simple solutions over clever ones
- Break complex tasks into smaller steps
- Avoid premature optimization

**DRY (Don't Repeat Yourself)**
- Extract common patterns into reusable components
- Reference existing solutions before creating new
- Maintain single source of truth

<!-- from: .claude/skills/planning/SKILL.md -->
### Planning Framework

**Purpose:** Transform requirements into actionable implementation plans.
**Boundary:** This skill produces PLANS only. No code implementation.
**Be honest, brutal, straight to the point, and concise.**

**Workflow:**
1. Research - Gather context, resolve unknowns (use @workspace, gh, repomix)
2. Design - Architecture decisions, data models, trade-offs
3. Decompose - Break into phases with clear deliverables
4. Document - Create plan files with success criteria

**Subagent Delegation:** Delegate → output to file → user continues manually → main agent reads output.

### Sequential Thinking (Task Ordering)

**Trigger:** During task generation workflow (Step 3).
**Technique:** Apply structured reasoning for dependency-aware ordering:
1. List all implementation units from plan phases + spec requirements
2. For each unit, identify: inputs (what it depends on) and outputs (what depends on it)
3. Build dependency graph: unit A -> unit B means A must complete before B
4. Topological sort: order tasks respecting all dependencies
5. Identify critical path: longest chain of sequential dependencies
6. Detect parallel opportunities: tasks with no mutual dependencies
7. Validate: no circular dependencies, every task reachable from setup phase

## Boundary Declaration

> **[deprecated]** This skill is scheduled for removal in a future version. Prefer `/tdk-plan` which generates `plan.md` with `## Phases` table as the canonical task source of truth.

**This command produces:**
- Task breakdown (tasks.md)
- Dependency graph
- Parallel execution markers [P]
- Phase organization

**This command does NOT:**
- Implement tasks (use /tdk-implement-from-plan primary, or /tdk-implement-task for legacy)
- Generate tests (use /ut.generate)
- Create plans (use /tdk-plan)

## Skip Conditions

- **Skip optional docs loading if:** Only plan.md and spec.md needed

## Quality Gates

### Before Task Generation
- [ ] plan.md exists and complete
- [ ] spec.md exists with user stories
- [ ] Tech stack identified in plan

### Before Completion
- [ ] All tasks have clear file paths
- [ ] Tasks organized by user story
- [ ] Checkboxes format: `- [ ] [P{N}T{NN}] [P?] [Story?] Description`
- [ ] Dependencies documented

## Outline
### Step 0 — Validate Task ID
Invoke `tdk-validate-task-id` with `$ARGUMENTS` and host skill name `/tdk-tasks`.
If STOP → halt execution.
Store: `TASK_ID`, `TASK_ID_SOURCE`.

### Step 0.1 — Load Project Context
Invoke `tdk-load-project-context` with validated `TASK_ID`.
Store: `PROJECT_CONTEXT`, `FEATURE_DIR`.

### Step 1: Setup

Run `cd $CLAUDE_PROJECT_DIR/.specify/scripts/ts && bun src/commands/util/check-prerequisites.ts {task_id} --json` from repo root (pass the validated task_id from Step 0). Parse JSON for taskId, featureDir, availableDocs.

2. **Load design documents**: Read from FEATURE_DIR:
   - **Required**: plan.md (tech stack, libraries, structure), spec.md (user stories with priorities)
   - **Optional**: data-model.md (entities), contracts/ (API endpoints), research.md (decisions), quickstart.md (test scenarios)
   - Note: Not all projects have all documents. Generate tasks based on what's available.

3. **Execute task generation workflow**:
   - Load plan.md and extract tech stack, libraries, project structure
   - Load spec.md and extract user stories with their priorities (P1, P2, P3, etc.)
   - If data-model.md exists: Extract entities and map to user stories
   - If contracts/ exists: Map endpoints to user stories
   - If research.md exists: Extract decisions for setup tasks
   - Generate tasks organized by user story (see Task Generation Rules below)
   - **Apply Sequential Thinking for Task Ordering:**
     - Before finalizing task order, reason through dependencies step-by-step
     - Identify critical path (longest sequential chain) and note in tasks.md
     - Mark parallel opportunities with [P] based on dependency analysis
     - Add `## Critical Path` section to tasks.md output showing the longest dependency chain
   - Generate dependency graph showing user story completion order
   - Create parallel execution examples per user story
   - Validate task completeness (each user story has all needed tasks, independently testable)

3.5. **Detect existing tasks (Diff Mode)**:
   - Read `FEATURE_DIR/tasks.md`
   - If file does NOT exist → set `MODE = GENERATE`, skip to item 4
   - If file EXISTS → continue to phase diff analysis:

   **A. Parse existing task phases**:
   For each `## Phase N:` header in tasks.md, extract:
   - Phase number and title
   - `**Goal**:` or `**Purpose**:` text (first line after header matching these patterns)
   - `**Ref**:` line (if present) - extract `[[plan#Phase N|...]]` link
   - Count of `[X]` (completed) vs `[ ]` (pending) checkboxes
   - Whether phase has status override (e.g., "ALREADY COMPLETED", "DONE", "SKIPPED")

   **B. Parse plan.md implementation phases**:
   Scan for phase headers using fallback: `## Implementation Phases` section → `## Phase N:` headers → `### Phase N:` headers at any level. Extract:
   - Phase number and title
   - Goal/purpose text

   **C. Phase-level diff (Goal Matching Algorithm)**:
   > **Note**: Matching is content-based (ref links, goals, titles), NOT ordinal position. If plan.md phases are inserted/deleted/renumbered, matching still works because Tier 1 follows ref link content and Tier 2-3 compare semantic content.

   For each task phase, attempt to match to a plan phase using this priority:

   **Tier 1 - Ref Link Match (90% confidence)**:
   - Extract `[[plan#Phase N|...]]` from task phase `**Ref**:` line
   - Match to plan phase by number
   - If found → MATCH

   **Tier 2 - Goal Text Match (70% confidence)**:
   - Compare task phase `**Goal**:`/`**Purpose**:` text to plan phase goal text
   - MATCH if ALL of these are true:
     1. Same primary action verb (e.g., "Create", "Register", "Update", "Replace", "Verify")
     2. Same primary target object/component (e.g., "WM2710 types", "CsvWriter", "BizFacade")
   - NOT a match if action verb OR target object differs substantially
   - If found → MATCH

   **Tier 3 - Title Partial Match (50% confidence)**:
   - Compare module names, component names, or domain keywords in phase titles
   - Match if primary subject matches (e.g., "CsvWriter Registration" ↔ "CsvWriter Registration")
   - If found → MATCH (low confidence, flag for user review)

   **Goal Change Detection** (only for matched phases):
   After matching a task phase to a plan phase, compare their goal texts:
   - **Goal changed = YES** if: the primary action verb differs (e.g., "Create" vs "Migrate") OR the target object/component differs (e.g., "CsvWriter" vs "CsvReader") OR the scope fundamentally changed
   - **Goal changed = NO** if: same action + same target + minor wording differences (e.g., "Create WM2710 types" ≈ "Create WM2710 common types")
   - When uncertain, default to NO (prefer REGENERATE for 0-done over losing work)

   **Auto-classification (no per-phase prompts)**:

   | Match? | Has [X]? | Goal changed? | Action | Note |
   |--------|----------|---------------|--------|------|
   | Yes | Yes | No | **PRESERVE** | Keep verbatim |
   | Yes | Yes | Yes | **PRESERVE** | Completed work > goal drift |
   | Yes | No | Yes | **REGENERATE** | Fresh content, goal changed |
   | Yes | No | No | **REGENERATE** | 0 done, regenerate for fresh content |
   | No | Yes | - | **PRESERVE** | Has completed work, keep it |
   | No | No | - | **OBSOLETE** | No plan match, nothing done |
   | - | - | - | **NEW** | Plan phase has no existing tasks |

   **D. Present diff summary + single AskUserQuestion**:
   Print the recommendation table as text output, then use ONE AskUserQuestion:

   ```
   ## Existing tasks.md detected

   | Phase | Match | Done | Recommended | Reason |
   |-------|-------|------|-------------|--------|
   | Phase 1: Setup | - | 4/5 | PRESERVE | Has completed work |
   | Phase 2: Common | Plan P1 | 0/6 | REGENERATE | 0 done, fresh content |
   | Phase 7: Frontend | - | 7/7 | PRESERVE | Fully completed |
   | Phase 9: Polish | - | 0/4 | OBSOLETE | No match, 0 done |
   | (new) CsvWriter | - | - | NEW | New plan phase |
   ```

   AskUserQuestion (1 call, 1 question, 3 options):
   - "Accept recommendations" → apply classification table + reorder phases to match plan.md structure (default)
   - "Keep content, update IDs (append new)" → keep ALL existing phases in original order + content, only append NEW phases at end
   - "Regenerate all" → MODE = GENERATE, discard analysis

   **E. Set mode**:
   - User selects "Accept recommendations" → `MODE = UPDATE`, store classification map
   - User selects "Keep content, update IDs" → `MODE = UPDATE_KEEP_ORDER`, all existing = PRESERVE, store NEW phases list
   - User selects "Regenerate all" → `MODE = GENERATE`, discard analysis

4. **Generate tasks.md** (mode-dependent):

   **Backup** (UPDATE/UPDATE_KEEP_ORDER only): Before writing, copy existing `tasks.md` content to `tasks.md.bak` in same directory. If merge produces bad output, user can restore from backup.

   **If MODE = GENERATE** (fresh generation):
   Use `.specify/templates/tasks-template.md` as structure, fill with:
   - Correct feature name from plan.md
   - Phase 1: Setup tasks (project initialization)
   - Phase 2: Foundational tasks (blocking prerequisites)
   - Phase 3+: One phase per user story (priority order from spec.md)
   - Each phase includes: story goal, independent test criteria, implementation tasks
   - Final Phase: Polish & cross-cutting concerns
   - All tasks use P{N}T{NN} format (P=phase number, T=task within phase, zero-padded)
   - Clear file paths for each task
   - Dependencies section showing phase completion order
   - Parallel execution examples per story
   - Implementation strategy section

   **If MODE = UPDATE** (merge with existing, reorder to plan structure):
   Assemble output in 4 stages:

   **Stage A: Prepend unmatched PRESERVE phases with setup/init nature**
   - Unmatched PRESERVE phases whose title suggests setup, initialization, configuration, or environment preparation
   - Assign phase numbers starting from 1
   - Apply PRESERVE rules (see below)

   **Stage B: Iterate plan.md phases in order**
   For each plan phase, apply classification from Step 3.5:

   - **PRESERVE**: Copy existing phase with minimal renumbering:
     - **Update 3 things**: (1) phase header number, (2) task IDs → P{N}T{NN}, (3) `**Ref**:` plan links → new phase number
     - **Keep verbatim**: descriptions, `[X]`/`[ ]` states, notes, checkpoints, goal text
     - Do NOT change task descriptions, do NOT add/remove tasks
     - **Validation**: count `- [ ]` + `- [X]` lines in input and output — must be equal. If mismatch → flag error and re-copy

   - **REGENERATE**: Generate fresh phase content:
     - Use plan phase goal + spec requirements (same as GENERATE mode for single phase)
     - Assign new P{N}T{NN} IDs
     - Include goal, test criteria, implementation tasks

   - **NEW**: Generate fresh phase content (same rules as REGENERATE)

   **Stage C: Append remaining unmatched PRESERVE phases**
   - Any unmatched PRESERVE phase not placed in Stage A → append here
   - Includes phases with frontend, polish, cleanup, completion, or any other non-setup nature
   - Continue phase numbering from Stage B
   - Apply PRESERVE rules

   **OBSOLETE**: Omitted entirely from output (no plan match, nothing done)

   **Stage E: Auto-generate Polish phase if missing**
   - After Stage C, check if ANY output phase title contains "Polish", "Cleanup", or "Documentation"
   - If NO → auto-generate a final "Polish & Cross-cutting Concerns" phase (same rules as GENERATE mode's Final Phase)
   - If YES → skip (already exists from PRESERVE)

   After all stages, regenerate these sections fresh:
   - `## Dependencies & Execution Order` (reflects final phase set)
   - `## Summary` table (updated counts: total, completed, remaining)
   - `## Parallel Opportunities` (based on final task set)
   - `## Implementation Strategy` (updated MVP scope)

   **If MODE = UPDATE_KEEP_ORDER** (preserve original order, append new):
   - Copy ALL existing phases in their original order from tasks.md
   - For each existing phase: apply PRESERVE rules (update IDs to P{N}T{NN}, keep all content verbatim including `[X]`/`[ ]` states)
   - Append NEW phases (plan phases not matched to any existing task phase) at the end
   - Generate fresh content for NEW phases (same rules as REGENERATE)
   - Apply Stage E: auto-generate Polish phase if no existing phase has "Polish"/"Cleanup"/"Documentation" in title
   - Regenerate Dependencies, Summary, Parallel, Strategy sections fresh

   **Update Mode metadata** (UPDATE/UPDATE_KEEP_ORDER only): After YAML frontmatter, add:
   `**Update Mode**: Merged on {date} - {N} phases preserved, {M} regenerated, {K} new, {J} removed`

5. **Report**: Output path to generated tasks.md and summary:
   - Total task count
   - Task count per user story
   - Parallel opportunities identified
   - Independent test criteria for each story
   - Suggested MVP scope (typically just User Story 1)
   - Format validation: Confirm ALL tasks follow the checklist format (checkbox, ID, labels, file paths)
   - **UPDATE mode only**: Additionally report which phases were PRESERVE/REGENERATE/NEW/OBSOLETE

Context for task generation: $ARGUMENTS

The tasks.md should be immediately executable - each task must be specific enough that an LLM can complete it without additional context.

## Task Generation Rules

**CRITICAL**: Tasks MUST be organized by user story to enable independent implementation and testing.

**Tests are OPTIONAL**: Only generate test tasks if explicitly requested in the feature specification or if user requests TDD approach.

### Checklist Format (REQUIRED)

Every task MUST strictly follow this format:

```text
- [ ] [TaskID] [P?] [Story?] Description with file path
```

**Format Components**:

1. **Checkbox**: ALWAYS start with `- [ ]` (markdown checkbox)
2. **Task ID**: Phase-prefixed ID (P1T01, P1T02, P2T01...) - P{phase}T{task_within_phase}, zero-padded to 2 digits
3. **[P] marker**: Include ONLY if task is parallelizable (different files, no dependencies on incomplete tasks)
4. **[Story] label**: REQUIRED for user story phase tasks only
   - Format: [US1], [US2], [US3], etc. (maps to user stories from spec.md)
   - Setup phase: NO story label
   - Foundational phase: NO story label  
   - User Story phases: MUST have story label
   - Polish phase: NO story label
5. **Description**: Clear action with exact file path

**Examples**:

- ✅ CORRECT: `- [ ] P1T01 Create project structure per implementation plan`
- ✅ CORRECT: `- [ ] P2T02 [P] Implement authentication middleware in src/middleware/auth.py`
- ✅ CORRECT: `- [ ] P3T03 [P] [US1] Create User model in src/models/user.py`
- ✅ CORRECT: `- [ ] P3T05 [US1] Implement UserService in src/services/user_service.py`
- ❌ WRONG: `- [ ] Create User model` (missing ID and Story label)
- ❌ WRONG: `P3T01 [US1] Create model` (missing checkbox)
- ❌ WRONG: `- [ ] [US1] Create User model` (missing Task ID)
- ❌ WRONG: `- [ ] P3T01 [US1] Create model` (missing file path)

### Task Organization

1. **From User Stories (spec.md)** - PRIMARY ORGANIZATION:
   - Each user story (P1, P2, P3...) gets its own phase
   - Map all related components to their story:
     - Models needed for that story
     - Services needed for that story
     - Endpoints/UI needed for that story
     - If tests requested: Tests specific to that story
   - Mark story dependencies (most stories should be independent)

2. **From Contracts**:
   - Map each contract/endpoint → to the user story it serves
   - If tests requested: Each contract → contract test task [P] before implementation in that story's phase

3. **From Data Model**:
   - Map each entity to the user story(ies) that need it
   - If entity serves multiple stories: Put in earliest story or Setup phase
   - Relationships → service layer tasks in appropriate story phase

4. **From Setup/Infrastructure**:
   - Shared infrastructure → Setup phase (Phase 1)
   - Foundational/blocking tasks → Foundational phase (Phase 2)
   - Story-specific setup → within that story's phase

### Phase Structure

- **Phase 1**: Setup (project initialization)
- **Phase 2**: Foundational (blocking prerequisites - MUST complete before user stories)
- **Phase 3+**: User Stories in priority order (P1, P2, P3...)
  - Within each story: Tests (if requested) → Models → Services → Endpoints → Integration
  - Each phase should be a complete, independently testable increment
- **Final Phase**: Polish & Cross-Cutting Concerns
