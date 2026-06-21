# Screen Flow: {FEATURE_NAME}

<!--
  Multi-screen user journeys. Table shapes reuse the memory screen-flow template
  (Steps, Branch Conditions, Related API Calls) scoped to this feature.
  Derive journeys from spec §5 acceptance scenarios. Text-first; Mermaid OPTIONAL.
  Omit this artifact's content if the feature has no UI surface.
-->

## Primary Journeys

<!-- From spec §5 acceptance scenarios. -->

- {Journey name}: {actor} {goal}

## Screen List

- {screen}: {role in the journey}

## Steps

| Step | Screen | Action | Response | Next |
|------|--------|--------|----------|------|
| 1 | {screen} | {action} | {system response} | Step 2 |

## Branch Conditions

| Condition | Branch To |
|-----------|-----------|
| {condition} | {screen} |

## Related APIs

| Screen | API | Purpose |
|--------|-----|---------|
| {screen} | `{METHOD} /api/{path}` | {purpose} |

## Diagram (optional)

<!-- OPTIONAL. Delete this section if not used. -->

```mermaid
flowchart TD
  S1[{screen}] -->|{action}| S2[{screen}]
```
