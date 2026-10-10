# Update And Conflict Policy

`register` behavior:

- Adds missing section/domain entries.
- Updates an existing section/domain entry when the delegate list differs.
- Returns `noop` when the proposal is already reflected.
- Preserves unrelated route file content, comments, and prose.
- Requires `--yes` and a matching `--approval <approvalDigest>` from the user-approved diff.
- Refuses to create the route file when it is missing.
- Missing approval or stale proposal/route bytes refuse mutation (`approval_required` / `stale_approval`); rerun diff and obtain fresh approval before register.

## Skill Union And Executor Replacement

The proposal defines the **entire** target delegate list; register replaces the matching route line, not individual tokens.

- Preserve skills by stable union: existing skills, approved suggestion/decision skills, then derived skills, deduplicated in that order.
- If an approved Executor Decision selects `create @new` or `reuse @new` for a route currently holding a different `@old`, the proposal replaces the old executor token(s) with the selected new executor.
  Keep the skill union, put skills before the executor, and include `replaces @old (explicit)` in `reason` for each removed executor.
  Diff must show the intentional `from` → `to`; user approval and its digest authorize that replacement.
- Never union old and new executors silently. With no explicit selection, a different suggested/derived agent is a conflict requiring clarification, not permission to dispatch both sequentially.
- Leave the old agent definition untouched; route replacement is not source deletion.
- Apply `--skills-only` / `--agents-only` only to in-scope new intent. Preserve existing out-of-scope tokens unchanged; a kind-filtered run must not replace an excluded executor.
- Confirm `unresolved-artifact` entries explicitly, defaulting to exclusion; approval of routing such an entry does not make its source or runtime ready.

## Duplicate Routes

Duplicate and conflict handling:

- Identical duplicate routes are warnings. `diff` prints them alongside its operations.
- Conflicting duplicate routes — the same section/domain with different delegate lists — are errors. `diff`, `register`, and `verify` all refuse to proceed until they are resolved.

Cleanup is a hand-edit, not a command. No action deduplicates or rewrites routes on its own. To clean the route file:

- Delete identical duplicate route lines, keeping the first occurrence, since first-wins is the read order.
- Merge repeated delegates within one line into a single list.
- Resolve a conflicting duplicate by choosing the correct delegate list yourself and deleting the other line. Never let a tool pick silently.
- Do not invent new domains, sections, or delegate routes while cleaning.
