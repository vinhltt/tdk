# Design Phase

## Solution Design Concerns

- **Trade-off Analysis:** evaluate multiple approaches, compare pros/cons, short-term vs long-term.
- **Security:** OWASP Top 10, auth/authz, input validation, API security.
- **Performance:** bottlenecks, caching, async, scalability.
- **Edge Cases:** error scenarios, network failures, retry/fallback, race conditions.
- **Operability:** testability, monitoring, deployment impact, and rollback path.

## Steps

1. Assign entity/schema design to the first phase that implements it and write
   a concise `## Data Model` section in that phase.
2. Assign interface design to the implementing phase. Keep prose in
   `## Interfaces & Contracts`; create `contracts/` only for a declared
   machine consumer and validation command.
3. Assign setup, rollout, rollback, and operational verification to an owner
   phase under `## Verification / Runbook`.
4. Plan file structure based on framework.
5. Identify dependencies and risks (also read ## 8. Risks & Mitigations from spec).
6. Record deployment, rollback, and observability notes when the implementation
   changes runtime behavior, public interfaces, or operational workflows.

**Output:** `plan.md`, executable `phases/*.md`, and only justified conditional
supporting artifacts indexed by `plan.md`.

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
6. Maximize real DAG width: split implementation units into independent phases
   only when their dependencies and complete project-file access sets prove the
   separation. Inter-phase access overlap does not change classification; the
   runtime resolver defers conflicts between otherwise valid `auto` phases.
6b. **Subworkspace-aware grouping**: If spec.md ## 5. User Requirements & Testing and ## 6. Functional Requirements contain `[sw/module]` tags:
   - Group implementation units by subworkspace first, then by dependency
   - Prefer a separate phase when all writes stay in exactly one configured sub-workspace and the work is independent
   - Use tags as **soft hints** — may group multiple modules into one phase for efficiency
   - If no tags present (legacy spec): fall back to current behavior
7. Reject research-only, investigate-only, and evaluate-only phases. Keep
   ordinary evidence gathering in Step 3a research. Create `phase_type: spike`
   only for an executable experiment/prototype with concrete deliverables and a
   decision gate; initialize every direct dependent as `blocked` until approval
   or replan.

## Parallel Safety Classification

Classify every new, appended, or rewritten phase before writing it. Missing
parallel metadata is allowed only on untouched legacy phase files in append
mode. Classification is phase-local: routing selects capability; it never
decides schedulability, and a merged delegate list never proves safe parallel
execution.

The base `auto` predicate requires exactly one `## Related Code Files` section,
at least one validated `Modify`/`Create`/`Delete` write, complete project-file
reads outside the phase's own canonical write targets, complete write ownership,
valid action/existence semantics, valid case-sensitive POSIX/WSL paths, and no
fixed-deny, ignored, migration, lock, generated, or shared-global write. Every
worker, delegate, and worker-side command stays within those exact access sets.
Otherwise emit `parallel_safe: never` with the first concise factual reason.

| Plan shape | V1 classification |
|---|---|
| Normal (`test_mode: none`) | `auto` only when the base predicate and universal command-effect rule pass; otherwise `never`. |
| TDD | `auto` only when the base predicate passes, all production/test/fixture reads and writes are declared, and worker commands have no unknown/shared/generated output; otherwise `never`. Preserve tests-first and delegate order. |
| UT backfill | `auto` only for finite concrete test access satisfying the base predicate and bounded worker commands. Open-ended directory, glob, broad-scan, or unresolved targets force `never`. Preserve delegate order. |
| Spike | Always `never`; isolated files do not bypass the decision/status gate. |
| Monolith | Apply the base predicate. Routing through `global` does not itself imply shared-global ownership. |
| Multi-subworkspace | Independent single-subworkspace phases may be `auto` under the base predicate. A phase whose write set spans multiple configured sub-workspaces is `never` and remains one integration worker. |

A downstream `Modify` or `Delete` target that is absent because a future planned
phase will create it is `parallel_safe: never` in V1. Do not weaken the
plan-time existence rule.

### Command–Query Separation

- Classify the read/write effects of every worker-side command for every plan
  shape. A worker command may read only explicit `Read` paths or its own
  canonical write targets and may write only exact phase ownership.
- Unknown, broad, shared, generated, ignored, or undeclared worker-command
  effects force `parallel_safe: never`; do not guess or silently narrow them.
- Broad success, test-quality, build, and regression commands are controller
  gates, run sequentially only after all workers join and the first audit passes.
  Do not place them in worker instructions.
- After controller gates, the final audit permits no new Git-visible or protected delta
  beyond the already attested worker state. A gate requiring persistent
  generated output forces `never` or a separately owned serial phase.

Keep genuine integration work together. Never split a cross-subworkspace change
merely to manufacture parallelism, and never add a scheduling domain or parallel
metadata to `delegate-routing.md`.

## Skill Routing Injection

**Spec tag pre-hint**: If spec.md contains `[sw/module]` tags on ## 5. User Requirements & Testing/## 6. Functional Requirements, use them to pre-populate the subworkspace→phase mapping BEFORE scanning `## Related Code Files`. Tags provide intent; file paths provide verification.

**Skip if:** `SKILL_ROUTING` is empty (file missing or parse failure).

**Pre-injection refresh:** Re-read `{docs.path}/custom-workflow/delegate-routing.md` to refresh `SKILL_ROUTING` before injection. Prevents context drift from intermediate steps (memory, research, cross-plan deps loaded between Step 0.1b and 3b).

**Timing:** Inline — inject while creating each phase, NOT as a post-processing pass. Phase N's assignment informs Phase N+1's choices.

**Exclusion:** None. TDD/backfill phases (`test_mode != none`) receive `## Delegate Skills` and `## Delegate Agents` injection the same as any other phase — see Test Mode Phase Generation below for ordering when both a test skill and an implementation delegate apply.

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

3. **Lookup delegates:** `SKILL_ROUTING[subWorkspace][domain]`
   - Primary: matched sub-workspace + matched domain
   - Fallback: `SKILL_ROUTING["global"][domain]`
   - If no match at all → skip injection for this phase
   - Split the resolved delegates by token prefix into two groups: `/`-prefixed **skills** (toolset) and `@`-prefixed **agents** (executor). Each group keeps routing order.

4. **Inject `## Delegate Skills` and `## Delegate Agents`** into phase body — `## Delegate Skills` first, `## Delegate Agents` immediately after it:
   - Non-test phases inject `## Delegate Skills` after `## Key Insights` and before `## Requirements`.
   - TDD phases inject `## Delegate Skills` after `## Test Quality Gate` and before `## Regression Gate`.
   - UT backfill phases inject `## Delegate Skills` immediately after `## Test Quality Gate`.
   - `## Delegate Agents` always goes directly after the `## Delegate Skills` section, at whichever of those positions applies. When the skills group is empty, `## Delegate Agents` takes that position itself.
   - Skill bullet: `` `/{skill-name}` `` — {brief purpose from routing file context}
   - Agent bullet: `` `@{agent-name}` `` — {brief purpose from routing file context}
   - One bullet per delegate, ordered as listed in routing file.
   - **Omit a section entirely when its group is empty.** A domain routed to skills only produces exactly the phase body it produced before agent routing existed — no empty `## Delegate Agents` heading. A domain routed to agents only emits no `## Delegate Skills` heading.
   - For `test_mode: tdd` phases, list the routed `test` skill first, then the routed implementation delegate (if any) for the phase's domain; the same routing order applies inside `## Delegate Agents`.
   - **Idempotency — both sections, same rule:** detect `^## Delegate Skills$` and `^## Delegate Agents$` and replace everything from that heading until the next `^## ` heading (or EOF); never append a duplicate. When a section exists but its group is now empty, delete the heading and its body. When only one of the two exists, keep it in place and insert the missing one so the file ends with `## Delegate Skills` before `## Delegate Agents`.

5. **EC-11 advisory** (once per plan, not per phase): if any `PROJECT_CONTEXT.subWorkspaces[].name` has no corresponding `##` section in delegate routing file → warn: "Sub-workspace '{name}' has no skill routing — using global defaults."

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

## Test Quality Gate
| Metric | Target | Source | Command | Status |
|---|---|---|---|---|
| Tests Before reuse | 100% before IDs reused in Tests After | TDK core | <test command> | pending |
| Rubric dimensions | Happy/EP/BVA/Branch/Error/Deps/State/Regression covered by test IDs or N/A reasons | TDK core | <test command> | pending |
| Numeric cov | Project-defined or N/A reason | routed consumer test skill | <cov command> or - | pending |

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

## Test Quality Gate
| Metric | Target | Source | Command | Status |
|---|---|---|---|---|
| Matrix rows | 100% non-N/A rows implemented | TDK core | <test command> | pending |
| Branch traceability | 100% mapped or N/A reason | TDK core | <test command> | pending |
| Dependency traceability | 100% deps mapped or N/A reason | TDK core | <test command> | pending |
| Numeric cov | Project-defined or N/A reason | routed consumer test skill | <cov command> or - | pending |
```

When routing injects delegates, `## Delegate Skills` follows `## Test Quality
Gate`, and `## Delegate Agents` follows `## Delegate Skills`. Either section is
omitted when its group is empty.

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

### Test Quality Gate

Every `tdd` and `ut_backfill` phase must include `## Test Quality Gate` before
completion gates or delegate execution can mark the phase done.

Status values: `pending`, `pass`, `fail`, `N/A: <reason>`.

Command semantics:
- A runnable `Command` must come from the phase, delegate output, or committed
  project docs and run from an explicit project-relative cwd.
- STOP before execution when a command is destructive, network-installing,
  secrets-exposing, or uses shell metacharacters, pipes, redirection, or
  control operators without explicit project documentation or user approval.
- A non-applicable row uses `Command: -` and `Status: N/A: <reason>` only
  when evidence proves no project numeric coverage policy or other row target
  applies.
- Bare `Command: N/A` is invalid.
- `Status: pending` with no runnable command, or `Status: pass` with no
  evidence, is invalid.
- A row can become `pass` only after structural target evidence is satisfied and any runnable command exits 0.

Structural target evidence:
- TDD `Tests Before reuse` verifies every before-test ID appears in
  `## Tests After`.
- TDD `Rubric dimensions` verifies Happy/EP/BVA/Branch/Error/Deps/State/
  Regression are covered by test IDs or explicit `N/A: <reason>` entries.
- UT backfill `Matrix rows` verifies every non-N/A matrix row has implementation
  evidence.
- UT backfill `Branch traceability` and `Dependency traceability` verify all
  listed branches/dependencies map to rows or explicit `N/A: <reason>` entries.

Numeric cov source order:
1. Routed consumer `test` skill policy.
2. Project docs or routing evidence named in the gate row.
3. `N/A: no project numeric cov policy configured in <source>`.

Do not invent numeric coverage thresholds. TDK core does not parse coverage
percentages; it validates gate status, evidence, and command success.

### Test Case Completeness Rubric

Apply this rubric to both `tdd` and `ut_backfill` phases. Do not silently omit a dimension; if it does not apply, write `N/A: <reason>` in the nearest table cell or section note. TDD rubric dimensions must cite test IDs or `N/A: <reason>`, not prose-only claims.

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

**Core vs consumer test skill boundary:** TDK core owns the baseline coverage rubric, traceability tables, gate row completion, and structural evidence checks. The routed consumer `test` skill owns framework-specific commands, fixture factories, mock libraries, domain edge cases, and project numeric coverage policy. It may enrich baseline case completeness, but it must not be the only source of baseline case completeness.

**Backfill targeting** (see `references/modes.md` Backfill Targeting Flags):
- `BACKFILL_TARGET.sub_workspace` from `--sub-workspace <name>` scopes phase generation to one sub-workspace.
- `BACKFILL_TARGET.module` from `--module <name>` (requires `--sub-workspace`) narrows to one module inside that sub-workspace.
- `BACKFILL_TARGET.standalone` from `--standalone` allows backfilling existing code without requiring `spec.md`; derive test scenarios from user input (AskUserQuestion) plus a codebase scan (public APIs, method signatures, error handling, dependencies) instead of spec sections.
- Natural-language sub-workspace/module mentions and CWD auto-detection remain acceptable fallback when flags are absent.

**Module ownership guard:** `/tdk-plan --ut-backfill` never creates sub-workspaces, modules, or source directories and does not edit `.specify/.specify.json`. If the target sub-workspace has no modules configured, or has modules configured but none defined, ask the user whether to `Proceed at sub-workspace level` or pause; on pause, route durable module ownership through `/tdk-workspace-layout-propose`, `/tdk-workflow-config-apply`, and optionally `/tdk-workspace-dependency-policy` before re-running `/tdk-plan --ut-backfill`.

Both `tdd` and `ut_backfill` phases receive delegate injection from the routed `test` entry (see Skill Routing Injection above): `## Delegate Skills` for its routed skills, `## Delegate Agents` for its routed agents, each omitted when empty. TDD phases also receive the routed implementation delegate for the phase's domain, listed after the `test` delegate inside its own section.
