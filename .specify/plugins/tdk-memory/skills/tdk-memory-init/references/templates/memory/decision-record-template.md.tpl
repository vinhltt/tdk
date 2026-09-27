---
title: "{DecisionTitle}"
aliases:
  - "ADR {decision-id}"
  - "{decision-title}"
type: decision-record
id: "decision.{decision-id}"
status: active
authority: memory
binding: true
related:
  - path: quality-requirements/{quality-attribute}.md
    rel: quality
  - path: risks-and-debt/{risk-or-debt-id}.md
    rel: risk
tags:
  - memory/decision
created_at: "{YYYY-MM-DD}"
updated_at: "{YYYY-MM-DD}"
updated_by: tdk-memory-update
---

# {DecisionTitle}

## Status

{proposed/accepted/deprecated/superseded}

## Context

{Decision context and forces.}

## Decision

{Decision statement.}

## Consequences

| Consequence | Impact |
|---|---|
| {consequence} | {impact} |

## Source References

- {source file, ticket, or accepted user statement}
