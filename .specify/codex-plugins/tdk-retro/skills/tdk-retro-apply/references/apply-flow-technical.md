# Apply Flow - Technical Targets

Technical entries target T1 through T6.

## Steps

1. Read current `target_path`.
2. Build a minimal diff preview from current content to proposed content.
3. Ask the user to approve, reject, or skip.
4. If approved, apply the edit with the smallest safe change.
5. Re-read the target path and verify the proposed content is present.
6. Mark the entry `applied`.

## Guards

- Never edit files outside the current project.
- Never edit `.specify/memory/` in this flow.
- Do not apply entries without explicit user approval.
- If the path does not exist and operation is not `add`, mark blocked.
