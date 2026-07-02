# Scenario: Progress Tracking

> **When to use**: You want to check the current state of a feature — what's done, what's remaining, and what to do next.

## Command Sequence

```
/tdk-status
```

## Step-by-Step

### 1. Check feature status

```
/tdk-status feat-001
```

**What happens**: Claude runs a read-only status check and displays:

- **Artifact checklist** — which files exist (spec.md, plan.md) with last modified dates
- **Progress bar** — visual 22-character bar showing completion percentage (derived from plan.md ## Phases)
- **Phase breakdown** — completed vs. remaining phases from plan.md ## Phases table
- **Recommendations** — what command to run next based on current state
- **Warnings** — stale artifacts (>7 days unchanged) or outdated artifacts (>14 days)

### 2. Interpret the output

Example output:

```
Feature: feat-001
Status: In Progress

Artifacts:
  ✓ spec.md      (2026-02-10)
  ✓ plan.md      (2026-02-10)

Progress: [████████████░░░░░░░░░░] 55% (19/35 items)

Phases (from plan.md ## Phases):
  ✓ Phase 1: Setup (3/3)
  ✓ Phase 2: Core Models (8/8)
  → Phase 3: API Endpoints (8/12)    ← current
  · Phase 4: Integration (0/7)
  · Phase 5: Polish (0/5)

Next: Continue with /tdk-implement feat-001
```

## Tips

- `status` is read-only — safe to run at any time without side effects.
- Run it after breaks to quickly recall where you stopped.
- Stale warnings (>7 days) suggest the feature may need attention or cleanup.
- No task ID? Claude will try to infer it from conversation context.
