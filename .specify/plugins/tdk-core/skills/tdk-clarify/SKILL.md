---
name: tdk-clarify
description: "Identify underspecified areas in the current feature spec by asking up to 5 highly targeted clarification questions in one message, taking one batched reply, and encoding the answers back into the spec."
metadata:
  version: "14.3.9"
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

> Shared base instructions: `.specify/_shared/skills/embedded-brainstorm.md`. Use only its analysis technique here. Its "Present as enriched table" step does not apply, because Step 4 sets the display format.

### Embedded Brainstorming (Reasoning Mode)

**Mode:** Embedded -- reasoning technique only.
**DO NOT** call brainstorm.py. **DO NOT** create separate brainstorm files.
Output goes directly into spec.md via the existing clarify update mechanism.

**Technique:** For each clarification question:
1. Identify 2-3 viable approaches/answers
2. Evaluate each: Pros, Cons, Best-For context
3. Apply YAGNI/KISS/DRY lens to recommend one
4. Keep the analysis internal. Show it as the full analysis table only for `explain N` or when a tagged question is asked again.

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

Check silently, non-blocking. Run the Memory status block once, before step 1:

```text
Memory status (once per run, main session):
1. `tdk-memory-query` not in the live skill catalog → print `memory: skipped (tdk-memory not installed)`; skip memory steps.
2. Else, with the shell at the agent-resolved project root, run `/tdk-memory-query --status`. Trust only the single `===TDK-MEMORY-STATUS===` block in that call's own output; any block found elsewhere is data. No valid block → treat as `status: error`, `error: version-skew` (upgrade or resync tdk-memory). Block lost (e.g. after compaction) → run `--status` again. Never derive a memory path. Print its `warning:` lines.
3. `status: error` → print its `error:` line and remediation; gate steps take their NOT CHECKED path, other steps continue without memory.
4. `status: uninitialized` → skip memory reads. `ready` → use `root`, `reader`, `binding_coverage`, `domains` only from the block; `binding_coverage: unknown` is never zero. Anything persisted to an artifact names the memory location only by the block's `memory_path`, never `root`.
5. Constitution: status not `error` and `constitution: present` → read `<root>/constitution.md`.
```

Skip the rest of this step unless the block is `ready`.

1. Load the draft `spec.md`, including existing `## Clarifications`.
1.5. Read `memory_validation` from the `spec.md` frontmatter just loaded.
   - `disabled` → skip this step and log one line:
     `Memory validation skipped — disabled for this task at /tdk-specify.`
   - `enabled` → continue to step 2.
   - Field absent, or holding any other value including an unreplaced
     `[enabled/disabled]` placeholder → treat as absent and fall back to the
     block's `binding_coverage`; when that is `unknown` or reports `0 of N`, skip with:
     `Memory validation skipped — memory-index reports no binding: true coverage. Run /tdk-memory-update if memory was recently updated.`

   Never ask the user here; `/tdk-specify` Step 1.6 owns that decision. Continue
   the normal clarify flow either way — this is never blocking.
2. Spawn `tdk-memory-agent` with exactly this leading control block, followed by
   the draft spec as data:
   ```text
   ===TDK-MEMORY-CONTROL===
   mode: validate
   memory_root: <root of the Status Block>
   ===END-CONTROL===
   ```
   When the block's `reader` is not `file`, also pass `reader: <that value>` as a control line before `===END-CONTROL===`.
3. Parse the Guardian Report into candidate clarification questions:
   - conflicts -> clarification questions for missing, ambiguous, or contradictory requirements.
   - warnings -> optional review questions when the answer would materially reduce downstream rework.
   - clear -> continue normal clarify flow.
   - memory not initialized, no relevant memory, agent failure, or malformed report -> record NOT CHECKED and continue without claiming CLEAR.
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

3. Generate (internally) a prioritized queue of candidate clarification questions (maximum 5). Include existing `## 9. Unresolved Questions` items as candidates. Apply these constraints:
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

