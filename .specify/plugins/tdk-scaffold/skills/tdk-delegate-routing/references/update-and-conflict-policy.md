# Update And Conflict Policy

`register` behavior:

- Adds missing section/domain entries.
- Updates an existing section/domain entry when the delegate list differs.
- Returns `noop` when the proposal is already reflected.
- Preserves unrelated route file content, comments, and prose.
- Requires `--yes`.
- Refuses to create the route file when it is missing.

Duplicate and conflict handling:

- Identical duplicate routes are warnings. `diff` prints them alongside its operations.
- Conflicting duplicate routes — the same section/domain with different delegate lists — are errors. `diff`, `register`, and `verify` all refuse to proceed until they are resolved.

Cleanup is a hand-edit, not a command. No action deduplicates or rewrites routes on its own. To clean the route file:

- Delete identical duplicate route lines, keeping the first occurrence, since first-wins is the read order.
- Merge repeated delegates within one line into a single list.
- Resolve a conflicting duplicate by choosing the correct delegate list yourself and deleting the other line. Never let a tool pick silently.
- Do not invent new domains, sections, or delegate routes while cleaning.
