# Rules Cascade Test Fixture

Reproduces the golden concrete example from `plans/reports/brainstorm-260412-1712-rules-merge-cascade-design.md` lines 73–137.

## Layout

```
workspace/
  docs/
    rules/test/ut-rule.md                                       ← L4 global (base)
    sub-workspaces/api/modules/auth/rules/test/ut-rule.md       ← L1 module (most specific)
```

## Intent

Drives `tests/utils/rules-cascade-snapshot.test.ts` asserting:
- `resolveRulesCascade()` returns 2 entries in `[global, module]` order.
- `primary === entries[1].path`.
- Path suffix matches expected relative segments (portable across machines).

Also referenced by `.specify/docs/guides/ut-rule-merge-self-check.md` for skill-side manual verification.

## Out of scope

Phase 01 unit tests (R-C04, R-C05) already cover 3-level and 4-level cascade ordering. This fixture targets the brainstorm's L4+L1 golden example only.
