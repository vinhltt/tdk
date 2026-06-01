# Retro Feedback Schema

`retro-feedback.md` is the output of `/tdk-retro-collect {task-id}`. It records observed signals only. Do not propose fixes here.

## Required Header

```markdown
# Retro Feedback - {task-id}

- Generated at: {ISO timestamp}
- Last updated at: {ISO timestamp}
- Feature dir: `{feature-dir}`
- Sources available: {comma-separated source list}
- Collection mode: create | update
```

## Required Sections

```markdown
## From: Reviews
- [severity] {finding}
  - Evidence: `{file}` or quoted short excerpt
  - Suggested target: {optional T/K target hint}

## From: Phase Drift
- [severity] {drift}
  - Planned: {plan intent}
  - Actual: {phase content or user-confirmed change}
  - Evidence: `{phase-file}`

## From: UT Execution
- [severity] {test signal}
  - Evidence: `{ut/plan.md}` or command output summary

## From: Langfuse Traces
- Status: fetched | skipped
- Reason: {required when skipped}
- Findings:
  - [severity] {trace finding}
    - Evidence: session `{session-id}`, trace `{trace-id}`

## From: User Feedback
- id: UF-001
  status: active | removed
  severity: {critical|high|medium|low}
  feedback: {user-provided signal}
  evidence: user answer
  created_at: {ISO timestamp}
  removed_at: {ISO timestamp, required when status is removed}
  removal_reason: {optional}
```

## Severity

Use one of:
- `critical`: would cause incorrect implementation or unsafe behavior.
- `high`: likely repeated failure or costly rework.
- `medium`: useful workflow improvement.
- `low`: cosmetic or low-frequency improvement.

## Rules

- Keep every finding evidence-backed.
- Use short excerpts only; avoid dumping full reports or traces.
- If a source is unavailable, keep the section and record `Status: skipped` with a clear reason.
- Do not fabricate Langfuse findings when CLI, `.env`, or `sessions.txt` is unavailable.
- Preserve active user feedback across update runs unless the user explicitly removes it.
- Removed user feedback is no longer an active learning signal; `/tdk-retro-propose` must ignore entries with `status: removed`.
