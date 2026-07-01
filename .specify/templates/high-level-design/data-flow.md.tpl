# Data Flow: {FEATURE_NAME}

<!--
  Parent epic data/entity lifecycle assumptions across slices.
  Use slice keys and epic PRD/HLD source pointers. Text-first; Mermaid OPTIONAL.
-->

## Key Entities

<!-- From epic-prd/prd.md and epic-prd/slice-map.md wording. No storage detail unless source states it. -->

- **{Entity}**: {what it represents, source pointer}

## Cross-Slice Flows

<!-- One row per cross-slice flow. -->

| Step | Slice key | Action | Producer / Consumer | Notes |
|------|-----------|--------|---------------------|-------|
| 1 | {slice-key} | {action} | {producer -> consumer} | {notes} |

## External Dependencies

| Dependency | Purpose | Source / Assumption |
|------------|---------|---------------------|
| {service/API} | {purpose} | {source or `assumed`} |

## State & Lifecycle

<!-- Entity state transitions relevant to epic decomposition. -->

| Entity | From | Event | To | Slice key |
|--------|------|-------|----|-----------|
| {entity} | {state} | {event} | {state} | {slice-key} |

## Diagram (optional)

<!-- OPTIONAL. Delete this section if not used. -->

```mermaid
flowchart LR
  A[{slice}] -->|{handoff}| B[{slice}]
```
