# Scenario: Unit Testing — Routed Implementation

> **When to use**: You want TDK to create UT planning artifacts, then let the consumer project skill implement and run tests.

## Command Sequence

```
/tdk-plan → /tdk-implement
```

## Step-by-Step

### 1. Configure test routing

Add a `test` entry to `{docs.path}/custom-workflow/plan-skill-routing.md`:

```markdown
## global
- test: /your-consumer-unit-test-skill
```

Use sub-workspace sections when different services need different test skills.

### 2. Generate the implementation plan

```
/tdk-plan feat-001
```

**What happens**: When UT planning is needed, `/tdk-plan` triggers `/tdk-ut-backfill-plan`. The UT planner creates `ut/plan.md` and `ut/phases/*.md`, then injects the routed consumer test skill into each UT phase's `## Delegate Skills`.

### 3. Execute the plan

```
/tdk-implement feat-001
```

**What happens**: `/tdk-implement` executes all runnable phases in order by default. Add `--phase NN` to execute one phase only. When a phase contains `## Delegate Skills`, it invokes those skills before generic implementation.

## Tips

- Use `/tdk-ut-backfill-plan feat-001 --standalone` when adding tests to existing code without a spec.
- The routed consumer test skill owns framework-specific code generation, assertions, mocks, fixtures, and test execution.
- `/tdk-ut-backfill-auto` is deprecated and kept only as a temporary compatibility shim.
