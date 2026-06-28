---
title: "{ReportName} Report Spec"
aliases:
  - "{ReportName}"
  - "{report-name} export"
type: report-spec
id: "report.{report-name}"
status: active
authority: memory
binding: true
related:
  - path: data-model/{table-name}.md
    rel: source-data
  - path: quality-requirements/{quality-attribute}.md
    rel: quality
tags:
  - memory/report
created_at: "{YYYY-MM-DD}"
updated_at: "{YYYY-MM-DD}"
updated_by: tdk-memory-update
---

# {ReportName} Report Spec

## Purpose

{Business purpose and audience.}

## Fields

| Field | Source | Transform | Notes |
|---|---|---|---|
| `{field}` | `{source}` | {transform} | {notes} |

## Filters

| Filter | Type | Required | Description |
|---|---|---|---|
| `{filter}` | `{type}` | Yes/No | {description} |

## Source References

- {source file, ticket, or accepted user statement}
