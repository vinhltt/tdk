# Data Flow: {FEATURE_NAME}

<!--
  Feature-level read/write flows. Table shapes reuse the memory flow template
  (Steps, External Dependencies) scoped to this feature. Cite FR-* for flows.
  Text-first; the Mermaid block is OPTIONAL.
-->

## Key Entities

<!-- From spec §6 Key Entities. What each represents; no storage/implementation detail. -->

- **{Entity}**: {what it represents, key attributes}

## Read / Write Flows

<!-- One row per step. Cite the FR-* the step satisfies. -->

| Step | Action | Component | Source (FR-*) | Notes |
|------|--------|-----------|---------------|-------|
| 1 | {action} | {service/module} | FR-001 | {notes} |

## External Dependencies

| Dependency | Purpose | Notes |
|------------|---------|-------|
| {service/API} | {purpose} | {notes} |

## State & Lifecycle

<!-- Entity state transitions relevant to the flows above. -->

| Entity | From | Event | To |
|--------|------|-------|----|
| {entity} | {state} | {event} | {state} |

## Diagram (optional)

<!-- OPTIONAL. Delete this section if not used. -->

```mermaid
flowchart LR
  A[{actor}] -->|{action}| B[{component}]
```
