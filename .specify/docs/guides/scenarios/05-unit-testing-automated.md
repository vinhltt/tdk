# Scenario: Unit Testing — Automated

> **When to use**: You want a single command to handle the entire UT workflow — plan, generate, run, and report.

## Command Sequence

```
/tdk-ut-backfill-auto
```

## Step-by-Step

### 1. Run the automated UT workflow

```
/tdk-ut-backfill-auto feat-001 --sub-workspace backend
```

**What happens**: Claude runs the full UT pipeline automatically:

1. **Check rules** — verifies `ut-rule.md` exists; if missing, prompts to create it
2. **Create/update UT plan** — generates `ut-plan.md` and phase files
3. **Generate test code** — writes test files per UT plan
4. **Run tests** — executes the test suite
5. **Update plan** — marks completed items in `ut-plan.md`

**Output**: `ut-plan.md`, `ut-phase-*.md`, test files, test results report

### 2. Review results

Claude reports test results with pass/fail counts. Failed tests are flagged for manual review.

## Key Flags

| Flag | Purpose |
|------|---------|
| `--sub-workspace <name>` | Target sub-workspace (e.g., `backend`, `frontend`) |
| `--skip-run` | Generate tests but don't execute them |
| `--plan-only` | Only create/update the UT plan, skip generation |
| `--force` | Overwrite existing UT artifacts |

## Examples

Generate tests for frontend without running them:

```
/tdk-ut-backfill-auto feat-001 --sub-workspace frontend --skip-run
```

Only update the UT plan:

```
/tdk-ut-backfill-auto feat-001 --sub-workspace backend --plan-only
```

## Tips

- `ut-auto` is called automatically by `/tdk-implement-from-plan` when it encounters a UT phase in the plan's `## Phases` table — you don't need to run it manually during implementation.
- If you want review points between plan and generation, use the [full pipeline](04-unit-testing-full-pipeline.md) instead.
- If `ut-rule.md` is missing, `ut-auto` will prompt you to create it before proceeding.
