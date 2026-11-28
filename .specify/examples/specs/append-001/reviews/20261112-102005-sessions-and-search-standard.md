---
task_id: append-001
generated_at: 2026-11-12T10:20:05+07:00
mode: standard
scope: phase-01
focus: "sessions and search"
verdict: changes_requested
blocked_reason: ""
repos:
  - sub_workspace: null
    repo_path: .
    base_commit: 7c41d9e2a0b35f86e1c27d40b9a6f3e85d12c0ab
    includes_uncommitted: false
    source: fallback
reviewers:
  - name: tdk-code-reviewer
    lens: spec
    status: ok
    reason: ""
    skills_loaded: []
  - name: tdk-code-reviewer
    lens: quality
    status: ok
    reason: ""
    skills_loaded: []
  - name: tdk-code-reviewer
    lens: security
    status: ok
    reason: ""
    skills_loaded: []
  - name: tdk-code-reviewer
    lens: reliability
    status: ok
    reason: ""
    skills_loaded: []
counts: { critical: 0, high: 1, medium: 1, low: 0, missing: 0 }
---

# Review: append-001, phase 01

## Summary

Verdict: `changes_requested`. The session lifetime is compared in the wrong unit and product search is case-sensitive. Counts: critical 0, high 1, medium 1, low 0, missing 0.

## Scope

- Repo `.` (no sub-workspace), base commit `7c41d9e2a0b35f86e1c27d40b9a6f3e85d12c0ab`, source `fallback` (no `git-map.md` row; diffed against the recorded base).
- Slice `s1`: repo `.`, sub-workspace none, 5 files, 68 diff lines.
- Reviewed phases: 01. Skipped phases: 02 (not started at review time).
- Not reviewed: None.
- Stat only: None.
- **Generated, not reviewed**: None.

## Reviewers

1 invocations: core 1, specialist 0, routed 0, parts 0, retries 0

- tdk-code-reviewer, lenses `spec,quality,security,reliability`, s1, repo `.`, sub-workspace none, 5 files +68/−0, ok, skills none.

**Unreviewed slices**: None.

**File coverage gaps**: None.

## Spec Compliance Matrix

| Criterion | Status | Evidence |
|---|---|---|
| FR-001 | partial | `src/auth/session-token.ts:18` |
| FR-003 | partial | `src/catalog/product-search.ts:10` |

**Spec coverage gaps**:

- FR-002, FR-004, SC-001, SC-002: recorded as `notChecked` by the reviewer, which judged only the focus areas, slice `s1`.

## Findings by severity

### critical

None.

### high

- **H1** `src/auth/session-token.ts:18` (spec, quality)
  - Evidence:
    ```ts
    return now - token.issuedAt > SESSION_TTL_SECONDS;
    ```
  - Recommendation: compare milliseconds with milliseconds.

### medium

- **M1** `src/catalog/product-search.ts:10` (spec)
  - Evidence:
    ```ts
    return products.filter((product) => product.name.includes(needle));
    ```
  - Recommendation: compare lowercased name and query.

### low

None.

## Not verified

None.

## Proposed Fix Phases

### Fix phase 1: Session lifetime
- **Description**: Make session expiry compare milliseconds with milliseconds so a session lasts one hour after it is issued.
- **Dependencies**: none
- **Related Code Files**:
  - Modify: `src/auth/session-token.ts`
- **Ready line**: `/tdk-plan append-001 "Make session expiry compare milliseconds with milliseconds so a session lasts one hour after it is issued."`

### Fix phase 2: Case-insensitive search
- **Description**: Match product names against the search query without regard to letter case.
- **Dependencies**: none
- **Related Code Files**:
  - Modify: `src/catalog/product-search.ts`
- **Ready line**: `/tdk-plan append-001 "Match product names against the search query without regard to letter case."`

## Next actions

1. `/tdk-plan append-001 "Make session expiry compare milliseconds with milliseconds so a session lasts one hour after it is issued."`
2. `/tdk-plan append-001 "Match product names against the search query without regard to letter case."`
