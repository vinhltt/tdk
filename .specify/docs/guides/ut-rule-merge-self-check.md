# UT Rule Merge Self-Check

Manual verification procedure for `tdk-ut-*` skills that perform cascade merge. LLM-level merge output cannot be unit-tested deterministically (see researcher §5 consensus); this doc gives each skill maintainer a fixed input + expected output pair for per-release self-check.

Refer to the merge contract for rule semantics: `.specify/docs/guides/rule-cascade-merge-contract.md`. Canonical headings: `.specify/docs/guides/ut-rule-canonical-headings.md`.

## 1. Fixture Input

Shared golden fixture at `projects/tdk/.specify/scripts/ts/tests/fixtures/rules-cascade/workspace/`:

**L4 global** (`docs/rules/test/ut-rule.md`):

```markdown
# L4 (global) - docs/rules/test/ut-rule.md
Base UT conventions for all projects.

## Test Framework
- Jest 29
- ts-jest transformer

## Coverage
- Minimum: 80%
- Report: lcov

## Mocking Strategy
- Use jest.fn() for unit-level mocks
- No network calls in unit tests
```

**L1 module** (`docs/sub-workspaces/api/modules/auth/rules/test/ut-rule.md`):

```markdown
# L1 (module) - docs/sub-workspaces/api/modules/auth/rules/test/ut-rule.md
Auth module overrides.

## Test Framework
- Vitest 1.x
- @vitest/coverage-v8

## Coverage
- Minimum: 95%
- Branch coverage required
```

## 2. Expected Merged Markdown

After applying the cascade merge contract (Rules 1, 2, 3, 5) the skill-computed in-memory rules should be semantically equivalent to:

```markdown
Base UT conventions for all projects.
Auth module overrides.

## Test Framework             ← L1 overrides (Rule 2)
- Vitest 1.x
- @vitest/coverage-v8

## Coverage                   ← L1 overrides (Rule 2)
- Minimum: 95%
- Branch coverage required

## Mocking Strategy           ← L4 inherited (Rule 3)
- Use jest.fn() for unit-level mocks
- No network calls in unit tests
```

Key assertions:

- `## Test Framework` body matches L1 verbatim (wholesale override).
- `## Coverage` body matches L1 verbatim (wholesale override).
- `## Mocking Strategy` body matches L4 verbatim (Rule 3 inherit).
- Preamble lines from L4 + L1 concatenated with a blank line separator (Rule 5).

## 3. Per-Skill Self-Check

For each skill below, point the CLI at the fixture workspace and run the skill. Verify the checklist items.

**Invocation pattern**:

```bash
cd projects/tdk/.specify/scripts/ts
# Adjust docsPath to 'docs' and workspaceRoot to the fixture path when driving CLIs manually.
```

### `tdk-ut-backfill-check-rules`

- [ ] Cascade summary shows 2 files: `Loaded 2 rule file(s): global → module`.
- [ ] `rulesFile` equals the L1 path (most-specific).
- [ ] `utRulesFiles.length === 2`; levels `['global', 'module']`.
- [ ] `framework` parsed from merged content = `Vitest 1.x` line (L1 winner).
- [ ] `coverageTarget` parsed from merged content = `95%` (L1 winner).

### `tdk-ut-backfill-plan`

- [ ] Cascade summary prints once at Step 2.
- [ ] Generated `ut-plan.md` references framework `Vitest` (not Jest).
- [ ] Coverage target in plan matches `95%`.
- [ ] Mocking guidance retained from L4 (jest.fn() mocks, no network).

### `tdk-ut-backfill-impl`

- [ ] Step 0.1 validates `utRulesFiles.length === 0` as exit condition — with fixture, passes validation.
- [ ] Cascade summary prints after validation.
- [ ] Generated test code uses Vitest imports (`from 'vitest'`), not Jest.
- [ ] Generated assertions target 95% branch coverage per merged rules.

### `tdk-ut-backfill-auto`

- [ ] Cascade summary prints **once** at Step 1 (orchestration start).
- [ ] Child skills (`tdk-ut-backfill-plan`, `tdk-ut-backfill-impl`) receive the same `utRulesFiles[]` — no duplicate cascade summary in child output.
- [ ] End-to-end workflow produces Vitest-based test files with 95% coverage target.

## 4. Automation Future

Full LLM-output determinism testing is out-of-scope per researcher §5 consensus. When industry tooling matures (e.g., semantic-diff harnesses for markdown merges), promote this manual self-check into CI. Until then, skill maintainers run this check on each PR that touches cascade-merge paths.

## Related

- Merge contract: `.specify/docs/guides/rule-cascade-merge-contract.md`
- Canonical headings: `.specify/docs/guides/ut-rule-canonical-headings.md`
- Snapshot test: `projects/tdk/.specify/scripts/ts/tests/utils/rules-cascade-snapshot.test.ts`
- Fixture: `projects/tdk/.specify/scripts/ts/tests/fixtures/rules-cascade/`
