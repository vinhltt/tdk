# Update And Conflict Policy

`register` behavior:

- Adds missing section/domain entries.
- Updates an existing section/domain entry when the skill list differs.
- Returns `noop` when the proposal is already reflected.
- Preserves unrelated route file content, comments, and prose.
- Requires `--yes`.

`check` behavior:

- Identical duplicate routes are warnings.
- Conflicting duplicate routes are errors.

`optimize` behavior:

- Defaults to dry-run.
- Writes only with `--yes`.
- May dedupe repeated skills in one line.
- May remove identical duplicate route lines.
- Must not invent new domains, sections, or skill routes.
- Must not resolve conflicting duplicates silently.
