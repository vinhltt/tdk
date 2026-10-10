# Review And Register Workflow

Use for a reviewed `delegate-routing-proposal.json`, including reuse-only and route-only scaffold runs.

Steps:

1. Read the current route file with the Read tool at `{docs.path}/custom-workflow/delegate-routing.md`, applying the four normalize rules in `delegate-routing-file-contract.md`: skip HTML comment lines, skip placeholder tokens, keep `@agent` tokens verbatim while prefixing other tokens with `/`, and match section/domain case-insensitively with first-wins. This replaces the removed `inspect` and `check` actions.

2. Diff the proposal:

   ```bash
   bun src/index.ts routing delegate diff --project-root <root> --proposal <proposal>
   ```

3. Review operations, `reason`, and warnings, then ask approval for the exact displayed diff and its `approvalDigest`.
   New sub-workspace sections require name verification. Any operation whose `reason` contains `derived` (case-insensitive) must have its `domain` confirmed before register.
   Compare every update's `from` → `to`: preserve the skill union, but an approved `create @new` / `reuse @new` decision intentionally replaces a different `@old`.
   Confirm its `replaces @old (explicit)` reason and ensure both executors are not silently retained; never delete the old agent file.
   Reasons containing `unresolved-artifact` require explicit consent and remain unresolved, not dispatch-ready.
   Store the returned digest only in this invocation's approval context; the proposal itself is not mutation approval.

4. Register only after that diff is approved, passing its exact digest:

   ```bash
   bun src/index.ts routing delegate register --project-root <root> --proposal <proposal> --approval <approvalDigest> --yes
   ```

   Missing `--approval` returns `approval_required`; proposal or route bytes changed returns `stale_approval`, with no route write.
   Discard that approval, rerun diff, show its new operations/warnings/digest, and obtain fresh user approval. Never silently register a revised diff.

5. Verify route equality:

   ```bash
   bun src/index.ts routing delegate verify --project-root <root> --proposal <proposal>
   ```

   Accept `ok: true` with `scope: "route-equality"` only as equality with the proposal.
   It does not check source artifacts, harness installation, executor loading, or current plan delegates.
   Report those separately; if an existing plan has routed phases, print `/tdk-plan <TASK_ID> --refresh-routing` rather than mutating it here.

If the route file is missing, stop. `register` will not create it. Resolve `{docs.path}` from `.specify/.specify.json`, print the resolved absolute path, and ask the user to opt in before copying `.specify/templates/plan/delegate-routing-template.tpl` there. Rerun step 1 and obtain a new diff/approval digest after creation; a digest for a missing file cannot authorize the created file.

## Why Dropping The Standalone Conflict Check Loses Nothing

Reading the file by hand in step 1 replaces a dedicated pre-flight conflict command without weakening the gate:

- `register` still asserts the route file has no conflicting duplicates and throws before writing anything.
- `diff` now prints duplicate-route warnings alongside its operations, so identical duplicates surface during review.

Conflicts are still resolved by hand-editing the route file; no command silently picks a winner.
