---
name: tdk-ut-backfill-impl
description: "Deprecated compatibility shim. Test implementation is handled by consumer test skills from plan-skill-routing.md."
metadata:
  version: "3.4.1"
  deprecated: true
---

# /tdk-ut-backfill-impl - Deprecated

## Status

`/tdk-ut-backfill-impl` is deprecated and kept only as a temporary compatibility shim.

TDK no longer owns unit-test implementation. It owns UT planning through `/tdk-ut-backfill-plan`; the consumer project owns concrete test generation and execution through the skill mapped to the `test` domain in `plan-skill-routing.md`.

## New Flow

1. Configure `{docs.path}/custom-workflow/plan-skill-routing.md`:
   ```markdown
   ## global
   - test: /your-consumer-unit-test-skill
   ```
2. Run `/tdk-plan {feature-id}` or `/tdk-ut-backfill-plan {feature-id}` to create UT planning artifacts.
3. Run `/tdk-implement {feature-id}`.
4. `/tdk-implement` reads each UT phase file's `## Delegate Skills` and invokes the consumer test skill.

## Direct Invocation Behavior

If a user invokes this skill directly:

1. Warn that the command is deprecated.
2. Do not generate test files.
3. Point the user to:
   - `/tdk-ut-backfill-plan {feature-id}` for UT planning
   - `/tdk-implement {feature-id}` for routed execution
   - `{docs.path}/custom-workflow/plan-skill-routing.md` for implementation skill selection

## Removal Window

This file remains for one release to avoid abrupt missing-skill failures. Remove it after downstream consumers have migrated to routed test implementation.
