# Scenario: Resume Existing Feature

> **When to use**: You started a feature previously and want to continue after a break, context switch, or new chat session.

## Command Sequence

```
/tdk-status → /tdk-implement-from-plan
```

## Step-by-Step

### 1. Check current progress

```
/tdk-status feat-001
```

**What happens**: Shows which artifacts exist, how many tasks are completed, and which phase is current. Identifies stale or outdated artifacts.

### 2. Resume implementation

```
/tdk-implement-from-plan feat-001
```

**What happens**: Claude reads `plan.md ## Phases` (primary source of truth), finds the first uncompleted phase, and continues execution from there. Already completed phases are skipped.

## Common Situations

### "I forgot my task ID"

Check existing features:

```
ls .specify/specs/
```

Or Claude can infer the task ID from your conversation context if you've mentioned it before.

### "Artifacts seem outdated"

If `status` shows warnings (>7 days stale):

1. Review the spec — does it still match your intent?
2. Run `/tdk-analyze feat-001` to check consistency
3. If changes needed, follow the [mid-development changes](10-mid-development-changes.md) workflow

### "Implementation was interrupted mid-phase"

`/tdk-implement-from-plan` resumes from the last uncompleted phase in `plan.md ## Phases`. If a partially-completed phase caused issues, you may need to manually fix the state before continuing.

## Tips

- `status` is your starting point after any break — it tells you exactly where things stand.
- `implement-from-plan` is idempotent for completed phases — re-running it skips completed items safely.
- If you're in a new chat session, provide the task ID explicitly since Claude won't have conversation context.
