# Scenario: Quick Specification

> **When to use**: You need a fast spec for a small, well-understood feature and want to save tokens by skipping the brainstorm phase.

## Command Sequence

```
/tdk-specify --fast → /tdk-plan → /tdk-implement
```

## When to Choose `--fast` vs Default

| Criteria | Default (full brainstorm) | `--fast` |
|----------|--------------------------|----------|
| Feature scope | Unclear, needs exploration | Well-defined, small |
| Brainstorm needed? | Yes — explore trade-offs | No — approach is obvious |
| Token budget | Not a concern | Want to minimize usage |
| Output quality | Same | Same (just skips brainstorm) |

**Note:** Without `--fast`, `/tdk-specify` auto-detects the mode based on description complexity and Impact Surface.

## Step-by-Step

### 1. Create the spec quickly

```
/tdk-specify bug-042 Fix pagination offset error on company list API --fast
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
/tdk-implement bug-042
```

**What happens**: Claude executes the phases defined in `plan.md`, using the phases table as the source-of-truth.
Use `/tdk-implement bug-042 --phase NN` to execute one phase only.

## Tips

- The only difference is brainstorm enrichment is skipped. All other steps are identical.
- If you realize the spec needs more depth after using `--fast`, run `/tdk-clarify` to fill gaps.
- Both `--fast` and default modes produce the same artifact structure — downstream commands work identically.
- Use `/tdk-implement` to execute all runnable phases from the plan's `## Phases` table, or add `--phase NN` for one phase.
