---
name: tdk-clarify
description: "Identify underspecified areas in the current feature spec by asking up to 5 highly targeted clarification questions and encoding answers back into the spec."
metadata:
  version: "11.0.0"
---

## ⛔ CRITICAL: Error Handling

**If ANY script returns an error, you MUST:**
1. **STOP immediately** - Do NOT attempt workarounds or auto-fixes
2. **Report the error** - Show the exact error message to the user
3. **Wait for user** - Ask user how to proceed before taking any action

**DO NOT:**
- Try alternative approaches when scripts fail
- Create branches manually when script validation fails
- Guess or assume what the user wants after an error
- Continue with partial results

---

## User Input

```text
$ARGUMENTS
```

You **MUST** consider the user input before proceeding (if not empty).

## Skill References

> Shared base instructions: `.specify/_shared/skills/embedded-brainstorm.md`

### Embedded Brainstorming (Reasoning Mode)

**Mode:** Embedded -- reasoning technique only.
**DO NOT** call brainstorm.py. **DO NOT** create separate brainstorm files.
Output goes directly into spec.md via the existing clarify update mechanism.

**Technique:** For each clarification question:
1. Identify 2-3 viable approaches/answers
2. Evaluate each: Pros, Cons, Best-For context
3. Apply YAGNI/KISS/DRY lens to recommend one
4. Present as enriched table (see Step 4 format)

### Sequential Thinking (Gap Prioritization)

**Trigger:** After building coverage map in Step 2.
**Technique:** Prioritize gaps using step-by-step reasoning:
1. List all Partial/Missing categories
2. For each, estimate: Impact (1-5) x Uncertainty (1-5)
3. Rank by composite score descending
4. Select top 5 for questioning
5. If tied, prefer: security > data model > functional scope > UX > non-functional

## Outline

Goal: Detect and reduce ambiguity or missing decision points in the active feature specification and record the clarifications directly in the spec file.

Note: This clarification workflow is expected to run (and be completed) BEFORE invoking `/tdk-plan`. If the user explicitly states they are skipping clarification (e.g., exploratory spike), you may proceed, but must warn that downstream rework risk increases.

### Step 0 — Validate Task ID
Invoke `tdk-validate-task-id` with `$ARGUMENTS` and host skill name `/tdk-clarify`.
If STOP → halt execution.
Store: `TASK_ID`, `TASK_ID_SOURCE`.

### Step 0.1 — Load Project Context
Invoke `tdk-load-project-context` with validated `TASK_ID`.
Store: `PROJECT_CONTEXT`, `FEATURE_DIR`.

### Step 0.memory: Memory Validation

**Only if `.specify/memory/memory-index.md` exists** (check silently, non-blocking):

1. Load the draft `spec.md`, including existing `## Clarifications`.
2. Spawn `tdk-memory-agent` agent with `--mode validate` and the draft spec content.
3. Parse the Guardian Report into candidate clarification questions:
   - conflicts -> clarification questions for missing, ambiguous, or contradictory requirements.
   - warnings -> optional review questions when the answer would materially reduce downstream rework.
   - clear -> continue normal clarify flow.
   - `STATUS: MCP_UNAVAILABLE`, memory not initialized, no relevant memory, or agent failure -> skip memory validation without prompting or failing.
4. Duplicate prevention:
   - Read existing `## Clarifications` session content.
   - If `/tdk-specify` already recorded the same resolution, do not ask again.
5. Frontmatter semantics:
   - Note in `spec.md` frontmatter: `memory_context_loaded: true` only when a usable Guardian Report was returned.
   - Note in `spec.md` frontmatter: `memory_context_loaded: false`

**This step MUST NOT block or error.** If `tdk-memory-agent` fails for any reason, skip and continue.

### Execution Steps

1. Run the prerequisite command with an agent-resolved project root (pass the validated task_id from Step 0):
   ```bash
   bash -lc '
   PROJECT_DIR="$1"
   if [ -z "$PROJECT_DIR" ] || [ ! -d "$PROJECT_DIR/.specify/scripts/ts" ]; then
     echo "Invalid project root: $PROJECT_DIR" >&2
     exit 1
   fi
   (cd "$PROJECT_DIR/.specify/scripts/ts" && bun src/commands/util/check-prerequisites.ts {task_id} --json --paths-only)
   ' -- "<agent-resolved-project-root>"
   ```
   Ask the user for the project root if `<agent-resolved-project-root>` cannot be identified confidently; do not pass the placeholder literally. Parse minimal JSON payload fields:
   - `featureDir`
   - `featureSpec`
   - (Optionally capture `IMPL_PLAN`, `TASKS` for future chained flows.)
   - If JSON parsing fails, abort and instruct user to re-run `/tdk-specify` or verify feature branch environment.
   - For single quotes in args like "I'm Groot", use escape syntax: e.g 'I'\''m Groot' (or double-quote if possible: "I'm Groot").

