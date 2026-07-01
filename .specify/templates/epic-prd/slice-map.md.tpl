---
source_epic: "{{TASK_ID}}"
artifact_type: "slice-map"
status: draft
created: "{{CREATED_AT}}"
---

# Epic Slice Map

## Slice Table

| Slice key | Capability | Primary actor | Outcome | Depends on | Suggested child spec title | Priority |
|---|---|---|---|---|---|---|
| example-slice |  |  |  | none |  | Must |

## Suggested Build Order

1. `example-slice` - 

## Child Spec Seeds

```text
/tdk-specify <child-id> "<slice seed>"
```

## Slice Rules

- Use lowercase slug slice keys.
- Do not use formal identifiers or requirement IDs.
- Do not create a catch-all row for all features, entire MVP, or complete platform.
- Each row must be independently specifiable by a child `/tdk-specify` command.
