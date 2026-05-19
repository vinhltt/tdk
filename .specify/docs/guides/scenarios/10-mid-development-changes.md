# Scenario: Mid-Development Changes

> **When to use**: Requirements changed after you already have a spec, plan, and tasks. You need to update artifacts without starting over.

## Command Sequence

```
/tdk-clarify → /tdk-plan → /tdk-implement-from-plan
```

## Step-by-Step

### 1. Update the spec with new requirements

```
/tdk-clarify feat-001
```

**What happens**: Claude asks targeted questions about the changed requirements. Your answers update `spec.md` with new clarifications. You can also manually edit `spec.md` before proceeding.

### 2. Update the plan

```
/tdk-plan feat-001
```

**What happens**: Claude re-reads the updated spec and regenerates `plan.md`. Since `plan.md` already exists, Claude considers the existing architecture and adjusts rather than starting from scratch.

### 3. Resume implementation

```
/tdk-implement-from-plan feat-001
```

**What happens**: Claude reads the updated `plan.md ## Phases` table (primary source of truth) and resumes implementation from where it left off, executing only uncompleted phases.

## Tips

- Always run `clarify` or manually edit `spec.md` FIRST — it's the source of truth.
- The UPDATE mode in `tasks` preserves your completed work while adding new requirements.
- Run `analyze` after updating to catch any inconsistencies between the refreshed artifacts.
- If changes are minor, you can skip `plan` and go directly to `tasks` — it will adapt.