2. Load the current spec file.

   **Legacy format detection**: Check for ALL THREE headings: `## 1. Problem Statement`, `## 2. Scope Boundary`, `## 3. Impact Surface`. If ANY of the three is missing: emit advisory "Legacy spec format detected. Re-run /tdk-specify to upgrade." Skip new taxonomy categories (Problem Clarity, Scope Boundary Completeness, Impact Surface Coverage, Risk Identification) and continue with existing categories for best-effort clarification.

   Perform a structured ambiguity & coverage scan using this taxonomy. For each category, mark status: Clear / Partial / Missing. Produce an internal coverage map used for prioritization (do not output raw map unless no questions will be asked).

   Problem Clarity:
   - Is ## 1. Problem Statement concrete and specific? Or vague ("improve UX")?
   - Does it identify who is affected and why the feature is needed now?

   Scope Boundary Completeness:
   - Are ## 2. Scope Boundary in-scope/out-of-scope items explicit?
   - Any ambiguous boundary items that could be interpreted either way?
   - Does ## 2. Scope Boundary align with what's actually covered in ## 5. User Requirements & Testing and ## 6. Functional Requirements?

   Impact Surface Coverage:
   - Do all impacted subworkspaces/modules in ## 3. Impact Surface have corresponding UR/FR entries?
   - Are there UR/FR with [sw/module] tags not present in ## 3. Impact Surface?
   - Is ## 3. Impact Surface "N/A" appropriate (monolith) or missing data (multi-SW project)?

   Functional Scope & Behavior:
   - Core user goals & success criteria
   - Explicit out-of-scope declarations (now also scans ## 2. Scope Boundary for implicit scope gaps)
   - User roles / personas differentiation

   Domain & Data Model:
   - Entities, attributes, relationships
   - Identity & uniqueness rules
   - Lifecycle/state transitions
   - Data volume / scale assumptions

   Interaction & UX Flow:
   - Critical user journeys / sequences
   - Error/empty/loading states
   - Accessibility or localization notes

   Non-Functional Quality Attributes:
   - Performance (latency, throughput targets)
   - Scalability (horizontal/vertical, limits)
   - Reliability & availability (uptime, recovery expectations)
   - Observability (logging, metrics, tracing signals)
   - Security & privacy (authN/Z, data protection, threat assumptions)
   - Compliance / regulatory constraints (if any)

   Integration & External Dependencies:
   - External services/APIs and failure modes
   - Data import/export formats
   - Protocol/versioning assumptions

   Edge Cases & Failure Handling:
   - Negative scenarios
   - Rate limiting / throttling
   - Conflict resolution (e.g., concurrent edits)

   Constraints & Tradeoffs:
   - Technical constraints (language, storage, hosting)
   - Explicit tradeoffs or rejected alternatives (now also scans ## 4. Evaluated Approaches for rejected alternatives that may need documentation)

   Risk Identification:
   - Are ## 8. Risks & Mitigations identified? Are mitigations realistic?
   - Are there obvious risks from scope decisions or multi-subworkspace coordination not captured?

   Terminology & Consistency:
   - Canonical glossary terms
   - Avoided synonyms / deprecated terms

   Completion Signals:
   - Acceptance criteria testability
   - Measurable Definition of Done style indicators

   Misc / Placeholders:
   - TODO markers / unresolved decisions
   - Ambiguous adjectives ("robust", "intuitive") lacking quantification

   For each category with Partial or Missing status, add a candidate question opportunity unless:
   - Clarification would not materially change implementation or validation strategy
   - Information is better deferred to planning phase (note internally)

3. Generate (internally) a prioritized queue of candidate clarification questions (maximum 5). Do NOT output them all at once. Apply these constraints:
    - Maximum of 10 total questions across the whole session.
    - Each question must be answerable with EITHER:
       - A short multiple‑choice selection (2–5 distinct, mutually exclusive options), OR
       - A one-word / short‑phrase answer (explicitly constrain: "Answer in <=5 words").
    - Only include questions whose answers materially impact architecture, data modeling, task decomposition, test design, UX behavior, operational readiness, or compliance validation.
    - Ensure category coverage balance: attempt to cover the highest impact unresolved categories first; avoid asking two low-impact questions when a single high-impact area (e.g., security posture) is unresolved.
    - Exclude questions already answered, trivial stylistic preferences, or plan-level execution details (unless blocking correctness).
    - Favor clarifications that reduce downstream rework risk or prevent misaligned acceptance tests.
    - If more than 5 categories remain unresolved, select the top 5 by (Impact * Uncertainty) heuristic.

   **Sequential Thinking for Prioritization:**
   Before generating questions, apply structured step-by-step reasoning to prioritize gaps:
   - Step 1: List all categories with Partial or Missing status from coverage map
   - Step 2: For each, assign Impact score (1-5): How much would resolving this change implementation?
   - Step 3: For each, assign Uncertainty score (1-5): How ambiguous is the current spec on this?
   - Step 4: Calculate Priority = Impact x Uncertainty for each
   - Step 5: Rank descending. If tied, use tiebreaker order: security > data model > functional scope > UX > non-functional > edge cases > terminology
   - Step 6: Select top 5 for questioning queue
   - This reasoning may be done internally (not shown to user) but MUST influence question order.

4. Sequential questioning loop (interactive):
    - Present EXACTLY ONE question at a time.
    - For multiple-choice questions, apply **embedded brainstorming** (reasoning mode):
       1. **Identify 2-3 viable approaches** for the gap area
       2. **Evaluate each approach** considering:
          - Best practices for the project type
          - Common patterns in similar implementations
          - Risk reduction (security, performance, maintainability)
          - Alignment with project goals/constraints in the spec
       3. **Apply YAGNI/KISS/DRY analysis** to determine recommendation
       4. **Present as enriched analysis table**:

       ```
       **Q[N]: [Question text]**

       **Analysis:** [X] approaches identified.

       | Approach | Pros | Cons | Best For |
       |----------|------|------|----------|
       | [A name] | [Concise pros] | [Concise cons] | [Context where A wins] |
       | [B name] | [Concise pros] | [Concise cons] | [Context where B wins] |
       | [C name] | [Concise pros] | [Concise cons] | [Context where C wins] |

       **Recommended:** [Approach X] - [1-2 sentence reasoning]
       **Rationale (YAGNI/KISS/DRY):** [Why this is simplest/most appropriate]
       ```

       - After the table, add: `Reply with approach name (e.g., "A"), accept recommendation with "yes", or provide your own short answer (<=5 words).`
    - For short‑answer style (no meaningful discrete options):
       - Provide your **suggested answer** based on best practices and context.
       - Format as: `**Suggested:** <your proposed answer> - <brief reasoning>`
       - Then output: `Format: Short answer (<=5 words). You can accept the suggestion by saying "yes" or "suggested", or provide your own answer.`
    - After the user answers:
       - If the user replies with "yes", "recommended", or "suggested", use your previously stated recommendation/suggestion as the answer.
       - Otherwise, validate the answer maps to one option or fits the <=5 word constraint.
       - If ambiguous, ask for a quick disambiguation (count still belongs to same question; do not advance).
       - Once satisfactory, record it in working memory (do not yet write to disk) and move to the next queued question.
    - Stop asking further questions when:
       - All critical ambiguities resolved early (remaining queued items become unnecessary), OR
       - User signals completion ("done", "good", "no more"), OR
       - You reach 5 asked questions.
    - Never reveal future queued questions in advance.
    - If no valid questions exist at start, immediately report no critical ambiguities.

5. Integration after EACH accepted answer (incremental update approach):
    - Maintain in-memory representation of the spec (loaded once at start) plus the raw file contents.
    - For the first integrated answer in this session:
       - Ensure a `## Clarifications` section exists (create at end of spec, after the last numbered section ## 9. Unresolved Questions, before any trailing content).
       - Under it, create (if not present) a `### Session YYYY-MM-DD` subheading for today.
    - Append a bullet line immediately after acceptance: `- Q: <question> → A: <final answer> (Rationale: <why chosen over alternatives>)`.
    - Then immediately apply the clarification to the most appropriate section(s):
       - Functional ambiguity → Update or add a bullet in ## 6. Functional Requirements.
       - User interaction / actor distinction → Update ## 5. User Requirements & Testing with clarified role, constraint, or scenario.
       - Data shape / entities → Update ## 6. Functional Requirements > Key Entities subsection (add fields, types, relationships) preserving ordering; note added constraints succinctly.
       - Non-functional constraint → Add/modify measurable criteria in ## 7. Success Criteria (convert vague adjective to metric or explicit target).
       - Edge case / negative flow → Add a new bullet under ## 5. User Requirements & Testing > Edge Cases subsection (or create if missing).
       - Scope ambiguity → Update ## 2. Scope Boundary with clarified in-scope/out-of-scope item.
       - Risk gap → Add row to ## 8. Risks & Mitigations table.
       - Problem clarity → Refine ## 1. Problem Statement with concrete detail.
       - Terminology conflict → Normalize term across spec; retain original only if necessary by adding `(formerly referred to as "X")` once.
    - When updating the target section, include:
      - The chosen decision/value
      - Brief note: "Alternatives considered: [X], [Y]" (one line, after the decision)
      - This ensures future readers understand WHY this choice was made
    - Keep the alternatives note concise (max 1 line per alternative)
    - If the clarification invalidates an earlier ambiguous statement, replace that statement instead of duplicating; leave no obsolete contradictory text.
    - Save the spec file AFTER each integration to minimize risk of context loss (atomic overwrite).
    - Preserve formatting: do not reorder unrelated sections; keep heading hierarchy intact.
    - Keep each inserted clarification minimal and testable (avoid narrative drift).

6. Validation (performed after EACH write plus final pass):
   - Clarifications session contains exactly one bullet per accepted answer (no duplicates).
   - Total asked (accepted) questions ≤ 5.
   - Updated sections contain no lingering vague placeholders the new answer was meant to resolve.
   - No contradictory earlier statement remains (scan for now-invalid alternative choices removed).
   - Markdown structure valid; only allowed new headings: `## Clarifications`, `### Session YYYY-MM-DD`.
   - Terminology consistency: same canonical term used across all updated sections.

7. Write the updated spec back to `FEATURE_SPEC`.

7.5. Re-run the specification-quality dimensions from
`.specify/plugins/tdk-core/skills/tdk-specify/references/spec-quality-guidelines.md`
after the final clarification write, even when no questions were asked. Replace
only the heading-bounded `## Specification Quality Gate` block, set `Source` to
`tdk-clarify`, increment `Iterations` without exceeding 3, and set `Status` to
`pass`, `warn`, or `fail`. `warn` is allowed only with `Blocking Issues: None.`;
`fail` must list concise blockers and must not recommend `/tdk-plan`.

For a legacy spec without the embedded gate, create the block in `spec.md`.
Do not rewrite or delete an existing `checklists/requirements.md`; it remains a
read-only compatibility artifact until explicit migration.

8. Report completion (after questioning loop ends or early termination):
   - Number of questions asked & answered.
   - Path to updated spec.
   - Sections touched (list names).
   - Coverage summary table listing each taxonomy category (including new categories: Problem Clarity, Scope Boundary Completeness, Impact Surface Coverage, Risk Identification) with Status: Resolved (was Partial/Missing and addressed), Deferred (exceeds question quota or better suited for planning), Clear (already sufficient), Outstanding (still Partial/Missing but low impact).
   - If any Outstanding or Deferred remain, recommend whether to proceed to `/tdk-plan` or run `/tdk-clarify` again later post-plan.
   - Suggested next command.
   - Specification Quality Gate status and iteration count.

Behavior rules:

- If no meaningful ambiguities found (or all potential questions would be low-impact), respond: "No critical ambiguities detected worth formal clarification." and suggest proceeding.
- If spec file missing, instruct user to run `/tdk-specify` first (do not create a new spec here).
- Never exceed 5 total asked questions (clarification retries for a single question do not count as new questions).
- Avoid speculative tech stack questions unless the absence blocks functional clarity.
- Respect user early termination signals ("stop", "done", "proceed").
- If no questions asked due to full coverage, output a compact coverage summary (all categories Clear) then suggest advancing.
- If quota reached with unresolved high-impact categories remaining, explicitly flag them under Deferred with rationale.

Context for prioritization: $ARGUMENTS
