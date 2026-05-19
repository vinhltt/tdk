# Design Phase

## Solution Design Concerns

- **Trade-off Analysis:** evaluate multiple approaches, compare pros/cons, short-term vs long-term.
- **Security:** OWASP Top 10, auth/authz, input validation, API security.
- **Performance:** bottlenecks, caching, async, scalability.
- **Edge Cases:** error scenarios, network failures, retry/fallback, race conditions.

## Steps

### Project Source Layout (SOT Pre-load)

**MUST DO BEFORE filling `### Source Code` of plan.md:**

1. Resolve `docs.path` from `.specify.json` (default: `.specify/configurations`).
2. Read `{docs.path}/source-code-structure.md`. If file exists, treat its layout as SOT.
3. Replace plan-template Option 1/2/3 boilerplate with actual project layout from SOT.
4. Note feature-specific additions (new files/modules) explicitly — don't duplicate baseline tree.

**Fallback:** if file missing → use template Option 1/2/3 boilerplate (current behavior).

1. Extract entities from spec → `data-model.md`.
2. Define API contracts → `contracts/`.
3. Plan file structure based on framework.
4. Identify dependencies and risks.

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

## UT Phase Auto-inclusion

After all implementation phases are defined, check if a Unit Test phase should be added.

**Mode gate (Phase 03):** if `MODE == "fast"` → **skip the UT phase entirely**. Print `Mode: fast — UT phase skipped.` in the Step 4 banner. See `references/modes.md`.

**Condition** (any of):
- spec.md mentions testing / test requirements; OR
- project has `.specify/configurations/sub-workspaces/*/rules/test/ut-rule.md`; OR
- plan has ≥ 2 implementation phases.

**If condition met** → append a UT phase as the last phase:

```markdown
### Phase N: Unit Test Planning
**Delegate to:** `/tdk-ut-backfill-plan {task_id}`
**Purpose:** Generate UT plan (ut-plan.md) — test strategy, test cases, coverage targets.
**Note:** This phase creates the TEST PLAN only — no test code generated here.
When implementing, `/tdk-implement-from-plan` will auto-delegate
to `/tdk-ut-backfill-impl` (if ut-plan exists) or `/tdk-ut-backfill-auto` (if not).

**Success Criteria:**
- [ ] ut-plan.md created with test matrix
- [ ] Phase files created for each test suite
```

**If condition not met** → skip UT phase (no test requirements detected).

**`--fast` interaction:** when invoked with `--fast` (Phase 03), UT phase auto-inclusion is **skipped** — see `references/modes.md`.