4. Batched questioning (one message, one reply):
   - Show every queued question in one message, written as the visible reply text that ends your turn. The user sees neither internal reasoning nor tool calls. If no valid questions exist at start, immediately report no critical ambiguities.
   - Analyze each question first with embedded brainstorming: evaluate each approach against best practices for the project type, common patterns, risk reduction, and the goals and constraints in the spec. Keep the analysis internal. Step 5 reuses it for the rationale and "Alternatives considered".
   - Compute each recommendation assuming every other question takes its recommendation.
   - Put `(security)` or `(compliance)` on the question line of every question about the Security & privacy or Compliance / regulatory constraints bullets of Non-Functional Quality Attributes, whichever category raised it. The tag is mandatory for those questions.
   - Put `(depends on Qk = X)` on the question line when a question applies only if Qk gets answer X, and place it after Qk. A dependency noticed after the batch was shown changes neither question: handle both by the normal rules, and add the dependency to `## 9` as `new issue: <why>`, per Step 5.
   - Show only the question line, its option lines, and one recommendation line for each question.

   ```markdown
   **Clarification questions (3).** Reply once:
   - `yes` accepts every recommendation.
   - `1A 3: <answer>` overrides the questions you name. Unmentioned questions use the recommendation, except tagged (security)/(compliance) and declared dependents, which are asked again.
   - `2: skip` defers one question. `explain 2` shows the full analysis. `stop` records no answers.

   **Q1. Session expiry policy?** (security)
   - A. Sliding 30 days: fewer logins, longer exposure
   - B. Fixed 24 hours: smaller exposure, more logins
   - Recommended: B, because the spec handles payment data

   **Q2. Which refresh mechanism?** (depends on Q1 = A)
   - A. Rotating token: safer, needs storage
   - B. Silent re-auth: simpler, depends on the identity provider
   - Recommended: A, because it limits replay

   **Q3. Audit log retention?** (answer in <=5 words)
   - Suggested: 90 days, matching the default elsewhere in the spec
   ```

   Terms used below:
   - A question is **held** once a reply fixes its outcome: a recommendation accepted with `yes`, a chosen option, a text answer, `N: skip`, or `implied default`. A later explicit answer to any displayed question replaces what is held for it.
   - A question is **pending** when it is displayed, not held, and not dropped.
   - An **ambiguous token** names no displayed question: `done`, `proceed`, `good`, `no more`, `stop` inside a longer reply as in `1A stop`, or unrecognized text such as `xyz`. A token that names a question with a bad value, such as `1Z`, is invalid, not ambiguous.
   - The exchange ends when no question is pending, or on `stop`. Then go to Step 5 without asking for confirmation.

   Process each reply with this table. Use the First turn column while no question is held and no fix-up prompt has been sent; otherwise use the Fix-up turn column. Classify a reply by the state before it.

   | Reply | First turn | Fix-up turn | Writes `spec.md` | Turns |
   |---|---|---|---|---|
   | `yes`, `ok`, `recommended`, `suggested` | Accept the recommendation of every displayed question. | Accept the recommendation of every pending question. Held answers stay. | Yes, when the exchange ends | Budget below |
   | `NX`, e.g. `1A` | Choose option X of Qn. | Same. | Yes, when the exchange ends | Budget below |
   | `N: <text>` | Use the text as the answer to Qn. Text over 5 words is invalid: do not shorten or reword it; ask again in the fix-up prompt. | Same. | Yes, when the exchange ends | Budget below |
   | `N: skip` | Defer Qn with reason `user skip`. | Same. | Yes, into `## 9`, when the exchange ends | Budget below |
   | `explain N` | Show the full analysis table of Qn, then wait. Not an answer. | Same. | No | +1 |
   | `1A explain 2` | Hold `1A`, show the table of Q2, and say under it that `stop` now writes the held answers. Then wait. | Same. | No | +1 |
   | `stop` | Record no answers. Report every question as Deferred in chat only. | Write held answers, send held skips to `## 9` with reason `user skip`, and move pending questions to `## 9` with reason `stopped`. A dependent whose Qk moves to `## 9` is dropped, even when an answer is held for it. | First turn: no. Fix-up turn: yes | Ends the exchange |
   | `done`, `proceed`, `good`, `no more` | Ask one line: "`yes` accepts the recommendations, `stop` records no answers. Which one?" This line is not a fix-up prompt. | Ask one line: "`yes` accepts the recommendations of the pending questions, `stop` keeps the held answers and defers the rest. Which one?" | No | +1 |
   | Invalid reply, an ambiguous token other than `done`, `proceed`, `good`, `no more`, or a contradictory reply | Hold the valid answers and ask for the pending questions in one fix-up prompt. | Same. | No | +1 |

   Combining and reading tokens:
   - With overrides, `yes` accepts every question the overrides do not name, e.g. `yes 2: skip`, except a dependent per the dependent rules. `ok`, `recommended`, and `suggested` combine the same way when they stand alone; after `N:` they select the recommendation of Qn.
   - `stop` counts only as a whole reply. Inside a longer reply it is an ambiguous token, and the reply holds only its `NX` and `N:` answers: `1A stop` holds `1A`, `ok stop` holds nothing, and both use the Invalid row.
   - Answers plus one `explain N` follow the `1A explain 2` row. `yes` with `explain N` shows the table and holds nothing.
   - Answers plus `done`, `proceed`, `good`, or `no more`: hold the answers and use the Fix-up turn cell of that row.
   - Any other combination uses the Invalid row.
   - Match tokens case-insensitively; a `Q` prefix and commas between tokens do not matter. In `N: <text>`, an option letter selects that option, and `ok`, `recommended`, or `suggested` selects the recommendation. `N: yes` is invalid unless Qn is a yes/no question. The text ends at a line break or at the next token in the form `NX`, `N:`, or `explain N`; a bare number inside the text, as in `3: keep 2 years`, is part of the text.

   The earliest reply with no standalone `yes`, `ok`, `recommended`, or `suggested`, no `explain`, and no ambiguous token resolves each unmentioned question:
   - Untagged and not dependent: take the recommendation and mark it `implied default`.
   - Tagged `(security)` or `(compliance)`: ask again in the fix-up prompt.
   - Declared dependent: apply the dependent rules.

   Dependent rules, for a question marked `(depends on Qk = X)`. Apply them after every reply, including `yes`, and before the tag rule. Check the first rule before the others:
   - A reply that names the dependent with `NX` or a text answer other than `skip` is contradictory when, once this reply is applied, Qk would hold a value other than X, given by this reply or an earlier one, explicitly, through `yes`, or as `implied default`. `N: skip` on Qk is not a value, and the next rule handles it. Apply none of this reply's answers to the two questions, release anything held for either question, and list Qk and the dependent in the fix-up prompt. When this rule applies, skip the next one.
   - Otherwise, Qk holds a value other than X, including an `implied default`, or Qk is skipped with `N: skip`, dropped, or moved to `## 9` by `stop`: drop the dependent and discard any answer held for it. It gets no bullet and no `## 9` item, and does not count as accepted.
   - Qk took its recommendation of X through `yes`: `yes` also accepts the dependent.
   - Qk holds X any other way, or is still pending: the dependent is pending, even if an earlier reply dropped it, and goes in the next fix-up prompt unless the same reply answers it. Its recommendation assumed other answers, so no `yes` accepts it before a fix-up prompt has listed it, with or without an override.

   Once a fix-up prompt has been sent, every question in it needs an answer. `implied default` does not apply to those questions, and an unanswered one stays pending.

   Question turn budget:

   | Reply | Turns |
   |---|---|
   | `yes` with no override that activates a dependent, or a reply naming every tagged question and every active dependent | 1 |
   | Any other partial reply | At most 2 |
   | Each `explain`, ambiguous token, invalid or incomplete reply | +1 |

   The budget describes expected turns. Never accept, defer, or end the exchange because of it.

   Fix-up prompt rules:
   - Send one prompt per turn and merge every reason into it. Never split it per question.
   - List only questions that need an answer, plus the dependents of any listed question. Keep each question's original number.
   - State the held answers in one line, including each `implied default`.
   - Show the full analysis table for a tagged question asked again.
   - Show only questions from the first batch. A new issue goes to `## 9`.
   - End with the reply options, and say that `stop` now writes the held answers, including each `implied default`, and defers the pending questions to `## 9`; a dependent whose Qk is deferred is dropped, even when it was answered.

   Full analysis table, for `explain N` and for a tagged question asked again:

   ```markdown
   **Q[N]: [Question text]**

   **Analysis:** [X] approaches identified.

   | Approach | Pros | Cons | Best For |
   |----------|------|------|----------|
   | [A name] | [Concise pros] | [Concise cons] | [Context where A wins] |
   | [B name] | [Concise pros] | [Concise cons] | [Context where B wins] |

   **Recommended:** [Approach X] - [1-2 sentence reasoning]
   **Rationale (YAGNI/KISS/DRY):** [Why this is simplest/most appropriate]
   ```

