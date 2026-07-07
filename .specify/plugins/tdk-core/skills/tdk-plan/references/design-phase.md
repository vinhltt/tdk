# Design Phase

## Solution Design Concerns

- **Trade-off Analysis:** evaluate multiple approaches, compare pros/cons, short-term vs long-term.
- **Security:** OWASP Top 10, auth/authz, input validation, API security.
- **Performance:** bottlenecks, caching, async, scalability.
- **Edge Cases:** error scenarios, network failures, retry/fallback, race conditions.
- **Operability:** testability, monitoring, deployment impact, and rollback path.

## Steps

### Project Source Layout (SOT Pre-load)

**MUST DO BEFORE filling `### Source Code` of plan.md:**

1. Resolve `docs.path` from `.specify.json` (default: `.specify/configurations`).
2. Read `{docs.path}/source-code-structure.md`. If file exists, treat its layout as SOT.
3. Replace plan-template Option 1/2/3 boilerplate with actual project layout from SOT.
4. Note feature-specific additions (new files/modules) explicitly — don't duplicate baseline tree.

**Fallback:** if file missing → use template Option 1/2/3 boilerplate (current behavior).

1. Extract entities from spec ## 6. Functional Requirements > Key Entities → `data-model.md`.
2. Define API contracts from ## 6. Functional Requirements → `contracts/`.
3. Plan file structure based on framework.
4. Identify dependencies and risks (also read ## 8. Risks & Mitigations from spec).
5. Record deployment, rollback, and observability notes when the implementation
   changes runtime behavior, public interfaces, or operational workflows.

**Output:** `data-model.md`, `contracts/`, `quickstart.md`.

## Embedded Brainstorming (Architecture Decisions)

Mode: **embedded — reasoning technique only.**
**DO NOT** call `brainstorm.py`. **DO NOT** create separate brainstorm files. Output goes directly into plan.md artifacts.

**When to trigger** at every decision point involving:
- Technology / library selection
- Architecture pattern choice (monolith vs microservice, REST vs GraphQL, etc.)
- Data storage strategy
- Integration approach

**Technique per decision:**
1. Identify 2–3 viable approaches.
2. Evaluate Pros, Cons, Best-For context.
3. Apply YAGNI / KISS / DRY lens.
4. Document in the `## Decisions Made` section using:

| Decision | Chosen | Alternatives | Rationale |
|----------|--------|--------------|-----------|
| [Topic] | [Choice] | [Alt1], [Alt2] | [YAGNI/KISS/DRY reasoning] |

## Sequential Thinking (Phase Decomposition)

**Trigger:** during Step 3 plan workflow execution.

1. List all implementation units from spec requirements.
2. Identify dependencies between units (data model → service → endpoint).
3. Group into phases by dependency level (no circular deps).
4. Order phases: foundational → core → integration → polish.
5. For each phase, identify: prerequisites, deliverables, success criteria.
6. Flag parallel opportunities between independent phases.
6b. **Subworkspace-aware grouping**: If spec.md ## 5. User Requirements & Testing and ## 6. Functional Requirements contain `[sw/module]` tags:
   - Group implementation units by subworkspace first, then by dependency
   - Consider creating per-subworkspace phases when modules are independent
   - Use tags as **soft hints** — may group multiple modules into one phase for efficiency
   - If no tags present (legacy spec): fall back to current behavior

## Skill Routing Injection

**Spec tag pre-hint**: If spec.md contains `[sw/module]` tags on ## 5. User Requirements & Testing/## 6. Functional Requirements, use them to pre-populate the subworkspace→phase mapping BEFORE scanning `## Related Code Files`. Tags provide intent; file paths provide verification.

**Skip if:** `SKILL_ROUTING` is empty (file missing or parse failure).

**Pre-injection refresh:** Re-read `{docs.path}/custom-workflow/plan-skill-routing.md` to refresh `SKILL_ROUTING` before injection. Prevents context drift from intermediate steps (memory, research, cross-plan deps loaded between Step 0.1b and 3b).

**Timing:** Inline — inject while creating each phase, NOT as a post-processing pass. Phase N's assignment informs Phase N+1's choices.

**Exclusion:** None. TDD/backfill phases (`test_mode != none`) receive `## Delegate Skills` injection the same as any other phase — see Test Mode Phase Generation below for ordering when both a test skill and an implementation delegate apply.

For each phase being created:

1. **Identify target sub-workspace(s):**
   - Extract file paths from phase's `## Related Code Files`
   - Match against `PROJECT_CONTEXT.subWorkspaces[].path` (prefix match)
   - If no subWorkspaces configured (monolith) → use "global"
   - If ambiguous (multiple sub-workspaces) → merge skill sets

2. **Detect phase domain** from title/description:
   - test/UT/spec keywords → "test"
   - database/schema/migration → "database"
   - UI/component/screen/mockup → "design" + "implement"
   - API/endpoint/service → "implement"
   - research/exploration → "research"
   - fallback → "implement"

3. **Lookup skills:** `SKILL_ROUTING[subWorkspace][domain]`
   - Primary: matched sub-workspace + matched domain
   - Fallback: `SKILL_ROUTING["global"][domain]`
   - If no match at all → skip injection for this phase

4. **Inject `## Delegate Skills`** into phase body (after `## Key Insights`, before `## Requirements`):
   - `/{skill-name}` — {brief purpose from routing file context}
   - One bullet per skill, ordered as listed in routing file.
   - For `test_mode: tdd` phases, list the routed `test` skill first, then the routed implementation delegate (if any) for the phase's domain.
   - **Idempotency:** if `## Delegate Skills` already exists → replace section content, don't append

5. **EC-11 advisory** (once per plan, not per phase): if any `PROJECT_CONTEXT.subWorkspaces[].name` has no corresponding `##` section in skill-routing file → warn: "Sub-workspace '{name}' has no skill routing — using global defaults."

## Test Mode Phase Generation

Test intent (`test_mode`) is resolved at Step 1.7 from `--tdd` / `--ut-backfill` flags (see `references/modes.md`). This replaces the old automatic trailing "Unit Test Planning" delegate phase — test intent now shapes the canonical implementation phases directly.

**Mode gate:** `--fast` is incompatible with `--tdd` and `--ut-backfill` (already STOPped at Step 0), so `test_mode` is always `none` when `MODE == "fast"`.

### test_mode: none

Current non-test planning behavior. No TDD or backfill sections are added to phases.

### test_mode: tdd

Add tests-first sections to each implementation phase, replacing the generic `## Implementation Steps` execution order:

```markdown
## Tests Before
| ID | Source | Scenario | Technique | Input | Expected | Command | Status |

## Refactor / Implementation
{the phase's existing implementation steps}

## Tests After
| ID | Source | Scenario | Technique | Input | Expected | Command | Status |

## Regression Gate
{command(s) that must pass before the phase is marked done}
```

`## Tests Before` must list tests that run before production code changes. Use `Status` values `expected_fail`, `characterization`, or `existing_pass`:
- `expected_fail` for new behavior that should fail before implementation.
- `characterization` for existing behavior that must be preserved during refactor.
- `existing_pass` only when the phase intentionally extends a passing test suite.

`## Tests After` must reuse every `## Tests Before` ID and add new IDs for new behavior discovered during implementation. Each row must keep the same `Source` anchor so reviewers can trace before/after coverage. Do not replace the table with prose.

### test_mode: ut_backfill

Generate backfill-focused canonical phases describing existing code behavior and its test matrix:

```markdown
## Code Summary
| File | Exports | Key Deps | Branches |

## Mocks & Fixtures Required
| Dependency | Type | Mock Approach |

## Test Matrix
| ID | Source | Scenario | Technique | Input | Expected | Priority | Impl |
```

**Semantic test ID format** (`Test Matrix` ID column):

```text
Single-file phase: <func>__<slug>            e.g. parse_email__happy
                    <Class>.<method>__<slug>  e.g. OrderService.charge__timeout
Multi-file phase:   <source_basename>_<func>__<slug>            e.g. routes_parse_email__happy
                     <source_basename>_<Class>.<method>__<slug>  e.g. services_OrderService.charge__timeout
```

Slug rules: snake_case, 1–3 words, no `test_` prefix. Validation regex: `^[a-z][a-z0-9_]*(\.[A-Z][a-zA-Z0-9]*)?__[a-z0-9_]+$`. Multi-file invariant: if the `Source` column has ≥2 distinct values, ALL IDs in that phase must use the multi-file form. Technique legend: Happy | EP (Equivalence Partition) | BVA (Boundary Value) | Branch L\<n\> (branch at line n) | Error | Deps (dependency injection/mock) | State.

**Backfill traceability rule:**
- Every public export, route, command handler, method, or externally observable behavior listed in `## Code Summary` must map to at least one `## Test Matrix` row.
- Every non-trivial branch listed in `## Code Summary.Branches` must map to a `Branch L<n>` row or an explicit `N/A: <reason>` note.
- Every dependency listed in `## Mocks & Fixtures Required` must map to a `Deps` row or an explicit `N/A: <reason>` note.
- The `Impl` column starts empty during planning and is filled during `/tdk-implement` with the test file path, test name, or an explicit `N/A: <reason>` when a row is intentionally deferred.

### Test Case Completeness Rubric

Apply this rubric to both `tdd` and `ut_backfill` phases. Do not silently omit a dimension; if it does not apply, write `N/A: <reason>` in the nearest table cell or section note.

| Dimension | Required signal |
|---|---|
| Happy | At least one normal successful behavior per public surface. |
| EP | Equivalence partitions for meaningful input classes, enum variants, roles, states, or content types. |
| BVA | Boundary values for numeric, date/time, pagination, string length, collection size, and timeout inputs. |
| Branch L\<n\> | One row for each non-trivial conditional, permission gate, feature flag, or recovery path. |
| Error | Invalid input, thrown exception, dependency failure, auth failure, and validation failure paths where applicable. |
| Deps | External dependency, IO, clock/randomness, network, database, filesystem, queue, or cache behavior. |
| State | State transitions, persisted state, cache/session behavior, idempotency, and retry effects. |
| Regression | At least one case for the original bug, accepted risk, or highest-risk behavior in the phase. |

**Core vs consumer test skill boundary:** TDK core owns the baseline coverage rubric, traceability tables, and phase gates above. The routed consumer `test` skill may enrich framework-specific commands, fixture factories, mock libraries, and domain edge cases, but it must not be the only source of baseline case completeness.

**Backfill targeting** (see `references/modes.md` Backfill Targeting Flags):
- `BACKFILL_TARGET.sub_workspace` from `--sub-workspace <name>` scopes phase generation to one sub-workspace.
- `BACKFILL_TARGET.module` from `--module <name>` (requires `--sub-workspace`) narrows to one module inside that sub-workspace.
- `BACKFILL_TARGET.standalone` from `--standalone` allows backfilling existing code without requiring `spec.md`; derive test scenarios from user input (AskUserQuestion) plus a codebase scan (public APIs, method signatures, error handling, dependencies) instead of spec sections.
- Natural-language sub-workspace/module mentions and CWD auto-detection remain acceptable fallback when flags are absent.

**Module ownership guard:** `/tdk-plan --ut-backfill` never creates sub-workspaces, modules, or source directories and does not edit `.specify/.specify.json`. If the target sub-workspace has no modules configured, or has modules configured but none defined, ask the user whether to `Proceed at sub-workspace level` or pause; on pause, route durable module ownership through `/tdk-workspace-layout-propose`, `/tdk-workflow-config-apply`, and optionally `/tdk-workspace-dependency-policy` before re-running `/tdk-plan --ut-backfill`.

Both `tdd` and `ut_backfill` phases receive `## Delegate Skills` injection from the routed `test` skill (see Skill Routing Injection above); TDD phases also receive the routed implementation delegate for the phase's domain, listed after the `test` skill.
