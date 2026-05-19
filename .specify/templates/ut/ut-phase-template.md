# UT Phase: {MODULE NAME}

> **Status:** 🟡 Draft

<!--
Module: {module-name}
Source path: {path/to/module/}
Agent: [v2: assigned agent — placeholder, not active in MVR]
Skill: [v2: tdk-ut-backfill-impl or custom — placeholder, not active in MVR]

MVR scope: tracking table = Module | Phase File | Status | Progress.
v2 will add Agent | Skill columns when subagent dispatch lands.
Status flags: 🟡 Draft | 🔵 Implementing | 🟢 Complete | 🟠 Failed | 🔴 Drift.
MVR active transitions: 🟡 → 🔵 → 🟢 only.
🟠 (subagent failure) reserved for v2 dispatcher.
🔴 (drift) reserved for v2 tdk-ut-backfill-check-rules Phase 2.
-->

## §1 Code Summary

<!--
ACTION REQUIRED: List all files in this module, their exported functions/classes,
key dependencies, and notable branches.
-->

| File | Exports | Key Deps | Branches |
|------|---------|----------|----------|
| `{path/to/file.ts}` | `{funcA, ClassB}` | `{dep1, dep2}` | `{if/else, error path}` |

## §2 Mocks & Fixtures Required

<!--
ACTION REQUIRED: List all mocks needed for this module's tests.
-->

| Dependency | Type | Mock Approach |
|------------|------|---------------|
| `{module/dep}` | {external \| db \| time \| fs} | `{vi.mock / jest.fn / patch}` |

## §3 Test Matrix

<!--
Technique legend: Happy | EP (Equivalence Partition) | BVA (Boundary Value) |
Branch L<n> (branch at line n) | Error | Deps (dependency injection/mock) | State

ID format (semantic, see tdk-ut-backfill-plan SKILL):
  Single-file phase: <func>__<slug>            e.g. parse_email__happy
                     <Class>.<method>__<slug>  e.g. OrderService.charge__timeout
  Multi-file phase:  <source_basename>_<func>__<slug>            e.g. routes_parse_email__happy
                     <source_basename>_<Class>.<method>__<slug>  e.g. services_OrderService.charge__timeout
Slug rules: snake_case, 1–3 words, no `test_` prefix.
Validation regex: ^[a-z][a-z0-9_]*(\.[A-Z][a-zA-Z0-9]*)?__[a-z0-9_]+$
Multi-file invariant: if Source column has ≥2 distinct values, ALL IDs must use multi-file form.
Impl: [ ] = not implemented, [x] = implemented
-->

| ID | Source | Scenario | Technique | Input | Expected | Priority | Impl |
|----|--------|----------|-----------|-------|----------|----------|------|
| {func}__happy | `{path/to/file.ext}` | {scenario description} | Happy | `{input}` | `{expected}` | P1 | [ ] |
| {func}__invalid_input | `{path/to/file.ext}` | {scenario description} | Error | `{input}` | `{throws/rejects}` | P1 | [ ] |
| {func}__boundary | `{path/to/file.ext}` | {scenario description} | BVA | `{boundary}` | `{expected}` | P2 | [ ] |

## §4 Open Questions / Assumptions

<!--
List unresolved questions specific to this module.
-->

- [ ] {Question or assumption}
