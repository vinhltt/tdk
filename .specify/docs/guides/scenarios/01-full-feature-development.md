# Scenario: Full Feature Development

> **When to use**: You have a new feature to build from scratch and want the complete specification-driven workflow.

## Command Sequence

```
/tdk-specify → /tdk-clarify → /tdk-plan → /tdk-implement
```

## Step-by-Step

### 1. Create the specification

Type in Claude Code chat:

```
/tdk-specify feat-001 Add user avatar upload with image cropping and validation
```

**What happens**: Claude analyzes your description, explores scope boundaries via embedded brainstorming, and generates `spec.md` with user stories, requirements, acceptance criteria, and edge cases. You'll answer up to 3 inline clarifying questions.

**Output**: `.specify/specs/feat-001/spec.md`, `checklists/requirements.md`

### 2. Clarify underspecified areas

```
/tdk-clarify feat-001
```

**What happens**: Claude identifies up to 5 gaps in the spec (e.g., "What image formats are supported?", "Max file size?"). Each question is asked one at a time. Your answers are encoded directly into `spec.md`.

**Output**: `spec.md` updated with `## Clarifications` section

### 3. Generate the implementation plan

```
/tdk-plan feat-001
```

**What happens**: Claude reads the spec, researches technical options (Phase 0), then designs the architecture (Phase 1). Produces a plan with file structure, tech decisions, and design artifacts. The plan includes a `## Phases` table that defines the implementation workflow.

**Output**: `plan.md`, `research/`, `data-model.md`, `contracts/` (as needed)

### 4. (Optional) Quality gate — analyze

```
/tdk-analyze feat-001
```

**What happens**: Non-destructive analysis checks consistency between spec and plan. Reports gaps, contradictions, and coverage issues. No files modified.

### 5. Implement from plan

```
/tdk-implement feat-001
```

**What happens**: Claude reads the plan's `## Phases` table and executes all runnable phases by default. Setup first, then tests (TDD), core features, integration, and polish. Each completed phase is marked in plan.md's phases table. UT phase files delegate to the consumer test skill listed in `## Delegate Skills`.

To run one phase only:

```
/tdk-implement feat-001 --phase 03
```

### 6. Track progress

```
/tdk-status feat-001
```

Run at any point to see a progress bar, completed phases, and recommendations.

## Tips

- If your feature is small and well-understood, skip `clarify` and go straight to `plan`.
- Run `analyze` before `implement` to catch inconsistencies early.
- Use `status` after interruptions to see where you left off.
- Task IDs must use prefixes from `.specify/.specify.env` (e.g., `feat`, `spec`, `docs`, `bug`).
- The plan's `## Phases` table is the source-of-truth for implementation work — use `/tdk-implement` to execute all runnable phases or `/tdk-implement <id> --phase NN` for one phase.
