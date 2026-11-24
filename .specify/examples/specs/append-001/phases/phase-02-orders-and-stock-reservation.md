---
task_id: append-001
phase: 2
title: "Orders and stock reservation"
status: done
priority: P2
effort: "3h"
dependencies: [1]
parallel_safe: never
parallel_reason: "writes the shared barrel src/index.ts"
---

# Phase 02: Orders and stock reservation

## Context Links

- Plan: `../plan.md`
- Spec: `../spec.md`

## Overview

Implement order placement with bulk pricing and stock reservation (FR-005 to FR-007) and re-export them from the public entry point.

## Key Insights

- Order placement and stock reservation are separate calls; neither module imports the other.
- Pricing stays in its own module so checkout and reports can reuse it.

## Requirements

- Functional: order lines of 10 or more units get a 10% bulk discount (FR-005).
- Functional: a reservation never takes stock below zero (FR-006).
- Functional: staff can list the products with fewer than 5 units on hand (FR-007).
- Non-functional: no new runtime dependency.

## Architecture

`src/orders/order-service.ts`, `src/orders/order-pricing.ts` and `src/inventory/stock-level.ts` are leaf modules re-exported by `src/index.ts`.

## Related Code Files

- Modify: `src/index.ts`
- Modify: `src/orders/order-pricing.ts`
- Modify: `src/orders/order-service.ts`
- Modify: `src/inventory/stock-level.ts`

## Implementation Steps

1. Implement bulk pricing for one order line.
2. Implement stock reservation.
3. Implement order placement over pricing and reservation.
4. Re-export orders and stock from the entry point.

## Todo List

- [x] Pricing module
- [x] Stock module
- [x] Order service
- [x] Entry point re-exports

## Success Criteria

- [x] An order of several lines returns one total.
- [x] The modules compile under strict type checking.

## Risk Assessment

A caller that places an order without reserving stock can oversell; reservation stays an explicit call.

## Security Considerations

None.

## Next Steps

Review the delivered modules.

## Unresolved Questions

None.
