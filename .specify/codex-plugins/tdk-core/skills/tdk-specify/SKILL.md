---
name: tdk-specify
description: "Create or update the feature specification from a natural language feature description. Default: full brainstorm with Option A/B. Use --fast for single recommendation without brainstorm."
metadata: 
  version: "5.7.0"
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

**Load before Step 2:**
- Read `references/spec-writing-principles.md` for Core Principles (YAGNI/KISS/DRY), Planning Framework, and Embedded Brainstorming rules.
- Read `references/spec-quality-guidelines.md` for section requirements, AI generation rules, and success criteria guidelines.

## Boundary Declaration

**This command produces:**
- Feature specification (spec.md) with 9 numbered sections + Clarifications
- Quality validation checklist
- Unresolved questions (## 9. Unresolved Questions) presented to user for resolution

**This command does NOT:**
- Create implementation plans (use /tdk-plan)
- Generate tasks
- Write code

## Quality Gates

### Before Writing Spec
- [ ] Feature description provided
- [ ] Task_id validated
- [ ] Project context loaded (if available)

### Before Completion
- [ ] All 9 sections filled (## 4. Evaluated Approaches and ## 8. Risks & Mitigations may be marked N/A if genuinely not applicable)
- [ ] No inline [NEEDS CLARIFICATION] markers (all migrated to ## 9. Unresolved Questions)
- [ ] Success criteria are measurable and tech-agnostic
- [ ] No implementation details in spec
- [ ] `[sw/module]` tags on all UR/FR (unless monolith with no modules)

## Execution Steps

### Step 0 — Validate Task ID
Invoke `tdk-validate-task-id` with `$ARGUMENTS` and host skill name `/tdk-specify`.
If STOP → halt execution.
Store: `TASK_ID`, `TASK_ID_SOURCE`.

### Step 0.1 — Load Project Context
Invoke `tdk-load-project-context` with validated `TASK_ID`.
Store: `PROJECT_CONTEXT`, `FEATURE_DIR`.

### Step 0.2: Check Feature Description & Create Feature Directory

- Extract second argument onwards as description
- When checking if description is empty, treat `--fast` token as non-description text (ignore it for emptiness check only — actual flag stripping happens in Step 0.3)
- If description EMPTY or MISSING (after ignoring --fast token):
  ERROR: "Description required. Usage: /tdk-specify {task-id} {description} [--fast]"

**Create feature directory:**

1. Determine paths from PROJECT_CONTEXT:
   - `SPECS_ROOT` = project's `.specify` root
   - `FOLDER` = parsed from TASK_ID (prefix folder or defaultFolder)
   - `TICKET_ID` = parsed ticket identifier (e.g. `tdk-001`)
   - `FEATURE_DIR` = `$SPECS_ROOT/$FOLDER/$TICKET_ID`
   - `SPEC_FILE` = `$FEATURE_DIR/spec.md`

2. Check duplicate spec file:
   ```bash
   SPEC_FILE="$FEATURE_DIR/spec.md"
   test -f "$SPEC_FILE" && echo "ERROR: Ticket spec already exists" || echo "OK"
   ```
   If `spec.md` exists -> ERROR, STOP. A feature directory containing only
   `discovery/` is allowed so discovery-first flow can continue to specify.

3. Check duplicate git branches (non-blocking warning):
   ```bash
   git branch --list "$FOLDER/$TICKET_ID" 2>/dev/null
   git ls-remote --heads origin "refs/heads/$FOLDER/$TICKET_ID" 2>/dev/null
   ```
   If branch exists → WARN only, continue.

4. Create feature directory:
   ```bash
   mkdir -p "$FEATURE_DIR"
   ```

5. Note current branch for warning:
   ```bash
   CURRENT_BRANCH=$(git rev-parse --abbrev-ref HEAD 2>/dev/null || echo "N/A")
   EXPECTED_BRANCH="$FOLDER/$TICKET_ID"
   ```
   If `CURRENT_BRANCH != EXPECTED_BRANCH` → print warning (non-blocking).

Store: `FEATURE_DIR`, `SPEC_FILE`, `EXPECTED_BRANCH`, `CURRENT_BRANCH`.

### Step 0.2a - Optional Discovery Context

After `FEATURE_DIR` is resolved, check for discovery context:

```bash
DISCOVERY_INDEX="$FEATURE_DIR/discovery/index.md"
test -f "$DISCOVERY_INDEX" && echo "DISCOVERY_CONTEXT=$DISCOVERY_INDEX" || echo "NO_DISCOVERY_CONTEXT"
```

If `discovery/index.md` exists, read it as optional context before spec generation.
Do not require discovery for normal specify flow.
Discovery is context only. Only `tdk-specify` mints `UR-*`, `FR-*`, and `SC-*`.
Use discovery for concise source references in `## 1. Problem Statement` and `## 4. Evaluated Approaches`; do not copy discovery prose wholesale into `spec.md`.
Do not copy discovery content into `UR-*`, `FR-*`, or `SC-*`; derive explicit spec requirements from it.

### Step 0.3 — Mode Detection

**This step owns ALL flag parsing and mode decision logic.**

1. **Flag parsing** (highest priority):
   - Scan $ARGUMENTS for `--fast`
   - If `--fast` found: set `SPEC_MODE = fast`, `MODE_SOURCE = "user-specified"`, strip flag from description
   - If not found: proceed to auto-detect (default is full mode)

2. **Auto-detect from description** (when no flag):
   - Analyze the feature description:
     - Count words (excluding task ID)
     - Count distinct actors (roles/users mentioned)
     - Count distinct actions (verbs/operations)
   - Decision rule:
     - Word count ≤15 AND single actor AND single action → `PRELIMINARY_MODE = fast`
     - Otherwise → `PRELIMINARY_MODE = full`
   - Set `MODE_SOURCE = "auto-detected"`

3. **Print mode and confirm**:
   - If `MODE_SOURCE = "user-specified"`:
     Print `Mode: fast (user-specified via --fast)` and proceed.
   - If `MODE_SOURCE = "auto-detected"`:
     Use AskUserQuestion to confirm:
     - Question: "Detected mode: [fast|full] (reason: [N words, M actors, K actions]). Proceed with this mode?"
     - Options: "Yes, proceed" / "Switch to [other mode]"
     If user switches → update `SPEC_MODE` accordingly.

Store: `SPEC_MODE`, `MODE_SOURCE`, `PRELIMINARY_MODE` (only set during auto-detect).

### Step 0.memory: Memory Validation

**Only if `.specify/memory/memory-index.md` exists** (check silently, non-blocking):

1. Spawn `tdk-memory-agent` agent with `--mode validate` and the raw feature description.
   - Ask it to detect only high-signal business contradictions at this stage; ambiguity and completion checks stay for `/tdk-clarify`.
2. Parse the Guardian Report and store it as `MEMORY_VALIDATE_REPORT`.
   - `Action required: BLOCK_IMPL` → ask one `AskUserQuestion` round for business-conflict resolution. Include conflicts and any warnings as non-blocking review notes in the same round. Store accepted answers as `MEMORY_RESOLUTIONS`.
   - `Action required: REVIEW` → record warnings as review notes for spec writing; do not block.
   - `Action required: CLEAR` → continue normally.
   - `STATUS: MCP_UNAVAILABLE`, memory not initialized, no relevant memory, or agent failure → skip validation without prompting or failing.
3. Frontmatter semantics:
   - Set `memory_context_loaded` in the `spec.md` YAML frontmatter block (written in Step 2.4): use `memory_context_loaded: true` only when a usable Guardian Report was returned, otherwise `memory_context_loaded: false`.
4. When writing `spec.md`, persist accepted `MEMORY_RESOLUTIONS` in `## Clarifications` or as explicit constraints in the relevant section.
   - Do not ask later stages the same resolved business-conflict again.

**This step MUST NOT block or error.** If `tdk-memory-agent` fails for any reason, skip and continue.

### Step 1: Load `.specify/templates/spec-template.md.tpl` to understand required sections.

### Step 1.5 — Impact Surface Detection

1. Read `PROJECT_CONTEXT.subWorkspaces[]` from loaded project config
2. Parse feature description → extract actors, actions, data entities
3. For each entity, match against subWorkspaces[].name and subWorkspaces[].modules[].name:
   - API/endpoint/service keywords → backend-type subworkspace
   - UI/page/form/component keywords → frontend-type subworkspace
   - Database/model/schema keywords → data-layer modules
4. Build Impact Surface table:
   | Subworkspace | Module | Impact Type | Description |
5. Present table to user via AskUserQuestion:
   - Question: "Detected impact areas. Confirm or edit:"
   - Options: "Confirm as-is" / "I'll edit the table after spec is generated"
6. Store confirmed table as IMPACT_SURFACE for use in Steps 2-3

**Monolith fallback**: If no subWorkspaces in config:
- Show modules only (if defined)
- If no modules either: ## 3. Impact Surface shows "N/A — monolith project". Set IMPACT_SURFACE = empty
- Skip `[sw/module]` tagging on US/FR when IMPACT_SURFACE is empty
- Checklist items for tags become **conditional**: only check when IMPACT_SURFACE is non-empty

**Edge case**: Feature touches unknown area → add row with Impact Type = "[TBD]"

**Mode upgrade check**: If `PRELIMINARY_MODE = fast` AND `MODE_SOURCE = "auto-detected"` AND Impact Surface has ≥2 subworkspaces:
- Upgrade `SPEC_MODE` to `full`
- Print: "Mode upgraded: fast → full (Impact Surface spans 2+ subworkspaces)"
- User flag override (`--fast`) is NOT upgraded — user explicitly chose fast

### Step 2: Specification Generation (9-Section Format)

    1. Parse user description from Input
       If empty: ERROR "No feature description provided"
    2. Extract key concepts from description
       Identify: actors, actions, data, constraints

       **If SPEC_MODE = full:**
       Apply embedded brainstorming at every scope boundary decision:
       - Is this core to the feature? (in scope)
       - Is this a future enhancement? (out of scope, note as future)
       - Are there multiple interpretations? Generate alternatives, recommend one
       - Apply YAGNI: if uncertain, default to out-of-scope with documented rationale

       **If SPEC_MODE = fast:**
       Apply direct YAGNI/KISS reasoning for scope decisions (no multi-option comparison)

    3. Generate all 9 sections in order:

       **## 1. Problem Statement**: Extract from user description — concrete problem, who is affected, why this feature is needed now. If discovery context exists, write a concise PRD problem summary and reference `discovery/problem.md` or `discovery/index.md` instead of copying discovery prose. Without discovery, keep extracting this section directly from user input. Reject vague statements ("improve UX").

       **## 2. Scope Boundary**: In-scope items with rationale, out-of-scope items with YAGNI reasoning. Must have ≥1 in-scope + ≥1 out-of-scope.
       - **Full mode**: Apply embedded brainstorm at every scope decision.
       - **Fast mode**: Direct YAGNI/KISS reasoning without multi-option comparison.

       **## 3. Impact Surface**: Insert IMPACT_SURFACE table from Step 1.5. If monolith: "N/A — monolith project".

       **## 4. Evaluated Approaches**:

       If discovery context exists, summarize the selected MVP boundary and reference `discovery/mvp-scope.md` or `discovery/index.md` instead of restating full discovery rationale. Without discovery, keep the current full/fast mode behavior below.

       **If SPEC_MODE = full:**
       Apply embedded brainstorm technique. 2-3 scope-level options evaluating MVP boundary (what to include vs exclude). **Constraint: scope-level ONLY — no tech/framework/library mentions.** Format:
       ```
       ### Option A: [Approach Name]
       - **Scope**: [what's included/excluded]
       - **Pros**: [benefits]
       - **Cons**: [drawbacks]

       ### Option B: [Approach Name]
       - **Scope**: [what's included/excluded]
       - **Pros**: [benefits]
       - **Cons**: [drawbacks]

       **Recommended**: Option [X] — [rationale grounded in YAGNI/KISS]
       ```

       **If SPEC_MODE = fast:**
       Single recommended scope approach only. **Constraint: scope-level ONLY — no tech/framework/library mentions.** Format:
       ```
       **Recommended scope**: [approach name]
       - **Includes**: [what's in scope]
       - **Excludes**: [what's out]
       - **Rationale**: [brief YAGNI/KISS reasoning]
       ```

       **## 5. User Requirements & Testing**: Same quality as current — P1/P2/P3 prioritization, Independent Test, Given/When/Then acceptance scenarios. Tag each UR with `[subworkspace/module]` from IMPACT_SURFACE (lowercase/slash only, e.g. `[backend/api]`). Skip tags if IMPACT_SURFACE is empty. Include Edge Cases subsection.

       **## 6. Functional Requirements**: FR-001 format, tag with `[subworkspace/module]`. Include Key Entities subsection. No inline [NEEDS CLARIFICATION] markers — move all to ## 9. Unresolved Questions.

       **## 7. Success Criteria**: Measurable, technology-agnostic outcomes. No mention of frameworks, languages, databases. Keep section name "Success Criteria" (no rename).

       **## 8. Risks & Mitigations**: Identify risks from scope decisions, multi-subworkspace coordination, data model complexity. Table format: Risk | Impact | Mitigation.

       **## 9. Unresolved Questions**: Numbered list with `Recommend: [suggestion]` for each. No max limit — agent continues asking until requirements are clear. Write "None" if all clear.

    4. Append `## Clarifications` section at the end (reserved for /tdk-clarify).

    5. Return: SUCCESS (spec ready for planning)

4. Write the specification to SPEC_FILE using the template structure, replacing placeholders with concrete details derived from the feature description (arguments) while preserving section order and headings. Emit the YAML frontmatter block at the top with `title`, `status`, `branch`, `created`, `input`, `memory_context_loaded` (set per Step 0.memory), and `schema_version: 1`; keep the `# Feature Specification: <title>` H1 line directly below the closing `---` (downstream tooling reads the spec title from that H1). **Promote case:** if this spec is being promoted from a parent work-item (the description was seeded from another spec's work-item), also emit `parent_spec: <[folder/]ticket>` (include the category folder when the parent is non-default, e.g. `test/aa-100`) and `promoted_from: "<work-item-id>"`, and confirm the parent spec directory exists before writing the child (advisory — `/tdk-plan` enforces this with a hard STOP). Omit both fields for a root spec. See `.specify/docs/en/promote-convention.md`.

### Step 3: Handle Unresolved Questions

After writing spec, check ## 9. Unresolved Questions:

- If "None": skip to Step 5
- For each question, present via AskUserQuestion with: Context (quote spec section), Question, Suggested Answers (A/B/C table: Option | Answer | Implications), Custom option
- Present all questions together before waiting for responses
- Wait for user to respond with choices
- Update spec ## 9. Unresolved Questions: replace resolved questions with the chosen answer integrated into the relevant section
- Re-check: if new questions arose during resolution, add to ## 9. Unresolved Questions and repeat
- Continue until ## 9. Unresolved Questions reads "None" or user explicitly accepts remaining questions

### Step 5: Specification Quality Validation

After writing the spec and resolving unresolved questions, validate against quality criteria:

   a. **Create Spec Quality Checklist**: Read `references/spec-quality-guidelines.md` → "## Checklist Template" section. Generate checklist at `FEATURE_DIR/checklists/requirements.md` using that template.

   b. **Run Validation Check**: Review the spec against each checklist item:
      - For each item, determine if it passes or fails
      - Document specific issues found (quote relevant spec sections)

   c. **Handle Validation Results**:

      - **If all items pass**: Mark checklist complete and proceed to Step 6

      - **If items fail**:
        1. List the failing items and specific issues
        2. Update the spec to address each issue
        3. Re-run validation until all items pass (max 3 iterations)
        4. If still failing after 3 iterations, document remaining issues in checklist notes and warn user

   d. **Update Checklist**: After each validation iteration, update the checklist file with current pass/fail status

### Step 6: Report Completion

Report completion with:
- Branch name and spec file path
- Checklist results (pass/fail summary)
- Impact Surface summary (N subworkspaces, M modules touched)
- Unresolved Questions count (from ## 9. Unresolved Questions — 0 if all resolved)
- Mode used: `SPEC_MODE` (`MODE_SOURCE`)
- Readiness for next phase (`/tdk-clarify` or `/tdk-plan`)
