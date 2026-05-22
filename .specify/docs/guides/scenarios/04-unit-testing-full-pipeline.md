# Scenario: Unit Testing — Full Pipeline

> **When to use**: You want full control over the UT process — set up rules, create a test plan, review it, then generate test code.

## Command Sequence

```
/tdk-ut-backfill-plan → /tdk-ut-backfill-impl
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

### 2. Generate test code

```
/tdk-ut-backfill-impl feat-001 --sub-workspace backend
```

**What happens**: Claude reads the UT plan and phase files, then generates actual test files following the conventions from the consumer UT skill.

**Output**: Test files (e.g., `*.test.ts`, `test_*.py`, `*Test.php`) and fixtures

## Tips

- Use `--standalone` flag with `ut:plan` to generate tests for existing code without a spec.
- Use `--force` to overwrite existing UT plan/artifacts.
- The full pipeline gives you review points between plan and generation. Use `/tdk-ut-backfill-auto` instead if you want the whole thing automated.
