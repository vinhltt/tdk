# Memory Delegate Contract

`tdk-retro-apply` delegates memory writes to `/tdk-memory-update`.

## Contract

Input from `learning-delta.md`:

```markdown
- target_type: memory
- target_id: K1
- domain: authentication
- content:
  ```markdown
  Add business rule: 2FA required for transactions above 1M.
  ```
```

Delegate command:

```text
/tdk-memory-update In domain authentication, add business rule: 2FA required for transactions above 1M.
```

## Responsibilities

`tdk-retro-apply`:
- Confirms user approval.
- Confirms memory is initialized.
- Confirms domain exists.
- Composes the natural language update.
- Updates `learning-delta.md` status.

`tdk-memory-update`:
- Routes the natural language to the correct memory file.
- Applies section anchor updates.
- Regenerates `memory-index.md`.
- Updates `memory.yaml` checksums.

## Non-goals

- No direct writes to `.specify/memory/`.
- No domain creation. Unknown domains require `/tdk-memory-init`.
