---
title: "{StateMachineName} State Machine"
aliases:
  - "{StateMachineName}"
  - "{state-machine-name}"
type: state-machine
id: "state-machine.{state-machine-name}"
status: active
authority: memory
binding: true
related:
  - path: domains/{domain}/flows/{flow-name}-flow.md
    rel: runtime-flow
tags:
  - memory/state-machine
  - domain/{domain}
created_at: "{YYYY-MM-DD}"
updated_at: "{YYYY-MM-DD}"
updated_by: tdk-memory-update
---

# {StateMachineName}

## States

| State | Meaning | Terminal |
|---|---|---|
| `{state}` | {meaning} | Yes/No |

## Transitions

| From | Event | To | Guard |
|---|---|---|---|
| `{from}` | `{event}` | `{to}` | {condition} |

## Source References

- {source file, ticket, or accepted user statement}
