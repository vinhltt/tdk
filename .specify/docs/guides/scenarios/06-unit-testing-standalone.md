# Scenario: Unit Testing — Standalone

> **When to use**: You have existing code that needs unit tests but no spec or feature ID. Common for legacy code or code written outside the Tihon workflow.

## Command Sequence

```
/tdk-ut-backfill-plan --standalone → /tdk-implement
```

## Step-by-Step

### 1. Create a standalone UT plan

```
/tdk-ut-backfill-plan feat-001 --sub-workspace backend --standalone
```

**What happens**: Claude analyzes the existing codebase (instead of reading a spec) and generates a test plan based on actual code structure — classes, methods, endpoints, etc.

The `--standalone` flag tells the planner that `spec.md` is optional. It derives test targets from the source code itself.

### 2. Implement and run tests

```
/tdk-implement feat-001
```

## Tips

- `--standalone` is the key differentiator — it makes `spec.md` optional for UT planning.
- This is ideal for adding test coverage to legacy modules or third-party integrations.
- You still need a task ID for file organization, even without a spec.
- A consumer test skill (`.claude/skills/{name}/SKILL.md`) mapped in `plan-skill-routing.md` is required for routed implementation.
