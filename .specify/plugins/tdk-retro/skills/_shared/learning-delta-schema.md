# Learning Delta Schema

`learning-delta.md` is the output of `/tdk-retro-propose {task-id}`. It contains proposed changes that `/tdk-retro-apply` can review and apply.

## Required Header

`{task-id}` is the canonical `taskId` from `check-prerequisites.ts --allow-archived`, not the raw argument (see `archived-spec-handling.md`). `{feature-dir}` is the resolved feature directory.

```markdown
# Learning Delta - {task-id}

- Generated at: {ISO timestamp}
- Source feedback: `{feature-dir}/retro-feedback.md`
- Entry limit: 10 per run
```

A re-run does not change the header.

## Entry Format

Fields keep this order, and `status` is always first.

~~~markdown
## Entries

### Entry 1
- status: proposed
- severity: high
- target_type: technical | memory
- target_id: T1 | T2 | T3 | T4 | T5 | T6 | K1 | K2
- target_path: `{repo-relative path, no leading ./}`
- operation: add | update | replace | deprecate
- domain: {required for memory entries, omit for technical entries}
- rationale: {the failure this learning prevents, and why this change prevents it}
- prior: none | {task-id}#Entry {n}: related | reverses | repeats-rejected; {next prior}
- new_evidence: {only with reverses or repeats-rejected: what changed since that decision, or none}
- decided_at: {ISO timestamp, written by apply when the entry becomes applied or rejected}
- rejection_reason: {optional, written by apply when the entry becomes rejected}
- blocked_reason: {required while status is blocked}
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
- `blocked`: cannot apply without another action, such as `/tdk-memory-init`. `blocked_reason` says why; `/tdk-retro-propose` moves it back to `proposed` once that cause is gone. A `blocked_reason` that starts with `manual:` means only a person can resolve it: `/tdk-retro-propose` never moves that entry back to `proposed`, and apply never edits its `target_path`.
- `applied`: successfully applied.

## Rules

- Maximum 10 new entries per run. Prefer higher severity and repeated patterns.
- One entry equals one reviewable change unit.
- An entry's id is `{task-id}#Entry {n}`. Numbers are never reused or renumbered.
- Every new entry carries `prior`. An entry without `prior` predates the field: read it as unknown, not as `none`.
- `reverses` also covers narrowing that drops an obligation of the prior entry.
- Evidence is new only when its source is absent from the prior entry's `evidence` and was produced after the prior entry's `decided_at` (the file's `Generated at` when `decided_at` is missing), or when it is user feedback that names the prior entry's id. A source with no determinable date is not new.
- Entries are append-only. `applied` and `rejected` entries stay byte-identical. Before that point only `status`, `decided_at`, `rejection_reason`, and `blocked_reason` change, plus `new_evidence` of an entry recorded as `new_evidence: none`, when the user approves it or when a propose re-run finds an active `UF-###` item that names its prior id.
- Never edit another spec's `learning-delta.md`.
- An entry is superseded when a later `applied` entry names it with `reverses`. This is derived and never stored.
- Free-text fields stay on one line: collapse line breaks to a space. Only the status line may start with `- status:` at column 0.
- Memory entries must include `domain` and must not directly edit the memory root.
- Unknown memory domains must be `blocked`, not guessed.
- Every entry needs evidence from `retro-feedback.md`.
