---
task_id: append-001
title: "Sample store backend"
status: done
priority: P2
effort: 8h
tags: [backend, sample]
created: 2026-11-10
mode: default
test_mode: none
scope_mode: skipped
blockedBy: []
blocks: []
red_team_session: 0
validation_session: 0
schema_version: 3
---

# Sample store backend

## Context

- Spec: [spec.md](spec.md)

## Problem

Checkout, catalog search, the sales export and order intake are done by hand, so totals drift and stock goes negative.

## Goal

One small module per store rule, re-exported from a single entry point, covering FR-001 to FR-007.

## Scope

- Writable: `src/`
- Read-only: everything else

## Phases

| # | File | Status | Blocks | BlockedBy |
|---|------|--------|--------|-----------|
| 01 | [phase-01-checkout-catalog-and-export-modules](phases/phase-01-checkout-catalog-and-export-modules.md) | done | 02 | — |
| 02 | [phase-02-orders-and-stock-reservation](phases/phase-02-orders-and-stock-reservation.md) | done | — | 01 |
| 03 | [phase-03-session-lifetime-in-milliseconds](phases/phase-03-session-lifetime-in-milliseconds.md) | done | — | — |
| 04 | [phase-04-invoice-discount-order-and-rounding](phases/phase-04-invoice-discount-order-and-rounding.md) | done | — | — |

## Success Metrics

- SC-001: invoice totals match a hand-computed total to the cent.
- SC-002: the sales export opens in a spreadsheet without shifted columns.
- SC-003: no order leaves negative stock.

## Key Constraints

- Modules stay independent; only `src/index.ts` imports them all.
- No new runtime dependency.

## Decisions Made

| Decision | Chosen | Alternatives | Rationale |
|----------|--------|--------------|-----------|
| Module layout | One module per rule | One store service | KISS: a fix touches one file |
| Public surface | Re-exports in `src/index.ts` | Deep imports | One stable entry point |
