# Learning Delta Schema

`learning-delta.md` is the output of `/tdk-retro-propose {task-id}`. It contains proposed changes that `/tdk-retro-apply` can review and apply.

## Required Header

```markdown
# Learning Delta - {task-id}

- Generated at: {ISO timestamp}
- Source feedback: `{feature-dir}/retro-feedback.md`
- Entry limit: 10
```

## Entry Format

~~~markdown
## Entries

### Entry 1
- status: proposed
- severity: high
- target_type: technical | memory
- target_id: T1 | T2 | T3 | T4 | T5 | T6 | K1 | K2
- target_path: `{path}`
- operation: add | update | replace | deprecate
- domain: {required for memory entries, omit for technical entries}
- rationale: {why this change prevents recurrence}
- evidence:
  - `{source}`: {short evidence}
- content:
  ```markdown
  {proposed content}
  ```
~~~

## Status Values

- `proposed`: ready for user review.
- `approved`: user approved and apply attempted.
- `rejected`: user rejected.
- `blocked`: cannot apply without another action, such as `/tdk-memory-init`.
- `applied`: successfully applied.

## Rules

- Maximum 10 entries. Prefer higher severity and repeated patterns.
- One entry equals one reviewable change unit.
- Memory entries must include `domain` and must not directly edit `.specify/memory/`.
- Unknown memory domains must be `blocked`, not guessed.
- Every entry needs evidence from `retro-feedback.md`.
