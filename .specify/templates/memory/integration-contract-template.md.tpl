---
title: "{IntegrationName} Integration Contract"
aliases:
  - "{IntegrationName} API"
  - "{integration-name} contract"
type: integration-contract
id: "integration.{integration-name}"
status: active
authority: memory
binding: true
related:
  - path: domains/{domain}/services.md
    rel: caller
  - path: operations/{integration-name}-runbook.md
    rel: runbook
tags:
  - memory/integration
  - domain/{domain}
created_at: "{YYYY-MM-DD}"
updated_at: "{YYYY-MM-DD}"
updated_by: tdk-memory-update
---

# {IntegrationName} Integration Contract

## Scope

{What this integration owns and does not own.}

## Endpoint Or Event

| Field | Value |
|---|---|
| Protocol | {HTTP/event/webhook/job} |
| Direction | {inbound/outbound/internal} |
| Owner | {team/system} |

## Contract

| Element | Type | Required | Description |
|---|---|---|---|
| `{field}` | `{type}` | Yes/No | {description} |

## Failure Handling

| Failure | Expected Behavior | Retry |
|---|---|---|
| {failure} | {behavior} | {policy} |

## Source References

- {source file, ticket, or accepted user statement}
