# Scenario: Quick Specification

> **When to use**: You need a fast spec for a small, well-understood feature and want to save tokens by skipping the brainstorm phase.

## Command Sequence

```
/tdk-specify-fast → /tdk-plan → /tdk-implement-from-plan
```

## When to Choose `specify-fast` vs `specify`

| Criteria | Use `specify` | Use `specify-fast` |
|----------|--------------|-------------------|
| Feature scope | Unclear, needs exploration | Well-defined, small |
| Brainstorm needed? | Yes — explore trade-offs | No — approach is obvious |
| Token budget | Not a concern | Want to minimize usage |
| Output quality | Same | Same (just skips brainstorm) |

## Step-by-Step

### 1. Create the spec quickly

```
/tdk-specify-fast bug-042 Fix pagination offset error on company list API
```

**What happens**: Same as `/tdk-specify` but skips the embedded brainstorming step. Claude generates `spec.md` directly from your description without exploring scope boundary options.

**Output**: `spec.md`, `checklists/requirements.md`

### 2. Generate the plan

```
/tdk-plan bug-042
```

**What happens**: Claude reads the spec and generates a plan with the `## Phases` table that defines implementation phases.

### 3. Implement from the plan

```
/tdk-implement-from-plan bug-042
```

**What happens**: Claude executes the phases defined in `plan.md`, using the phases table as the source-of-truth.

## Tips

- The only difference is brainstorm enrichment is skipped. All other steps are identical.
- If you realize the spec needs more depth after using `specify-fast`, run `/tdk-clarify` to fill gaps.
- Both `specify` and `specify-fast` produce the same artifact structure — downstream commands work identically.
- Use `/tdk-implement-from-plan` to execute from the plan's `## Phases` table (primary workflow).
