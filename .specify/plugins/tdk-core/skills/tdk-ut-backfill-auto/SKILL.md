---
name: tdk-ut-backfill-auto
description: "Deprecated compatibility shim. Use /tdk-plan + /tdk-implement with consumer test skill routing instead."
metadata:
  version: "3.4.1"
  deprecated: true
---

# /tdk-ut-backfill-auto - Deprecated

## Status

`/tdk-ut-backfill-auto` is deprecated and kept only as a temporary compatibility shim.

Do not use it for new work. The routed UT architecture is now:

1. Configure `{docs.path}/custom-workflow/plan-skill-routing.md`.
2. Map the single `test` domain to the consumer test skill:
   ```markdown
   ## global
   - test: /your-consumer-unit-test-skill
   ```
3. Run `/tdk-plan {feature-id}`.
4. Run `/tdk-implement {feature-id}`.

`/tdk-plan` triggers `/tdk-ut-backfill-plan` when UT planning is needed. `/tdk-ut-backfill-plan` creates `ut/plan.md` and `ut/phases/*.md`, then injects the routed consumer test skill into each UT phase's `## Delegate Skills` section.

## Direct Invocation Behavior

If a user invokes this skill directly:

1. Warn that the command is deprecated.
2. Do not orchestrate planning, generation, or test execution.
3. Point the user to:
   - `/tdk-plan {feature-id}`
   - `/tdk-ut-backfill-plan {feature-id}` for UT planning only
   - `/tdk-implement {feature-id}` for routed execution
   - `{docs.path}/custom-workflow/plan-skill-routing.md` for consumer test skill selection

## Removal Window

This file remains for one release to avoid abrupt missing-skill failures. Remove it after the routed workflow has been verified in downstream consumers.
