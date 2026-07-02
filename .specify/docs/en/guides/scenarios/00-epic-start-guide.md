# Workflow: Start An Epic And Create Child Specs

> Use this when: The work is broad, vague, or likely to split into multiple independently specifiable child features.
> Reader level: fresher-safe
> Main path: `/tdk-discovery -> /tdk-epic-prd -> /tdk-epic-hld -> /tdk-task-breakdown -> child /tdk-specify -> /tdk-clarify -> /tdk-plan -> /tdk-implement`

## Fast Path

Type these in Claude Code chat, not in a terminal:

```text
/tdk-discovery epic-001 "Broad epic brief"
/tdk-epic-prd epic-001 --interview
/tdk-epic-hld epic-001
/tdk-task-breakdown epic-001

# Then choose one seed and implement one child:
/tdk-specify feat-001 "Seed from tasks-breakdown/task-001-slice.md"
/tdk-clarify feat-001
/tdk-plan feat-001
/tdk-implement feat-001
```

If the work is already one small clear feature, use [Child Feature Implementation](01-child-feature-implementation.md) instead.

## Before You Start

- TDK setup is complete. If not, start with [Setup Guide](../setup/setup-guide.md).
- Claude Code is open at the consumer project root.
- The brief is too broad to write concrete requirements immediately.
- You are ready to create child specs after the parent epic is decomposed.

Do not use this workflow just to add detail to a small feature. Start at `/tdk-specify` when the scope, users, acceptance criteria, and edge cases are already clear.

## What You Will Produce

| Step | Command | Main artifact | Gate |
|---|---|---|---|
| 1 | `/tdk-discovery` | `discovery.md` + `discovery/` | Problem, personas, and MVP cut are clear enough for product alignment |
| 2 | `/tdk-epic-prd` | `epic-prd.md` + `epic-prd/` | Blocking questions are empty and `slice-map.md` has no catch-all slice |
| 3 | `/tdk-epic-hld` | `high-level-design.md` + `high-level-design/` | Parent design boundaries, dependencies, risks, and assumptions are recorded |
| 4 | `/tdk-task-breakdown` | `tasks-breakdown.md` + `tasks-breakdown/` | Each seed cites a source slice and is independently specifiable |
| 5 | Child `/tdk-specify` | child `spec.md` | One child scope owns concrete requirements and success criteria |
| 6 | Child `/tdk-clarify` | updated child `spec.md` | `## 9. Unresolved Questions` is `None` |
| 7 | Child `/tdk-plan` -> `/tdk-implement` | child `plan.md` and source changes | Plan phases match the accepted child spec |

## Step 1: Capture Epic Discovery

Run:

```text
/tdk-discovery epic-001 "Broad epic brief" --interview
```

Expected result:

- `discovery.md` exists.
- `discovery/problem.md`, `discovery/personas.md`, and `discovery/mvp-scope.md` exist.
- Discovery frames context only; it does not create `spec.md` or requirement IDs.

Continue only if:

- The problem, affected users, and MVP boundary are good enough for product alignment.

If not:

- Re-run `/tdk-discovery epic-001 --interview` to challenge the current discovery artifacts without regenerating them.

## Step 2: Align Product Slices

Run:

```text
/tdk-epic-prd epic-001 --interview
```

Expected result:

- `epic-prd.md` exists.
- `epic-prd/prd.md`, `epic-prd/slice-map.md`, and `epic-prd/open-questions.md` exist.
- Epic PRD remains product alignment; it does not create child requirements or tracker issues.

Continue only if:

- Blocking questions are empty.
- `slice-map.md` does not hide unrelated work inside a catch-all slice.

If not:

- Resolve the blocking questions or re-run the epic PRD interview before HLD.

## Step 3: Add Parent Design Context

Run:

```text
/tdk-epic-hld epic-001
```

Expected result:

- `high-level-design.md` exists.
- HLD detail files capture slice boundaries, dependencies, data flow, screen flow, decisions, risks, and assumptions.

Continue only if:

