# UT Phase Heuristic — Expected Decisions Baseline

Regression reference for the heuristic hints defined in `SKILL.md § UT Phase Heuristic Hints`.

Each row represents a fixture: a phase filename + H1 title combination and the expected delegation decision.

## Decision Table

| Fixture filename | H1 Title | Expected decision | Rationale |
|-----------------|----------|-------------------|-----------|
| `phase-03-unit-test-rules-auth.md` | "Unit Test Rules: Auth" | **delegate** | UT keyword in both filename and H1 |
| `phase-02-database-migration.md` | "Database Migration" | **inline** | No UT keyword in either signal |
| `phase-04-unit-test-integration-helpers.md` | "Unit Test Integration Helpers" | **delegate** | `unit test` keyword present — UT trumps "integration" |
| `phase-05-test-coverage.md` | "Test Coverage Analysis" | **inline** | "test" alone insufficient; no `unit test` / `ut` keyword |
| `phase-06-ut-validation.md` | "Random Feature" | **delegate** | Filename has `ut-` prefix → matches despite bland H1 (F15 filename-fallback) |

## Notes

- Decisions are **non-binding heuristic guidance** — agent makes final call.
- OR-combine: delegate if EITHER filename stem OR H1 title matches a keyword.
- Keywords: `unit test` (phrase), `ut` (word boundary), `test rules`, `test plan` (case-insensitive).
- False-positive guard: `integration` in H1/filename **without** `unit test` → inline.
- Heuristic logic defined in: `SKILL.md § UT Phase Heuristic Hints`
- Parser module: `.specify/scripts/ts/src/commands/util/phases-table-parser.ts` (`parsePhasesTable`)
