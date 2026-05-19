# Scenario: Unit Testing — Full Pipeline

> **When to use**: You want full control over the UT process — set up rules, create a test plan, review it, then generate test code.

## Command Sequence

```
/tdk-ut-backfill-create-rules → /tdk-ut-backfill-check-rules → /tdk-ut-backfill-plan → /tdk-ut-backfill-impl
```

## Step-by-Step

### 1. Create UT rules (one-time per sub-workspace)

```
/tdk-ut-backfill-create-rules --sub-workspace backend
```

**What happens**: Claude detects your framework (Laravel, Vue, etc.) and generates `ut-rule.md` defining test conventions: naming patterns, directory structure, mocking strategies, coverage targets.

**Output**: `{docs-path}/rules/test/ut-rule.md`

This is a **one-time setup** per sub-workspace. Skip if rules already exist.

### 2. Verify rules exist

```
/tdk-ut-backfill-check-rules --sub-workspace backend
```

**What happens**: Validates that `ut-rule.md` exists and shows a summary of its contents. Quick sanity check before planning.

### 3. Create the UT plan

```
/tdk-ut-backfill-plan feat-001 --sub-workspace backend
```

**What happens**: Claude reads the spec, plan, and UT rules, then generates a test plan with one phase file per module (no setup phase; cross-module fixtures flagged in `ut/plan.md` Open Questions).

**Output**: `ut/plan.md`, `ut/phases/{module1}.md`, `ut/phases/{module2}.md`, etc.

To review/update an existing plan:

```
/tdk-ut-backfill-plan feat-001 --sub-workspace backend --review
```

### 4. Generate test code

```
/tdk-ut-backfill-impl feat-001 --sub-workspace backend
```

**What happens**: Claude reads the UT plan and phase files, then generates actual test files following the conventions in `ut-rule.md`.

**Output**: Test files (e.g., `*.test.ts`, `test_*.py`, `*Test.php`) and fixtures

## Tips

- Use `--standalone` flag with `ut:plan` to generate tests for existing code without a spec.
- Use `--force` to overwrite existing UT plan/artifacts.
- The full pipeline gives you review points between plan and generation. Use `/tdk-ut-backfill-auto` instead if you want the whole thing automated.