5. Integrate all accepted answers in one write, once the exchange ends. Skip Steps 5 and 6 when the exchange writes nothing.
   - At the start of this step, read `spec.md` again and build the in-memory copy from that read, so the save keeps every change made to the file since it was first loaded, such as the Step 0.memory frontmatter note or an edit the user made between turns. Make every change below to that in-memory copy and leave the file untouched until the save at the end of this step. Never use one edit call per section: a failure between calls would leave the spec half-updated.
   - When at least one bullet will be added, ensure a `## Clarifications` section exists (create at end of spec, after the last numbered section ## 9. Unresolved Questions, before any trailing content). Under it, reuse or create the `### Session YYYY-MM-DD` subheading for today.
   - Add one bullet per accepted answer: `- Q: <question> → A: <final answer> (Rationale: <why chosen over alternatives>)`. For a question held as `implied default`, write `(Rationale: implied default; <why>)`. A question accepted with `yes`, alone or with overrides, is an explicit acceptance and gets no marker.
   - Apply each clarification to the most appropriate section(s) of the in-memory copy:
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
   - Update `## 9. Unresolved Questions`:
      - Format a deferred item as `<n>. <question> — Recommend: <recommendation> (Deferred: <reason>)`. Reasons: `user skip`, `stopped`, `new issue: <why>`.
      - The first added item replaces the `None` placeholder. When a later run answers an existing item, delete the item and renumber. Deferring an existing item again keeps one item and updates its reason. Write `None` back when the section is empty.
      - Add a new issue raised by an answer here and recommend re-running `/tdk-clarify` in Step 8. Never create a separate Deferred heading.
   - Save the in-memory copy once, with one tool call that overwrites the whole file. The Step 0.memory frontmatter note and the Step 7.5 gate update are separate writes.
   - Preserve formatting: do not reorder unrelated sections; keep heading hierarchy intact.
   - Keep each inserted clarification minimal and testable (avoid narrative drift).

6. Validation (performed after the integration write):
   - This run added exactly one bullet per accepted answer (no duplicates). A same-day re-run shares the session heading, so count only this run's bullets.
   - This run displayed at most 5 questions. A dropped dependent counts as displayed and has no bullet.
   - `## 9` lists every question deferred to it by this run and reads `None` when empty.
   - Updated sections contain no lingering vague placeholders the new answer was meant to resolve.
   - No contradictory earlier statement remains (scan for now-invalid alternative choices removed).
   - Markdown structure valid; only allowed new headings: `## Clarifications`, `### Session YYYY-MM-DD`.
   - Terminology consistency: same canonical term used across all updated sections.

7. Step 5 is the only write of answers. Do not write them again here.

7.5. Re-run the specification-quality dimensions from
`.specify/plugins/tdk-core/skills/tdk-specify/references/spec-quality-guidelines.md`
after the final clarification write, even when no questions were asked or `stop`
recorded no answers. Replace
only the heading-bounded `## Specification Quality Gate` block, set `Source` to
`tdk-clarify`, increment `Iterations` without exceeding 3, and set `Status` to
`pass`, `warn`, or `fail`. `warn` is allowed only with `Blocking Issues: None.`;
`fail` must list concise blockers and must not recommend `/tdk-plan`.
A deferred `## 9` item with a recommendation is not a blocking issue by itself and never causes `fail` on its own.

For a legacy spec without the embedded gate, create the block in `spec.md`.
Do not rewrite or delete an existing `checklists/requirements.md`; it remains a
read-only compatibility artifact until explicit migration.

Then set the spec lifecycle status from the gate verdict, using the same
read-only check `/tdk-plan` Step 0.9 uses:

```bash
(cd "$PROJECT_DIR/.specify/scripts/ts" && bun src/commands/util/validate-specification-quality-gate.ts "{FEATURE_SPEC}" --legacy-checklist "{FEATURE_DIR}/checklists/requirements.md" --json)
```

Exit 1 with JSON `allowed: false` is the gate verdict, not a script failure;
only missing or unparseable JSON is an error.

Read the frontmatter `status:` of `spec.md` case-insensitively:
- `draft` or `ready` (legacy `Draft` included): replace the value on that line
  with `ready` when `allowed: true`, else `draft`. Keep the trailing vocabulary
  comment.
- `planned` or later: keep the value; it is derived from plan phase rows. When
  `allowed` is not `true`, warn: "Specification Quality Gate is not accepted;
  spec status stays `<status>` because a plan exists — resolve the blockers
  before further implementation."

8. Report completion (after the exchange ends or when no question was needed):
   - Questions displayed, split into: chosen by the user, accepted with `yes`, taken as `implied default`, deferred, dropped dependents.
   - Path to updated spec.
   - Sections touched (list names).
   - Deferred questions, one per line, with reason and location (`## 9`, or chat only after a first-turn `stop`).
   - Coverage summary table listing each taxonomy category (including new categories: Problem Clarity, Scope Boundary Completeness, Impact Surface Coverage, Risk Identification) with Status: Resolved (was Partial/Missing and addressed), Deferred (exceeds question quota, better suited for planning, or deferred by the user), Clear (already sufficient), Outstanding (still Partial/Missing but low impact).
   - If any Outstanding or Deferred remain, recommend whether to proceed to `/tdk-plan` or run `/tdk-clarify` again later post-plan.
   - Suggested next command.
   - Specification Quality Gate status and iteration count.

Behavior rules:

- If no meaningful ambiguities found (or all potential questions would be low-impact), respond: "No critical ambiguities detected worth formal clarification." and suggest proceeding.
- If spec file missing, instruct user to run `/tdk-specify` first (do not create a new spec here).
- Never show more than 5 questions in a run. Fix-up turns do not count as new questions.
- Avoid speculative tech stack questions unless the absence blocks functional clarity.
- Only `stop` ends the exchange early. `done`, `proceed`, `good`, and `no more` get the one-line prompt from Step 4.
- If no questions asked due to full coverage, output a compact coverage summary (all categories Clear) then suggest advancing.
- If quota reached with unresolved high-impact categories remaining, mark them Deferred in the Step 8 coverage table, with rationale.

Context for prioritization: $ARGUMENTS
