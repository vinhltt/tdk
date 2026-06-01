# Apply Flow - Memory Targets

Memory entries target K1 and K2. They are never direct file edits.

## Steps

1. Confirm `.specify/memory/memory-index.md` and `.specify/memory/memory.yaml` exist.
2. Confirm the entry has `domain`.
3. Confirm the domain exists in `memory-index.md`.
4. Ask the user to approve, reject, or skip.
5. If approved, invoke `/tdk-memory-update` with natural language:

```text
In domain {domain}, {content}
```

6. After `/tdk-memory-update` finishes, verify memory checksums through that skill's normal flow.
7. Mark the entry `applied` only after successful delegation.

## Block Conditions

- Memory not initialized.
- Unknown domain.
- Missing `domain` field.
- `/tdk-memory-update` not available.
