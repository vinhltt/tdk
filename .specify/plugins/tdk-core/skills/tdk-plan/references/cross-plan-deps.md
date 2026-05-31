# Cross-Plan Dependencies (Step 0.deps)

Advisory-only scan over `.specify/<specsRoot>/**/plan.md` frontmatter. Output never STOPs plan creation. Bun runtime required (Validation S4 D15).

## Skip

Skip Step 0.deps entirely if `--fast` is in `FLAGS`. Note this uses raw flag inspection (not the resolved `MODE`) because Step 1.7 Mode Detection runs **after** Step 0.deps in the flow — see `references/modes.md` for the per-mode matrix that enumerates 0.deps as `skip` under `--fast`.

## Detector Types

| ID | Severity | Description | Fixable |
|---|---|---|---|
| **D1** | warn | Plan A says `blocks: [B]` but B missing `blockedBy: [A]` | yes (auto-fix) |
| **D2** | warn | Circular: A blocks B and B blocks A | no |
| **D3** | warn | Self-reference: A blocks/blockedBy A | no |
| **D4** | warn | Reference to non-existent TASK_ID | no |

D4 excludes the current TASK_ID being created (it doesn't exist on disk yet).

## Invocation Contract

```
bun .specify/scripts/ts/src/commands/util/scan-cross-plan-deps.ts \
  --current <TASK_ID> --json
```

Output JSON shape:

```json
{
  "current_task_id": "aa-123",
  "scanned_at": "2026-04-25T12:00:00.000Z",
  "scan_duration_ms": 340,
  "cache_hit_ratio": 0.92,
  "plans_found": 14,
  "findings": [
    {
      "id": 1,
      "type": "D1",
      "severity": "warn",
      "detail": "aa-123 blocks aa-456 but aa-456 missing blockedBy: [aa-123]",
      "fixable": true,
      "fix": { "target_plan_path": "...", "target_task_id": "aa-456", "add_blocked_by": "aa-123" }
    }
  ],
  "fix_results": []
}
```

If `findings.length === 0` → log `No cross-plan dependencies detected` and continue.

## Cache (`.deps-cache.json`)

Lives at `.specify/<defaultFolder>/.deps-cache.json` (gitignored). Schema:

```json
{
  "scanned_at": "ISO8601",
  "plans": {
    "aa-123": {
      "content_hash": "sha256:...",
      "blocks": ["aa-456"],
      "blockedBy": [],
      "status": "pending",
      "mode": "default"
    }
  }
}
```

Hash covers canonical fields only (`task_id, status, blocks, blockedBy, mode`). Title / description / tags excluded — noise. Sorted JSON serialization → semantically equivalent frontmatter hashes equal regardless of YAML key order or array order. Atomic write via `tmp → rename`.

## Adjudication Workflow (in SKILL.md prose)

1. Run scan command above. Capture JSON to `SCAN_OUTPUT`.
2. If `SCAN_OUTPUT.findings.length === 0` → log + continue to Step 1.
3. Print findings table to terminal.
4. **AskUserQuestion** to decide on fixable findings:

   ```json
   {
     "questions": [{
       "question": "{N} D1 cross-plan link issue(s) auto-fixable. Apply?",
       "header": "Cross-plan fix",
       "multiSelect": false,
       "options": [
         { "label": "Apply all auto-fixes",  "description": "Run --fix-d1 with all D1 finding ids. Edits OTHER plans' frontmatter via line-anchored regex." },
         { "label": "Apply selected ids",    "description": "Specify a subset; remaining D1s left as warnings." },
         { "label": "Skip (warn only)",      "description": "Append findings to ## Cross-Plan Dependencies; do not modify other plans." }
       ]
     }]
   }
   ```

5. **Dirty-tree gate** (Validation S3 D12 — overrides S3.F2 refuse-on-dirty):
   - Before any `--fix-d1` invocation, run `git -C projects/tdk status --porcelain`.
   - Capture `pre_state_dirty` flag for the conditional rollback below.
   - If non-empty → AskUserQuestion: `[Continue auto-fix]` / `[Abort, commit/stash first]`. On Abort → STOP.
   - **NEVER** run `git stash` — risk of `stash drop` data loss accepted only via the conditional rollback path below.
6. Invoke `bun .../scan-cross-plan-deps.ts --current <ID> --fix-d1 <comma-separated-ids> --json`. Capture `fix_results`.
7. Per-fix schema gate: any `fix_results[i].ok === false` with `reason: "schema_version <2 — migrate manually"` → log to user; that plan stays untouched (S2.F10).
8. **Verify** — invoke `bun .../scan-cross-plan-deps.ts --current <ID> --verify`.
   - Exit 0 → done. Append `## Cross-Plan Dependencies` to current plan.md.
   - Exit 1:
     - `pre_state_dirty == false` → safe rollback: `git -C projects/tdk checkout -- .` (only auto-fix touched files; no user WIP at risk). Log fail report.
     - `pre_state_dirty == true` → **DO NOT `git checkout`**. Write `plans/reports/cross-plan-fix-{timestamp}-failed.md` listing affected plan paths + edited fields. Tell user: `Auto-fix verify failed; pre-fix tree was dirty. Manual rollback required.` Exit non-zero.

## Output Section (appended to current plan.md)

```markdown
## Cross-Plan Dependencies

**Scanned at:** 2026-04-25T12:00:00.000Z

**Blocks:** [aa-456]
**Blocked By:** []

**Findings:**
- [D1] aa-123 blocks aa-456 but aa-456 missing `blockedBy: [aa-123]` — auto-fixed: yes
- [D2] circular: aa-123 ↔ aa-789 — warning logged
```

If no findings: omit the `## Cross-Plan Dependencies` section entirely (avoid noise on clean plans).

## Semantics (v1)

- **Soft / advisory only** (Validation S1 D4): `blockedBy` never blocks `/tdk-plan` or `/tdk-implement` execution. Hard-block gate deferred to a future implementation phase.
- Non-existent (D4) refs against the **current** TASK_ID are tolerated (it's being created right now).
