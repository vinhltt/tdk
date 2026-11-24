---
task_id: append-001
phase: 1
title: "Checkout, catalog and export modules"
status: done
priority: P2
effort: "3h"
dependencies: []
parallel_safe: never
parallel_reason: "writes the shared barrel src/index.ts"
---

# Phase 01: Checkout, catalog and export modules

## Context Links

- Plan: `../plan.md`
- Spec: `../spec.md`

## Overview

Implement the session, invoice, product search and sales export modules (FR-001 to FR-004) and re-export them from the public entry point.

## Key Insights

- Each module is a leaf: it imports nothing from the other store modules.
- The entry point is the only file every module touches.

## Requirements

- Functional: sessions expire one hour after issue (FR-001).
- Functional: invoice totals apply the discount before tax, rounded to cents (FR-002).
- Functional: product search is case-insensitive (FR-003).
- Functional: the sales export is valid CSV (FR-004).
- Non-functional: no new runtime dependency.

## Architecture

Four leaf modules under `src/auth`, `src/billing`, `src/catalog` and `src/reports`, each re-exported by `src/index.ts`.

## Related Code Files

- Modify: `src/index.ts`
- Modify: `src/auth/session-token.ts`
- Modify: `src/billing/invoice-total.ts`
- Modify: `src/catalog/product-search.ts`
- Modify: `src/reports/report-export.ts`

## Implementation Steps

1. Implement session issue and expiry.
2. Implement invoice total and its display format.
3. Implement product search.
4. Implement the CSV export.
5. Re-export the four modules from the entry point.

## Todo List

- [x] Session module
- [x] Invoice module
- [x] Search module
- [x] Export module
- [x] Entry point re-exports

## Success Criteria

- [x] Every module is reachable from `src/index.ts`.
- [x] The modules compile under strict type checking.

## Risk Assessment

The shared entry point is a merge hotspot; it holds re-exports only.

## Security Considerations

Session token values come from a cryptographic random source.

## Next Steps

Phase 02 adds orders and stock on top of this entry point.

## Unresolved Questions

None.
