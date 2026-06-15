# Scope Challenge (Step 0.scope)

3-question interview before plan creation. Probes scope discipline; routes to EXPANSION / HOLD / REDUCTION. Idempotent — re-runs append a new session block, never overwrite.

## Skip Conditions

Run before any user prompt. If any condition is true → skip the interview and write `scope_mode: skipped` to frontmatter:

```
skip_scope_challenge:
  - "--fast" present in FLAGS                     (Phase 03 flag, see modes.md)
  - word_count(spec.md $ARGUMENTS section) < 20   (trivial task)
  - $ARGUMENTS contains any of: "just plan", "quick plan", "already decided"
  - plan.md frontmatter already has scope_mode != skipped (idempotent re-dispatch — see Re-dispatch below)
```

## Interview (single AskUserQuestion batch — 3 questions)

```json
{
  "questions": [
    {
      "question": "Does an existing solution solve this?",
      "header": "Q1 Reuse",
      "multiSelect": false,
      "options": [
        { "label": "Yes-exactly",   "description": "An existing skill/library/module already solves this end-to-end." },
        { "label": "Yes-with-gaps", "description": "An existing solution covers most of it; small adapter / config needed." },
        { "label": "No-novel",      "description": "Nothing usable exists; net-new work required." }
      ]
    },
    {
      "question": "What is the minimum change that delivers value?",
      "header": "Q2 Min change",
      "multiSelect": false,
      "options": [
        { "label": "Config-only",  "description": "Tweak existing config / flag — no code change." },
        { "label": "Single-file",  "description": "One file modified or added." },
        { "label": "Multi-file",   "description": "Multiple files across one module." },
        { "label": "New-module",   "description": "New module / package / agent." }
      ]
    },
    {
      "question": "Is complexity proportional to value?",
      "header": "Q3 Proportion",
      "multiSelect": false,
      "options": [
        { "label": "Yes-justified",   "description": "Complexity matches the value delivered." },
        { "label": "Borderline",      "description": "Could go either way; YAGNI argument exists." },
        { "label": "Over-engineered", "description": "Disproportionate complexity for the value." }
      ]
    }
  ]
}
```

## Routing Matrix

| Q1 | Q2 | Q3 | scope_mode | Next action |
|---|---|---|---|---|
| Yes-exactly | Config-only | Yes-justified | REDUCTION | Suggest reuse + offer cancel |
| Yes-with-gaps | Single-file | Yes-justified | HOLD | Continue default flow |
| No-novel | Multi-file | Yes-justified | HOLD | Continue default flow |
| No-novel | New-module | Borderline ∨ Over-engineered | EXPANSION | Suggest `--hard` re-run |
| any | any | **Over-engineered** | REDUCTION | Tiebreak — complexity dominates |
| **\* (any unmapped pattern)** | | | **HOLD (catch-all default — S3.F15)** | Continue default flow |

Routing is deterministic: evaluate top-down; first match wins. The HOLD catch-all covers the 32 of 36 combinations that aren't called out individually — safest fallback.

## Post-Selection Actions

- **EXPANSION** → output:
  > Scope suggests `--hard`. Re-run: `/tdk-plan <TASK_ID> --hard`. Halting current invocation.
  Halt — do **not** auto re-dispatch (user re-issues with the new flag — see Re-dispatch).
- **REDUCTION** → output:
  > Scope suggests reduction. Options: (a) reuse existing — cancel this plan; (b) split spec into smaller TASK_IDs; (c) continue anyway.
  Use AskUserQuestion to capture user's choice. On (c), continue default flow.
- **HOLD** → continue default flow.
- **skipped** → continue default flow (no prompt was issued).

## `## Scope Challenge` Section in plan.md (append-only)

```markdown
## Scope Challenge

### Session 1 — YYYY-MM-DD

| Q | Answer |
|---|---|
| Q1 Reuse | Yes-with-gaps |
| Q2 Min change | Single-file |
| Q3 Proportion | Yes-justified |

**scope_mode:** HOLD
**Action:** continue default flow.
```

Re-runs append `### Session 2 — ...` after the existing block; never overwrite. Detect by grepping for `## Scope Challenge` then counting `### Session N` headers and incrementing.

## Re-dispatch (idempotency guard)

When user re-invokes `/tdk-plan <TASK_ID> --hard` after an EXPANSION suggestion, Step 0.scope detects:

1. Existing plan.md has `scope_mode: expansion` from a prior session.
2. Current invocation has `--hard` (the suggested mode).

→ Skip Step 0.scope this run. Append `### Session N — re-dispatched per prior EXPANSION` stub to keep the audit trail; proceed straight to Step 1.

This prevents an EXPANSION → `--hard` → another EXPANSION suggestion loop.
