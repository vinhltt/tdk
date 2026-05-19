# Output Standards

## plan.md YAML Frontmatter (Reserved Schema)

The schema below is **closed at Phase 01** (S3.F6). Phases 03–07 only document semantics in their respective reference files; they MUST NOT add new top-level fields.

```yaml
---
title: "{Brief title}"
status: todo              # todo | in_progress | done | skipped | blocked | cancelled
priority: P2              # P1 | P2 | P3
effort: 4h                # rough estimate, sum of phase efforts
tags: [frontend, api]
created: YYYY-MM-DD

# Reserved fields (Phase 01 closes the schema):
mode: default             # default | fast | hard      — see references/modes.md           (Phase 03 semantics)
scope_mode: hold          # expansion | hold | reduction — see references/scope-challenge.md (Phase 04 semantics)
blockedBy: []             # plan dirs that must complete first      — see references/cross-plan-deps.md (Phase 05 semantics)
blocks: []                # plan dirs blocked by this one           — see references/cross-plan-deps.md (Phase 05 semantics)
red_team_session: 0       # incremented per /tdk-plan <ID> --red-team run — see references/red-team-workflow.md (Phase 06)
validation_session: 0     # incremented per /tdk-plan <ID> --validate run — see references/validate-workflow.md (Phase 07)
validation_cursor: 0      # next-question index when a validate run is suspended mid-batch — see references/validate-workflow.md (Phase 07)
schema_version: 3         # bumped: vocab unify (U1) — phase + plan-level share union
---
```

**Field-write rules:**

- `mode`: write `fast` on `--fast`, `hard` on `--hard`. Omit (or leave default) when no flag was passed (S1.F5). Read-path treats absent `mode:` as default — backward compatible with pre-Phase-03 plans. `--red-team` / `--validate` invocations don't change `mode:`.
- `scope_mode`: written by Step 0.scope (Phase 04). One of `expansion | hold | reduction | skipped`. Absent on pre-Phase-04 plans → treated as `skipped`. See `references/scope-challenge.md` for routing.
- `blockedBy` / `blocks`: arrays of plan directory names (e.g., `260301-1200-auth-system`). Empty array when no link. Phase 05 cross-plan-deps scanner reads + bidirectionally auto-fixes these per `references/cross-plan-deps.md`. Auto-fix REFUSES plans with `schema_version < 2` (S2.F10 schema gate).
- `blockedBy` / `blocks`: arrays of plan directory names (e.g., `260301-1200-auth-system`). Empty array when no link.
- `red_team_session` / `validation_session`: monotonic counters; never reset. Bumped only after ≥1 agent returns parseable output (S2.F8 — prevents inconsistency on Ctrl-C mid-spawn).
- `validation_cursor`: 0 when validate completed normally; non-zero when a session was suspended mid-interview. Phase 07 orphan-detection scans for `(in-progress)` Validation Log header + non-zero cursor on every `--validate` invocation; offers Resume / Discard / Cancel via AskUserQuestion (Validation S1 D5 + S2.F13 trust-ask before resume).
- `schema_version`: bump on incompatible changes only. Phase 05 cross-plan-deps loader **gates** on `schema_version >= 2`.

## Quality Checklist

- [ ] All phases have success criteria.
- [ ] File paths are specific and complete.
- [ ] Dependencies documented (`blockedBy` / `blocks` if applicable).
- [ ] Security concerns addressed.
- [ ] No unresolved questions (or listed at end).
- [ ] DAG acyclic — references do not load `SKILL.md` back.

## Decisions Made (Table Format)

Every plan that involves a non-trivial technical choice MUST include this section:

| Decision | Chosen | Alternatives | Rationale |
|----------|--------|--------------|-----------|
| [Topic] | [Choice] | [Alt1], [Alt2] | [YAGNI / KISS / DRY reasoning] |

## Phase File Sections

See `references/plan-organization.md` for the canonical phase file template + section ordering.

## Output Sanitization (Phase 06 / 07 emit-time)

- Pipe characters (`|`) inside finding rationale or suggested-fix prose MUST be escaped to `\|` before being written into a markdown table cell.
- Marker pattern: `S{session}.F{N}` (e.g., `S2.F8`) — guarantees uniqueness across re-runs (S2.F11).
- See `references/red-team-workflow.md` and `references/validate-workflow.md` for full sanitization rules (Phases 06 / 07).