- HLD traces back to epic PRD slices without minting `UR-*`, `FR-*`, `SC-*`, or child implementation phases.

If not:

- Fix epic PRD or HLD readiness issues before task breakdown.

## Step 4: Generate Child Spec Seeds

Run:

```text
/tdk-task-breakdown epic-001
```

Expected result:

- `tasks-breakdown.md` exists.
- `tasks-breakdown/task-NNN-*.md` seed files exist.
- Every seed describes one independently specifiable child feature.

Continue only if:

- You can choose one seed without implementing the entire parent epic.

If not:

- Split oversized seeds or fix missing PRD/HLD traceability before child specification.

## Step 5: Promote One Seed Into A Child Spec

Choose one seed, then run:

```text
/tdk-specify feat-001 "Seed from tasks-breakdown/task-001-slice.md"
```

Expected result:

- `.specify/specs/feat-001/spec.md` exists.
- `.specify/specs/feat-001/checklists/requirements.md` exists.
- The child spec owns its own `UR-*`, `FR-*`, and `SC-*` IDs.

Continue only if:

- The child spec covers one seed, not the whole parent epic.

If not:

- Re-scope the child spec before clarify or planning.

## Step 6: Clarify The Child Spec

Run:

```text
/tdk-clarify feat-001
```

Expected result:

- Accepted answers are written into `spec.md`.
- `## Clarifications` records decision history.
- `## 9. Unresolved Questions` becomes `None` before planning.

Continue only if:

- The child spec is clear enough to plan.

If not:

- Keep clarifying or revise the child scope.

## Step 7: Plan And Implement The Child

Run:

```text
/tdk-plan feat-001
/tdk-implement feat-001
```

Expected result:

- `plan.md` has an actionable `## Phases` table.
- Implementation follows the child plan.
- Tests or focused verification run when the plan requires them.

Continue only if:

- The plan does not add unrelated parent-epic work.

If not:

- Ask Claude Code to revise `plan.md` before implementation.

## Common Mistakes

| Mistake | Fix |
|---|---|
| Running discovery for every small feature | Use [Child Feature Implementation](01-child-feature-implementation.md) for feature-sized work. |
| Treating discovery as requirements | Treat child `spec.md` as the requirement authority. |
| Running HLD before epic PRD is ready | Resolve PRD blocking questions and catch-all slices first. |
| Planning the parent epic immediately after task breakdown | Create child specs from seeds, then plan each child. |
| Expecting TDK core to create tracker issues | Task breakdown is tracker-neutral; tracker sync is consumer-owned. |
| Typing `/tdk-*` in the terminal | Type workflow commands in Claude Code chat. |

## Troubleshooting

| Symptom | Likely cause | Fix |
|---|---|---|
| HLD stops before writing files | Epic PRD has blocking questions or catch-all slices | Update or interview the epic PRD. |
| Task breakdown stops before writing files | Epic HLD is missing or parent readiness gates fail | Run `/tdk-epic-hld <id>` and resolve readiness issues. |
| A seed feels too large | The parent slice still contains multiple children | Split the seed before child `/tdk-specify`. |
| Child plan includes parent-wide work | The child spec scope is too broad | Re-scope the child spec and re-run planning. |

## Go Deeper

- Concept: [Promote Convention](../concepts/promote-convention.md)
- Concept/reference: [Workflow Map](../workflow-map.md)
- Related workflow: [Child Feature Implementation](01-child-feature-implementation.md)
- Related catalog: [Scenario Catalog](scenario-catalog.md)
- Reference: [TDK Skills Guide](../skills-guide.md)
- Vietnamese guide: [Hướng Dẫn Bắt Đầu Epic](../../../vi/guides/scenarios/00-epic-start-guide.md)

## Maintainer Notes

- Source of truth for command syntax and flags: [TDK Skills Guide](../skills-guide.md).
- Source of truth for file inputs/outputs: [Workflow Map](../workflow-map.md).
- Keep this page as the runnable epic workflow. Do not duplicate the full command reference or artifact matrix here.
