# Scenario: Child Feature Implementation

> **When to use**: You have one child spec seed from task breakdown, or one small feature that is already clear enough to skip the parent epic flow.

Use this after the epic flow creates child seed files:

```text
/tdk-discovery -> /tdk-epic-prd -> /tdk-epic-hld -> /tdk-task-breakdown
```

Then implement one child feature:

```text
/tdk-specify -> /tdk-clarify -> /tdk-plan -> /tdk-implement
```

## Before You Start

Use this scenario when:

- TDK setup already ran successfully.
- Claude Code is open at the consumer project root.
- You have one child spec seed from `tasks-breakdown/`, or a small clear feature/fix.
- You are ready to create one `spec.md` and implement that child scope.

If setup is not done, start with [Setup Guide](../setup/setup-guide.md). If the work is still broad or vague, start with [Epic Start Guide](00-epic-start-guide.md).

## Pick One Child Feature

Good inputs:

- One seed from `tasks-breakdown/task-NNN-*.md`.
- One validation rule.
- One display label fix.
- One small endpoint field.
- One simple error message.

Avoid these for the child loop:

- Whole authentication systems.
- Multi-service rewrites.
- Broad product ideas with many possible MVP cuts.
- Work where nobody knows the acceptance criteria.

## Step 1: Specify

Type this in Claude Code chat:

```text
/tdk-specify feat-001 "Seed from tasks-breakdown/task-001-slice.md"
```

What should happen:

- TDK creates `.specify/specs/feat-001/spec.md`.
- TDK writes `## Specification Quality Gate` inside
  `.specify/specs/feat-001/spec.md`.
- Claude may ask clarifying questions if the seed is not concrete.

Read `spec.md` before moving on. Check:

- Problem statement is correct.
- In scope and out of scope are clear.
- User requirements match the child feature.
- Functional requirements describe behavior, not implementation guesses.
- `## 9. Unresolved Questions` is either `None` or has real questions.

## Step 2: Clarify

Run clarify when `spec.md` still has gaps:

```text
/tdk-clarify feat-001
```

What should happen:

- Claude asks targeted questions.
- Accepted answers are written back into `spec.md`.
- `## Clarifications` records the decision history.
- `## 9. Unresolved Questions` should become `None` before planning.

Do not skip this when the feature scope is still fuzzy.

## Step 3: Plan

After the spec is ready:

```text
/tdk-plan feat-001
```

What should happen:

- TDK creates `.specify/specs/feat-001/plan.md`.
- The plan contains phases that describe implementation order.
- Default plan output is `plan.md` plus executable `phases/*.md`.
- `research/`, `reports/`, and machine `contracts/` appear only for declared
  consumers and are indexed in `plan.md`; data models, prose interfaces, and
  runbooks live in their owner phases.

Read `plan.md` before implementation. Check:

- Phases match the spec.
- Phase order is logical.
- Test or verification steps are present.
- The plan does not add unrelated work.

## Step 4: Implement

Run all runnable phases:

```text
/tdk-implement feat-001
```

Or run one phase:

```text
/tdk-implement feat-001 --phase 01
```

What should happen:

- Claude implements from `plan.md`.
- Tests or verification run when the plan requires them.
- Status artifacts update as phases complete.

## Check The Result

After implementation, ask Claude Code for a status snapshot:

```text
/tdk-status feat-001
```

Then verify:

- Code changes match the spec.
- Tests or focused checks passed.
- No unresolved questions remain.
- No unrelated files were changed.

## Common Mistakes

| Mistake | Fix |
|---|---|
| Typing `/tdk-*` in the terminal | Type commands in Claude Code chat. |
| Starting this loop with a broad epic | Use [Epic Start Guide](00-epic-start-guide.md). |
| Skipping clarify with open questions | Run `/tdk-clarify` until blockers are resolved. |
| Treating discovery as requirements | Treat `spec.md` as the requirement authority. |
| Letting plan add extra scope | Ask Claude to revise `plan.md` before implementation. |

## Related Docs

- [Epic Start Guide](00-epic-start-guide.md)
- [Glossary](../concepts/glossary.md)
- [TDK Skills Guide](../skills-guide.md)
- [Workflow Map](../workflow-map.md)
