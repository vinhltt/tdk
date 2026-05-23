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

1. Extract entities from spec ## 6. Functional Requirements > Key Entities → `data-model.md`.
2. Define API contracts from ## 6. Functional Requirements → `contracts/`.
3. Plan file structure based on framework.
4. Identify dependencies and risks (also read ## 8. Risks & Mitigations from spec).

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

**Exclusion:** Skip UT auto-generated phases (phases with `Delegate to: /tdk-ut-backfill-plan`). These already have their own delegation mechanism.

For each non-UT phase being created:

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
   - One bullet per skill, ordered as listed in routing file
   - **Idempotency:** if `## Delegate Skills` already exists → replace section content, don't append

5. **EC-11 advisory** (once per plan, not per phase): if any `PROJECT_CONTEXT.subWorkspaces[].name` has no corresponding `##` section in skill-routing file → warn: "Sub-workspace '{name}' has no skill routing — using global defaults."

## UT Phase Auto-inclusion

After all implementation phases are defined, check if a Unit Test phase should be added.

**Mode gate (Phase 03):** if `MODE == "fast"` → **skip the UT phase entirely**. Print `Mode: fast — UT phase skipped.` in the Step 4 banner. See `references/modes.md`.

**Condition** (any of):
- spec.md mentions testing / test requirements; OR
- project has a UT skill in `.claude/skills/` (name contains `-ut` or `-test`); OR
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
