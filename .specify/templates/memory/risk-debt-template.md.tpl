---
title: "{RiskOrDebtTitle}"
aliases:
  - "{risk-or-debt-id}"
  - "{risk-or-debt-title}"
type: risk-debt
id: "risk-debt.{risk-or-debt-id}"
status: active
authority: memory
binding: true
related:
  - path: decisions/{decision-id}.md
    rel: decision
  - path: operations/{runbook-name}-runbook.md
    rel: mitigation
tags:
  - memory/risk-debt
created_at: "{YYYY-MM-DD}"
updated_at: "{YYYY-MM-DD}"
updated_by: tdk-memory-update
---

# {RiskOrDebtTitle}

## Type

{risk/debt/assumption}

## Description

{What may go wrong or what debt exists.}

## Impact

| Dimension | Level | Notes |
|---|---|---|
| User | {High/Medium/Low} | {notes} |
| Engineering | {High/Medium/Low} | {notes} |

## Mitigation

{Mitigation, owner, and review trigger.}

## Source References

- {source file, ticket, or accepted user statement}
