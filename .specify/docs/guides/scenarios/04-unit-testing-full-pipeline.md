# Scenario: Unit Testing — Full Pipeline

> **When to use**: You want full control over the UT process — configure routing, create a test plan, review it, then implement through the routed consumer test skill.

## Command Sequence

```
/tdk-ut-backfill-plan → /tdk-implement
```

## Step-by-Step

### 1. Create the UT plan

```
/tdk-ut-backfill-plan feat-001 --sub-workspace backend
```

**What happens**: Claude reads the spec, plan, and UT conventions from the consumer UT skill, then generates a test plan with one phase file per module (no setup phase; cross-module fixtures flagged in `ut/plan.md` Open Questions).

**Output**: `ut/plan.md`, `ut/phases/{module1}.md`, `ut/phases/{module2}.md`, etc.

To review/update an existing plan:

```
/tdk-ut-backfill-plan feat-001 --sub-workspace backend --review
```

### 2. Implement via routed test skill

```
/tdk-implement feat-001
```

**What happens**: Claude reads the implementation plan. UT phase files contain `## Delegate Skills`, so `/tdk-implement` invokes the routed consumer test skill before generic implementation.

**Output**: Test files (e.g., `*.test.ts`, `test_*.py`, `*Test.php`) and fixtures

## Tips

- Use `--standalone` flag with `ut:plan` to generate tests for existing code without a spec.
- Use `--force` to overwrite existing UT plan/artifacts.
- The full pipeline gives you review points between UT planning and routed implementation.
