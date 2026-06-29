# Scenario: Full Feature Development

> **When to use**: You have a new feature to build from scratch and want the complete specification-driven workflow.

> New to the epic flow? Start with the [Epic Start Guide](../epic-start-guide.md) for command purpose, outputs, and readiness gates.

## Command Sequence

```text
Feature path:
/tdk-specify -> /tdk-clarify -> /tdk-plan -> /tdk-implement

Epic path:
optional /tdk-discovery -> /tdk-specify -> /tdk-clarify -> optional /tdk-high-level-design -> /tdk-task-breakdown -> tracker sync -> child /tdk-specify -> child /tdk-clarify -> child /tdk-plan -> child /tdk-implement
```

For feature-sized work, skip discovery, HLD, and task breakdown by default. For epic-sized work, use `discovery` when the problem is broad, then use `task-breakdown` as the handoff to tracker sub-issues; each sub-issue gets its own child spec loop.

## Step-by-Step

### 0. Explore the epic boundary (optional)

Use discovery only when the work is broad enough to need epic-level context before a feature spec.

```
/tdk-discovery feat-001 "Avatar upload epic: crop UI, upload validation, storage, moderation"
```

**What happens**: Claude writes context-only discovery artifacts for problem framing, personas, MVP boundary, and an index. It does not create `spec.md`, plans, work items, tracker records, or `UR-*` / `FR-*` / `SC-*` IDs.

**Output**: `discovery/problem.md`, `discovery/personas.md`, `discovery/mvp-scope.md`, `discovery/index.md`

Add `--interview` when the discovery artifacts should be challenged before they influence the spec. Later, `/tdk-discovery feat-001 --interview` rechecks existing discovery artifacts without regenerating them.

### 1. Create the specification

Type in Claude Code chat:

```
/tdk-specify feat-001 Add user avatar upload with image cropping and validation
```

**What happens**: Claude analyzes your description, optionally reads existing `discovery/index.md` as context, explores scope boundaries via embedded brainstorming, and generates `spec.md` with user stories, requirements, acceptance criteria, and edge cases. You'll answer up to 3 inline clarifying questions.

**Output**: `.specify/specs/feat-001/spec.md`, `checklists/requirements.md`

### 2. Clarify underspecified areas

```
/tdk-clarify feat-001
```

**What happens**: Claude identifies up to 5 gaps in the spec (e.g., "What image formats are supported?", "Max file size?"). Each question is asked one at a time. Your answers are encoded directly into `spec.md`.

**Output**: `spec.md` updated with `## Clarifications` section

### 3. Produce high-level design (optional, greenfield)

Skip this for the minimal feature path. Use it only when stakeholders need approval-level design before planning, or when an epic needs design context before breakdown.

Optional setup for project-specific advisory design skills:

```
cp .specify/templates/high-level-design/high-level-design-skill-routing-template.tpl {docs.path}/custom-workflow/high-level-design-skill-routing.md
```

Skip this setup when built-in HLD lenses are enough. HLD routing is separate from `plan-skill-routing.md`; routed consumer HLD skills are read-only/advisory and do not write files.

```
/tdk-high-level-design feat-001
```

**What happens**: For greenfield features, Claude turns the clarified `spec.md` into six approval-level design artifacts under `high-level-design/` (requirement overview, project/technical overview, data flow, screen flow, decisions & risks, plus an `index.md` manifest). It applies built-in design lenses, optionally reads HLD routing, and strict-blocks if `## 9. Unresolved Questions` is not `None`. Optional and backward-compatible: existing users can skip straight to `task-breakdown` or `plan`.

**Output**: `high-level-design/index.md` + 5 design artifacts

### 4. Generate portable work items (optional)

Skip this for the minimal feature path. Use it when the work is epic-sized and needs tracker sub-issues plus child specs.

```
/tdk-task-breakdown feat-001
```

**What happens**: Claude reads the clarified `spec.md`, strict-blocks if `## 9. Unresolved Questions` is not `None`, and writes tracker-neutral Markdown work items under `tasks-breakdown/`. When `high-level-design/` exists, it is read as optional enrichment context only.

**Output**: `tasks-breakdown/index.md`, `tasks-breakdown/task-NNN-*.md`

For epic-sized work, sync these task files to tracker sub-issues with consumer-owned tooling, then seed each sub-issue into a child spec that runs its own `specify -> clarify -> plan -> implement` loop. For feature-sized work, you may continue to plan the current spec directly.

Example child loop after tracker sync:

```
/tdk-specify feat-002 "Seed from task-001-avatar-upload-validation.md"
/tdk-clarify feat-002
/tdk-plan feat-002
/tdk-implement feat-002
```

Keep the parent spec as decomposition authority. Do not implement the parent epic as one large unit after task breakdown unless you intentionally decide it is small enough.

### 5. Generate the implementation plan

```
/tdk-plan feat-001
```

**What happens**: Claude reads the spec, researches technical options (Phase 0), then designs the architecture (Phase 1). Produces a plan with file structure, tech decisions, and design artifacts. The plan includes a `## Phases` table that defines the implementation workflow.

**Output**: `plan.md`, `research/`, `data-model.md`, `contracts/` (as needed)

### 6. (Optional) Quality gate — analyze

```
/tdk-analyze feat-001
```

**What happens**: Non-destructive analysis checks consistency between spec and plan. Reports gaps, contradictions, and coverage issues. No files modified.

### 7. Implement from plan

```
/tdk-implement feat-001
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
- Use `discovery` only for epic-sized ambiguity before specification. Feature-sized work starts at `specify`.
- Use `high-level-design` on greenfield features when stakeholders need an approval-level design before breakdown or planning; it is optional and existing flows are unaffected when skipped.
- Use `task-breakdown` when you need portable issue-sized Markdown files for tracker sync and child specs.
- Read manifests first: `discovery/index.md`, `high-level-design/index.md`, and `tasks-breakdown/index.md`.
- Run `analyze` before `implement` to catch inconsistencies early.
- Use `status` after interruptions to see where you left off.
- Task IDs must use prefixes from `.specify/.specify.env` (e.g., `feat`, `spec`, `docs`, `bug`).
- The plan's `## Phases` table is the source-of-truth for implementation work — use `/tdk-implement` to execute all runnable phases or `/tdk-implement <id> --phase NN` for one phase.
