---
task_id: append-001
title: "Sample store backend"
status: done
feature_branch: "feature/append-001"
created: "2026-11-10"
input: 'User description: "Small store backend: sessions, invoices, search, CSV export, orders and stock."'
memory_context_loaded: false
schema_version: 1
---
# Feature Specification: Sample store backend

## 1. Problem Statement *(mandatory)*

Shop staff of a small online store run checkout, catalog search, the daily sales export and order intake by hand from spreadsheets. Totals are recomputed manually, sessions are shared between staff, and stock goes negative without anyone noticing. The store needs one small backend module set that covers these jobs with the rules below.

## 2. Scope Boundary *(mandatory)*

**In scope:**
- Shopper sessions with a fixed lifetime (Rationale: checkout needs a signed-in shopper).
- Invoice totals with discount and tax (Rationale: totals are the most error-prone manual step).
- Case-insensitive product search (Rationale: staff search by partial names).
- CSV export of the daily sales report (Rationale: the accountant imports it into a spreadsheet).
- Order placement with bulk pricing and stock reservation (Rationale: order intake is the core flow).
- A daily low-stock list (Rationale: staff reorder before stock runs out).

**Out of scope:**
- Payments and refunds (YAGNI: handled by the payment provider).
- A user interface (YAGNI: staff use an existing admin tool).

## 3. Impact Surface *(mandatory)*

N/A — monolith project.

## 4. Evaluated Approaches *(recommended)*

### Option A: One module per rule
- **Scope**: one small module per business rule, re-exported from one entry point.
- **Pros**: each rule can be tested and fixed on its own.
- **Cons**: one shared entry point that every module touches.

### Option B: One service for everything
- **Scope**: a single store service holding every rule.
- **Pros**: one place to read.
- **Cons**: every fix touches the same file.

**Recommended**: Option A — rules stay independent, which keeps fixes small.

## 5. User Requirements & Testing *(mandatory)*

### UR-1: Check out a basket (P1)
A shopper signs in, places an order and receives a correct invoice total.
**Why this priority**: checkout is the reason the store exists.
**Independent Test**: place one order and compare the invoice total with a hand-computed value.
**Acceptance Scenarios**:
1. **Given** a signed-in shopper, **When** they order 10 units of one item with a discount, **Then** the total applies bulk pricing, the discount before tax, and is rounded to cents.

### UR-2: Find and report products (P2)
Staff search the catalog and export the daily sales report.
**Why this priority**: daily operations depend on it, but checkout works without it.
**Independent Test**: search by a lowercase partial name and open the export in a spreadsheet.
**Acceptance Scenarios**:
1. **Given** a product named "Blue Mug", **When** staff search "blue", **Then** the product is found.
2. **Given** a product name with a comma, **When** the report is exported, **Then** the spreadsheet shows it in one cell.

### UR-3: Keep stock honest (P2)
Staff see stock that never goes negative and get a daily list of products to reorder.
**Why this priority**: overselling causes refunds.
**Independent Test**: reserve more than is on hand and check the reservation is refused.
**Acceptance Scenarios**:
1. **Given** 3 units on hand, **When** an order reserves 5, **Then** the reservation is refused.
2. **Given** 3 units of one product and 20 of another, **When** staff ask for the low-stock list, **Then** only the first product is listed.

### Edge Cases

- An empty search query returns no products.
- An export with no rows still has its header line.

## 6. Functional Requirements *(mandatory)*

- **FR-001**: System MUST expire a shopper session one hour after it is issued.
- **FR-002**: System MUST apply the invoice discount before tax and round the total to cents.
- **FR-003**: System MUST match product search queries case-insensitively.
- **FR-004**: System MUST export the daily sales report as valid CSV, quoting fields that contain commas or quotes.
- **FR-005**: System MUST price order lines of 10 or more units with a 10% bulk discount.
- **FR-006**: System MUST refuse a stock reservation that would take stock below zero.
- **FR-007**: System MUST list the products that have fewer than 5 units on hand, for the daily reorder.

### Key Entities

- **Session token**: identifies a signed-in shopper; has an issue time.
- **Invoice line**: unit price and quantity of one billed item.
- **Order line**: product, unit price and quantity of one ordered item.
- **Stock level**: units on hand for one product.

## 7. Success Criteria *(mandatory)*

- **SC-001**: Invoice totals match a hand-computed total to the cent for every sample basket.
- **SC-002**: The exported sales report opens in a spreadsheet with one product per row and no shifted columns.
- **SC-003**: No order leaves any product with negative stock.

## 8. Risks & Mitigations *(recommended)*

| Risk | Impact | Mitigation |
|---|---|---|
| Rounding differs from the accountant's spreadsheet | Medium | Round once, at the end, to cents |
| Shared entry point becomes a merge hotspot | Low | Keep it to re-exports only |

## 9. Unresolved Questions *(mandatory)*

None

## Specification Quality Gate

| Field | Value |
|---|---|
| Status | pass |
| Iterations | 1 |
| Source | tdk-specify |
| Last Checked | 2026-11-10 09:00 |

### Blocking Issues

None.

## Clarifications

<!-- Reserved for /tdk-clarify sessions. Do not remove this section. -->
