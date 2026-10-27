# Apply Flow - Memory Targets

Memory entries target K1 and K2. They are never direct file edits.

## Steps

1. Confirm the memory status block (run once per apply run, see `SKILL.md` Step 5) reports `status: ready`.
2. Confirm the entry has `domain`.
3. Confirm the domain is listed in the block `domains` field.
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
