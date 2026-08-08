# Review And Register Workflow

Use when `tdk-scaffold-from-recommendation` produced `delegate-routing-proposal.json`.

Steps:

1. Read the current route file with the Read tool at `{docs.path}/custom-workflow/delegate-routing.md`, applying the four normalize rules in `delegate-routing-file-contract.md`: skip HTML comment lines, skip placeholder tokens, keep `@agent` tokens verbatim while prefixing other tokens with `/`, and match section/domain case-insensitively with first-wins. This replaces the removed `inspect` and `check` actions.

2. Diff the proposal:

   ```bash
   bun src/index.ts routing delegate diff --project-root <root> --proposal <proposal>
   ```

3. Review operations, `reason`, and warnings. New sub-workspace sections require name verification. Any operation whose `reason` contains `derived` (case-insensitive) must have its `domain` confirmed before register. Any `update` must have `from` → `to` compared to confirm no existing delegate is dropped.

4. Register only after approval:

   ```bash
   bun src/index.ts routing delegate register --project-root <root> --proposal <proposal> --yes
   ```

5. Verify:

   ```bash
   bun src/index.ts routing delegate verify --project-root <root> --proposal <proposal>
   ```

If the route file is missing, stop. `register` will not create it. Resolve `{docs.path}` from `.specify/.specify.json`, copy `.specify/templates/plan/delegate-routing-template.tpl` to `{docs.path}/custom-workflow/delegate-routing.md`, print the resolved path for the user, and rerun step 1.

## Why Dropping The Standalone Conflict Check Loses Nothing

Reading the file by hand in step 1 replaces a dedicated pre-flight conflict command without weakening the gate:

- `register` still asserts the route file has no conflicting duplicates and throws before writing anything.
- `diff` now prints duplicate-route warnings alongside its operations, so identical duplicates surface during review.

Conflicts are still resolved by hand-editing the route file; no command silently picks a winner.
