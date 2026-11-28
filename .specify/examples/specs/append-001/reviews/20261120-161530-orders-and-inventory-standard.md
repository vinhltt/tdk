---
task_id: append-001
generated_at: 2026-11-20T16:15:30+07:00
mode: standard
scope: phase-02
focus: "orders and inventory"
verdict: changes_requested
blocked_reason: ""
repos:
  - sub_workspace: null
    repo_path: .
    base_commit: 2e8a0f57c1d94b6e3a7f0c25d8e1b94f6a3c7d10
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
counts: { critical: 0, high: 2, medium: 2, low: 0, missing: 1 }
---

# Review: append-001, phase 02

## Summary

Verdict: `changes_requested`. Phase 02 adds order placement, bulk pricing and stock reservation, but orders ignore bulk pricing, the bulk threshold is off by one, stock can go negative and the low-stock list does not exist. Counts: critical 0, high 2, medium 2, low 0, missing 1 (the missing requirement is also counted under high).

## Scope

- Repo `.` (no sub-workspace), base commit `2e8a0f57c1d94b6e3a7f0c25d8e1b94f6a3c7d10`, source `fallback` (no `git-map.md` row; diffed against the recorded base).
- Slice `s1`: repo `.`, sub-workspace none, 4 files, 46 diff lines.
- Reviewed phases: 02. Skipped phases: 01 (outside `--phase 2`).
- Not reviewed: None.
- Stat only: None.
- **Generated, not reviewed**: None.

## Reviewers

1 invocations: core 1, specialist 0, routed 0, parts 0, retries 0

- tdk-code-reviewer, lenses `spec,quality,security,reliability`, s1, repo `.`, sub-workspace none, `src/index.ts` +4/−0, `src/orders/order-pricing.ts` +8/−0, `src/orders/order-service.ts` +20/−0, `src/inventory/stock-level.ts` +12/−0, ok, skills none.

**Unreviewed slices**: None.

**File coverage gaps**: None.

## Spec Compliance Matrix

| Criterion | Status | Evidence |
|---|---|---|
| FR-005 | partial | `src/orders/order-service.ts:16`, `src/orders/order-pricing.ts:7` |
| FR-006 | partial | `src/inventory/stock-level.ts:9` |
| FR-007 | missing | `requirement_ref: FR-007` |
| SC-001 | partial | `src/orders/order-service.ts:16` |
| SC-003 | partial | `src/inventory/stock-level.ts:9` |
| Phase 02: an order of several lines returns one total | implemented | `src/orders/order-service.ts:18` |
| Phase 02: the modules compile under strict type checking | implemented | `src/index.ts:10` |

**Spec coverage gaps**:

- FR-001, FR-002, FR-003, FR-004, SC-002: outside this phase; no file of slice `s1` implements them (`notChecked` of the reviewer), slice `s1`.

## Findings by severity

### critical

None.

### high

- **F1** `src/orders/order-service.ts:16` (spec, quality; s1)
  - Evidence:
    ```ts
    total += line.unitPrice * line.quantity;
    ```
  - Recommendation: price each line through `priceOrderLine`, and let it return the discount it applied so the placed order can show it.
- **F2** FR-007, missing (spec; s1)
  - Evidence: searched `src/inventory/stock-level.ts`, `src/orders/order-service.ts` and `src/index.ts` for a low-stock list or a threshold of 5 units; none exists.
  - Recommendation: add a low-stock list in its own inventory module that returns the products with fewer than 5 units on hand, and export it from the public entry point.

### medium

- **F3** `src/inventory/stock-level.ts:9` (spec, reliability; s1)
  - Evidence:
    ```ts
    const next = { sku, onHand: level.onHand - quantity };
    ```
  - Recommendation: refuse a reservation larger than the stock on hand with a typed error, and export that error from the public entry point.
- **F4** `src/orders/order-pricing.ts:7` (spec; s1)
  - Evidence:
    ```ts
    return quantity > BULK_QUANTITY ? gross * (1 - BULK_DISCOUNT) : gross;
    ```
  - Recommendation: apply the bulk discount from 10 units on (`>=`), as FR-005 requires.

### low

None.

## Not verified

None.

## Proposed Fix Phases

### G1: Bulk pricing in order placement
- Description: Price every order line through the bulk pricing rule, have the pricing function report the discount it applied, and export it from the public entry point.
- Findings: F1
- Dependencies: none
- Related Code Files:
  - Modify: `src/orders/order-service.ts`
  - Modify: `src/orders/order-pricing.ts`
  - Modify: `src/index.ts`

### G2: Bulk threshold from 10 units
- Description: Apply the bulk discount to order lines of 10 or more units instead of more than 10.
- Findings: F4
- Dependencies: none
- Related Code Files:
  - Modify: `src/orders/order-pricing.ts`

### G3: Refuse reservations below zero
- Description: Refuse a stock reservation that would take stock below zero with a typed error, and export that error from the public entry point.
- Findings: F3
- Dependencies: none
- Related Code Files:
  - Modify: `src/inventory/stock-level.ts`
  - Modify: `src/index.ts`

### G4: Low-stock list
- Description: Add a low-stock list, in its own inventory module, that returns the products with fewer than 5 units on hand, and export it from the public entry point.
- Findings: F2
- Dependencies: none
- Related Code Files:

/tdk-plan append-001 "reviews/20261120-161530-orders-and-inventory-standard.md"

## Next actions

/tdk-plan append-001 "reviews/20261120-161530-orders-and-inventory-standard.md"
