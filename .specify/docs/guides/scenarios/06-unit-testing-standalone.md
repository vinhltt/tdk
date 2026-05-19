# Scenario: Unit Testing — Standalone

> **When to use**: You have existing code that needs unit tests but no spec or feature ID. Common for legacy code or code written outside the Tihon workflow.

## Command Sequence

```
/tdk-ut-backfill-create-rules → /tdk-ut-backfill-plan --standalone → /tdk-ut-backfill-impl
```

Or automated:

```
/tdk-ut-backfill-auto (with --standalone flag on ut:plan)
```

## Step-by-Step

### 1. Ensure UT rules exist

```
/tdk-ut-backfill-check-rules --sub-workspace backend
```

If missing:

```
/tdk-ut-backfill-create-rules --sub-workspace backend
```

### 2. Create a standalone UT plan

```
/tdk-ut-backfill-plan feat-001 --sub-workspace backend --standalone
```

**What happens**: Claude analyzes the existing codebase (instead of reading a spec) and generates a test plan based on actual code structure — classes, methods, endpoints, etc.

The `--standalone` flag tells the planner that `spec.md` is optional. It derives test targets from the source code itself.

### 3. Generate and run tests

```
/tdk-ut-backfill-impl feat-001 --sub-workspace backend
```

Or combine everything with `ut:auto`:

```
/tdk-ut-backfill-auto feat-001 --sub-workspace backend
```

## Tips

- `--standalone` is the key differentiator — it makes `spec.md` optional for UT planning.
- This is ideal for adding test coverage to legacy modules or third-party integrations.
- You still need a task ID for file organization, even without a spec.
- UT rules (`ut-rule.md`) are always required regardless of standalone mode.
