# Unit Test Plan: {FEATURE NAME}

> **Status:** 🟡 Draft

<!--
MVR scope: tracking table = Module | Phase File | Status | Progress.
v2 will add Agent | Skill columns when subagent dispatch lands.
Status flags: 🟡 Draft | 🔵 Implementing | 🟢 Complete | 🟠 Failed | 🔴 Drift.
MVR active transitions: 🟡 → 🔵 → 🟢 only.
🟠 (subagent failure) reserved for v2 dispatcher.
🔴 (drift) reserved for v2 drift detection.
-->

## Metadata

| Field | Value |
|-------|-------|
| **Feature** | `{feature-id}` |
| **Generated** | {DATE} by `/tdk-ut-backfill-plan` |
| **Spec** | `.specify/specs/{feature-id}/spec.md` |
| **Framework** | {FRAMEWORK} {VERSION} |

## Phases Tracking

<!--
ACTION REQUIRED: One row per module. Update Status + Progress as work proceeds.
Phase files live at: .specify/specs/{feature-id}/ut/phases/{module}.md
-->

| Module | Phase File | Status | Progress |
|--------|-----------|--------|----------|
| `{module-name}` | `ut/phases/{module-name}.md` | 🟡 Draft | 0/0 |

## Coverage Goals

<!--
ACTION REQUIRED: Adjust targets per consumer UT skill or use defaults below.
-->

| Priority | Target | Scope |
|----------|--------|-------|
| P1 Critical | 90%+ | public APIs, core business logic |
| P2 Important | 80%+ | internal services, utilities |
| P3 Supporting | 70%+ | helpers, edge cases |

### Critical Paths

<!--
ACTION REQUIRED: Extract from spec.md user stories.
-->

1. {Happy path from US-001}
2. {Happy path from US-002}

### Edge Cases

<!--
ACTION REQUIRED: Extract from spec.md edge cases section.
-->

1. {Edge case 1}
2. {Edge case 2}

## Open Questions / Cross-module Concerns

<!--
List unresolved questions, shared fixture conflicts, cross-module mocking decisions.
-->

- [ ] {Question or concern}

## Test Organization

| Setting | Value |
|---------|-------|
| **Pattern** | {co-located \| __tests__/ \| tests/} |
| **File Naming** | {*.test.ts \| *.spec.ts \| test_*.py} |
| **Source** | {existing-tests \| framework-convention \| user-preference} |

## Next Step

Run `/tdk-implement-from-plan {feature-id}`. Each `ut/phases/*.md` file delegates implementation to the consumer test skill selected by `plan-skill-routing.md`.
