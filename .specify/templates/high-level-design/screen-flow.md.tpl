# Screen Flow: {FEATURE_NAME}

<!--
  Parent epic user journeys and slice touchpoints.
  Derive journeys from epic PRD personas, jobs, outcomes, and slice map.
  Text-first; Mermaid OPTIONAL. Omit this artifact's content if there is no UI surface.
-->

## Epic Journeys

<!-- From epic-prd/prd.md personas/jobs/outcomes. -->

- {Journey name}: {actor} {goal}

## Slice Touchpoints

| Slice key | Actor | Touchpoint | Purpose |
|-----------|-------|------------|---------|
| {slice-key} | {actor} | {screen/API/system} | {purpose} |

## Steps

| Step | Journey | Action | Response | Next |
|------|---------|--------|----------|------|
| 1 | {journey} | {action} | {system response} | Step 2 |

## Branch Conditions

| Condition | Branch To |
|-----------|-----------|
| {condition} | {journey or slice key} |

## Related Interfaces

| Interface | Slice key | Purpose |
|-----------|-----------|---------|
| {UI/API/system boundary} | {slice-key} | {purpose} |

## Diagram (optional)

<!-- OPTIONAL. Delete this section if not used. -->

```mermaid
flowchart TD
  S1[{slice}] -->|{handoff}| S2[{slice}]
```
