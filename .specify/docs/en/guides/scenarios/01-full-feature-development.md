# Scenario: Full Feature Development

> **When to use**: You have a new feature to build from scratch and want the complete specification-driven workflow.

> New to the epic flow? Start with the [Epic Start Guide](../epic-start-guide.md) for command purpose, outputs, and readiness gates.

## Command Sequence

```text
Feature path:
/tdk-specify -> /tdk-clarify -> /tdk-plan -> /tdk-implement

Epic path:
optional /tdk-discovery -> /tdk-epic-prd -> /tdk-epic-hld -> /tdk-task-breakdown -> child /tdk-specify -> child /tdk-clarify -> child /tdk-plan -> child /tdk-implement
```

For feature-sized work, skip discovery, epic PRD, HLD, and task breakdown by default. For epic-sized work, use `discovery` when the problem is broad, use `epic-prd/` to align slices, use HLD to make breakdown coherent, then use task breakdown to create child spec seeds. Child specs do not run HLD by default.

## Step-by-Step

### 0. Explore the epic boundary (optional)

Use discovery only when the work is broad enough to need epic-level context before a feature spec.

```
/tdk-discovery feat-001 "Avatar upload epic: crop UI, upload validation, storage, moderation"
```

**What happens**: Claude writes context-only discovery artifacts for problem framing, personas, MVP boundary, and an index. It does not create `spec.md`, plans, work items, tracker records, or `UR-*` / `FR-*` / `SC-*` IDs.

**Output**: `discovery/problem.md`, `discovery/personas.md`, `discovery/mvp-scope.md`, `discovery/index.md`

Add `--interview` when the discovery artifacts should be challenged before they influence the spec. Later, `/tdk-discovery feat-001 --interview` rechecks existing discovery artifacts without regenerating them.

### 0.5. Align the epic PRD and slice map (optional)

Use epic PRD when discovery is still too broad to become one feature spec.

```
/tdk-epic-prd feat-001 --interview
```

**What happens**: Claude reads the four discovery artifacts and writes exactly four epic PRD artifacts: an index, product alignment PRD, slice map, and open questions. It does not create `spec.md`, requirement IDs, tracker issues, HLD, task files, plans, or code.

**Output**: `epic-prd/index.md`, `epic-prd/prd.md`, `epic-prd/slice-map.md`, `epic-prd/open-questions.md`

Run parent HLD and task breakdown before starting child specs.

### 1. Produce parent high-level design

Skip this for the minimal feature path. Use it for broad epics before child spec seed breakdown.

```
/tdk-epic-hld feat-001
```

**What happens**: Claude reads epic PRD artifacts and turns them into parent high-level design artifacts under `high-level-design/`. It applies built-in design lenses, optionally reads HLD routing, blocks on PRD blocking questions, and does not mint `UR-*`, `FR-*`, or `SC-*`.

**Output**: `high-level-design/index.md` + 5 design artifacts

### 2. Generate child spec seeds

```
/tdk-task-breakdown feat-001
```

**What happens**: Claude reads epic PRD + HLD and writes tracker-neutral child spec seed files under `tasks-breakdown/`. Each seed includes boundary, dependencies, assumptions/risks, and suggested `/tdk-specify <child-id> "<seed>"` text.

**Output**: `tasks-breakdown/index.md`, `tasks-breakdown/task-NNN-*.md`

### 3. Create a child specification

Type in Claude Code chat:

```
/tdk-specify feat-002 "Seed from tasks-breakdown/task-001-avatar-upload-validation.md"
```

**What happens**: Claude analyzes the child seed, explores scope boundaries via embedded brainstorming, and generates `spec.md` with user stories, requirements, acceptance criteria, and edge cases. You'll answer up to 3 inline clarifying questions.

**Output**: `.specify/specs/feat-002/spec.md`, `checklists/requirements.md`

### 4. Clarify underspecified child areas

```
/tdk-clarify feat-002
```

**What happens**: Claude identifies up to 5 gaps in the child spec. Each question is asked one at a time. Your answers are encoded directly into `spec.md`.

**Output**: `spec.md` updated with `## Clarifications` section

### Optional HLD routing setup

Optional setup for project-specific advisory design skills:

```
cp .specify/templates/high-level-design/high-level-design-skill-routing-template.tpl {docs.path}/custom-workflow/high-level-design-skill-routing.md
```

Skip this setup when built-in HLD lenses are enough. HLD routing is separate from `plan-skill-routing.md`; routed consumer HLD skills are read-only/advisory and do not write files.

Example child loop:

```
/tdk-specify feat-002 "Seed from task-001-avatar-upload-validation.md"
/tdk-clarify feat-002
/tdk-plan feat-002
/tdk-implement feat-002
```

Keep the parent epic artifacts as decomposition context. Do not implement the parent epic as one large unit after task breakdown.

### 5. Generate the child implementation plan

```
/tdk-plan feat-002
```

**What happens**: Claude reads the spec, researches technical options (Phase 0), then designs the architecture (Phase 1). Produces a plan with file structure, tech decisions, and design artifacts. The plan includes a `## Phases` table that defines the implementation workflow.

**Output**: `plan.md`, `research/`, `data-model.md`, `contracts/` (as needed)

### 6. (Optional) Quality gate — analyze

```
/tdk-analyze feat-001
```

**What happens**: Non-destructive analysis checks consistency between spec and plan. Reports gaps, contradictions, and coverage issues. No files modified.

### 7. Implement from child plan

```
/tdk-implement feat-002
```

**What happens**: Claude reads the plan's `## Phases` table and executes all runnable phases by default. Setup first, then tests (TDD), core features, integration, and polish. Each completed phase is marked in plan.md's phases table. UT phase files delegate to the consumer test skill listed in `## Delegate Skills`.

To run one phase only:

```
/tdk-implement feat-001 --phase 03
```

### 8. Track progress

```
/tdk-status feat-001
```

Run at any point to see a progress bar, completed phases, and recommendations.

## Tips

- If your feature is small and well-understood, skip `clarify` and go straight to `plan`.
- Use `discovery` and `epic-prd` only for epic-sized ambiguity before child specification. Feature-sized work starts at `specify`.
- Use `tdk-epic-hld` on parent epics before task breakdown; child specs do not run HLD by default.
- Use `task-breakdown` when you need child spec seed Markdown files from epic PRD + HLD.
- Read manifests first: `discovery/index.md`, `high-level-design/index.md`, and `tasks-breakdown/index.md`.
- Run `analyze` before `implement` to catch inconsistencies early.
- Use `status` after interruptions to see where you left off.
- Task IDs must use prefixes from `.specify/.specify.env` (e.g., `feat`, `spec`, `docs`, `bug`).
- The plan's `## Phases` table is the source-of-truth for implementation work — use `/tdk-implement` to execute all runnable phases or `/tdk-implement <id> --phase NN` for one phase.
