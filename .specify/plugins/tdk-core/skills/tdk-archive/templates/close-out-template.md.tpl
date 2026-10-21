---
task_id: "{{TASK_ID}}"
title: "{{TITLE}}"
archived_at: "{{ARCHIVED_AT}}"
archived_from: {{ARCHIVED_FROM}}
feature_branch: "{{FEATURE_BRANCH}}"
phases:
  total: {{PHASES_TOTAL}}
  done: {{PHASES_DONE}}
  skipped: {{PHASES_SKIPPED}}
review_verdict: "{{REVIEW_VERDICT}}"
memory_status: {{MEMORY_STATUS}}
---

# Close-out: {{TITLE}}

## Outcome

{{OUTCOME}}

## What shipped

| Phase | Result | Repo / branch |
|---|---|---|
{{SHIPPED_ROWS}}

## Decisions & deviations

{{DECISIONS_AND_DEVIATIONS}}

## Review & verification

{{REVIEW_AND_VERIFICATION}}

## Debt & follow-ups

{{DEBT_AND_FOLLOW_UPS}}

## SC-* results

| SC | Target | Observed | Result |
|---|---|---|---|
{{SC_ROWS}}

## Memory candidates

| id | type | domain | content | status |
|---|---|---|---|---|
{{MEMORY_ROWS}}
