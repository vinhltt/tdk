---
task_id: append-001
phase: 4
title: "Invoice discount order and rounding"
status: done
priority: P2
effort: "1h"
dependencies: []
parallel_safe: auto
---

# Phase 04: Invoice discount order and rounding

## Context Links

- Plan: `../plan.md`
- Spec: `../spec.md`
- Review: `../reviews/20261121-093012-phase-01-standard.md` (F2, F3)

## Overview

Apply the invoice discount to the subtotal before tax and round the final total to cents (FR-002, SC-001).

## Key Insights

- Rounding once, at the end, keeps totals equal to the accountant's hand computation.

## Requirements

- Functional: the discount is subtracted before tax.
- Functional: the displayed total has two decimals.
- Non-functional: the public signatures of the invoice functions do not change.

## Architecture

The change stays inside the invoice module.

## Related Code Files

- Modify: `src/billing/invoice-total.ts`

## Implementation Steps

1. Subtract the discount from the subtotal, then apply tax.
2. Format the total with two decimals.

## Todo List

- [x] Discount before tax
- [x] Total rounded to cents

## Success Criteria

- [x] Every sample basket matches its hand-computed total to the cent.

## Risk Assessment

Totals of invoices issued before the fix differ from new ones; they are not recomputed.

## Security Considerations

None.

## Next Steps

None.

## Unresolved Questions

None.
