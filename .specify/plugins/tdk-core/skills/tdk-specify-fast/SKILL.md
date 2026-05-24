---
name: tdk-specify-fast
description: "Quick feature specification without brainstorm enrichment. Same workflow as /tdk-specify but skips embedded brainstorming for faster, lower-token spec generation."
metadata: 
  version: "3.0.0"
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

<!-- from: .claude/skills/common/references/principles.md -->
### Core Principles

**YAGNI (You Aren't Gonna Need It)**
- Implement only what is explicitly required
- No speculative features
- Question every addition: "Is this needed NOW?"

**KISS (Keep It Simple, Stupid)**
- Prefer simple solutions over clever ones
- Break complex tasks into smaller steps
- Avoid premature optimization

**DRY (Don't Repeat Yourself)**
- Extract common patterns into reusable components
- Reference existing solutions before creating new
- Maintain single source of truth

<!-- from: .claude/skills/planning/SKILL.md -->
### Planning Framework

**Purpose:** Transform requirements into actionable implementation plans.
**Boundary:** This skill produces PLANS only. No code implementation.
**Be honest, brutal, straight to the point, and concise.**

**Workflow:**
1. Research - Gather context, resolve unknowns (use @workspace, gh, repomix)
2. Design - Architecture decisions, data models, trade-offs
3. Decompose - Break into phases with clear deliverables
4. Document - Create plan files with success criteria

**Subagent Delegation:** Delegate → output to file → user continues manually → main agent reads output.

**Note:** Embedded brainstorm is NOT used in the fast variant. Scope decisions use direct YAGNI/KISS reasoning without multi-option comparison.

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

## Outline

## Execution Steps

### Step 0 — Validate Task ID
Invoke `tdk-validate-task-id` with `$ARGUMENTS` and host skill name `/tdk-specify-fast`.
If STOP → halt execution.
Store: `TASK_ID`, `TASK_ID_SOURCE`.

### Step 0.1 — Load Project Context
Invoke `tdk-load-project-context` with validated `TASK_ID`.
Store: `PROJECT_CONTEXT`, `FEATURE_DIR`.

### Step 0.2: Check Feature Description

- Extract second argument onwards as description
- If description EMPTY or MISSING:
  ERROR: "Description required. Usage: /tdk-specify-fast {task-id} {description}"
- Proceed to Execute Script (step 6)

After completion, proceed to next step with validated task_id and PROJECT_CONTEXT.

6. **Execute Script**:
   ```bash
   cd $CLAUDE_PROJECT_DIR/.specify/scripts/ts && bun src/commands/feature/create-new-feature.ts <task-id> <description>
   ```

   Script operations (automatic):
   - Validates task ID format (parse_ticket_id)
   - Converts to lowercase (case-insensitive)
   - Checks for duplicate task IDs
   - **Warns if current branch doesn't match expected** (non-blocking)
   - Creates feature directory: `.specify/{folder}/{task-id}/`
   - Copies spec template to: `.specify/{folder}/{task-id}/spec.md`
   - Returns JSON: `TASK_ID`, `EXPECTED_BRANCH`, `CURRENT_BRANCH`, `SPEC_FILE`

7. **Process Script Output**:
   - Parse JSON output from script
   - Extract `SPEC_FILE` path for AI processing
   - Note: Branch mismatch warning (if any) is informational only
   - If script fails → ERROR with script output, STOP

**After Validation**:
- Proceed to load spec template
- Use `SPEC_FILE` path to write specification

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

### Step 2: Specification Generation (9-Section Format — Fast Variant)

    1. Parse user description from Input
       If empty: ERROR "No feature description provided"
    2. Extract key concepts from description
       Identify: actors, actions, data, constraints
       Apply direct YAGNI/KISS reasoning for scope decisions (no embedded brainstorm technique)
    3. Generate all 9 sections in order:

       **## 1. Problem Statement**: Extract from user description — concrete problem, who is affected, why this feature is needed now. Reject vague statements ("improve UX").

       **## 2. Scope Boundary**: In-scope items with rationale, out-of-scope items with YAGNI reasoning. Must have ≥1 in-scope + ≥1 out-of-scope.

       **## 3. Impact Surface**: Insert IMPACT_SURFACE table from Step 1.5. If monolith: "N/A — monolith project".

       **## 4. Evaluated Approaches**: Single recommended scope approach only. Format:
       ```
       ## 4. Evaluated Approaches
       **Recommended scope**: [approach name]
       - **Includes**: [what's in scope]
       - **Excludes**: [what's out]
       - **Rationale**: [brief YAGNI/KISS reasoning]
       ```
       No Option A/B comparison. **Constraint: scope-level ONLY — no tech/framework/library mentions.**

       **## 5. User Requirements & Testing**: P1/P2/P3 prioritization, Independent Test, Given/When/Then acceptance scenarios. Tag each UR with `[subworkspace/module]` from IMPACT_SURFACE (lowercase/slash only, e.g. `[backend/api]`). Skip tags if IMPACT_SURFACE is empty. Include Edge Cases subsection.

       **## 6. Functional Requirements**: FR-001 format, tag with `[subworkspace/module]`. Include Key Entities subsection. No inline [NEEDS CLARIFICATION] markers — move all to ## 9. Unresolved Questions.

       **## 7. Success Criteria**: Measurable, technology-agnostic outcomes. No mention of frameworks, languages, databases. Keep section name "Success Criteria" (no rename).

       **## 8. Risks & Mitigations**: Identify risks from scope decisions, multi-subworkspace coordination, data model complexity. Table format: Risk | Impact | Mitigation.

       **## 9. Unresolved Questions**: Numbered list with `Recommend: [suggestion]` for each. No max limit — agent continues asking until requirements are clear. Write "None" if all clear.

    4. Append `## Clarifications` section at the end (reserved for /tdk-clarify).

    5. Return: SUCCESS (spec ready for planning)

4. Write the specification to SPEC_FILE using the template structure, replacing placeholders with concrete details derived from the feature description (arguments) while preserving section order and headings.

### Step 3: Handle Unresolved Questions

After writing spec, check ## 9. Unresolved Questions:

- If "None": skip to Step 5
- For each unresolved question, present options to user via AskUserQuestion:

  ```markdown
  ## Question [N]: [Topic]
  
  **Context**: [Quote relevant spec section]
  
  **What we need to know**: [Specific question]
  
  **Suggested Answers**:
  
  | Option | Answer | Implications |
  |--------|--------|--------------|
  | A      | [First suggested answer] | [What this means for the feature] |
  | B      | [Second suggested answer] | [What this means for the feature] |
  | C      | [Third suggested answer] | [What this means for the feature] |
  | Custom | Provide your own answer | [Explain how to provide custom input] |
  
  **Your choice**: _[Wait for user response]_
  ```

- **CRITICAL - Table Formatting**: Ensure markdown tables are properly formatted:
  - Use consistent spacing with pipes aligned
  - Each cell should have spaces around content: `| Content |` not `|Content|`
  - Header separator must have at least 3 dashes: `|--------|`
- Present all questions together before waiting for responses
- Wait for user to respond with choices
- Update spec ## 9. Unresolved Questions: replace resolved questions with the chosen answer integrated into the relevant section
- Re-check: if new questions arose during resolution, add to ## 9. Unresolved Questions and repeat
- Continue until ## 9. Unresolved Questions reads "None" or user explicitly accepts remaining questions

### Step 5: Specification Quality Validation

After writing the spec and resolving unresolved questions, validate against quality criteria:

   a. **Create Spec Quality Checklist**: Generate a checklist file at `FEATURE_DIR/checklists/requirements.md`:

      ```markdown
      # Specification Quality Checklist: [FEATURE NAME]
      
      **Purpose**: Validate specification completeness and quality before proceeding to planning
      **Created**: [DATE]
      **Feature**: [Link to spec.md]
      
      ## Structure Completeness
      
      - [ ] ## 1. Problem Statement is concrete (not vague "improve X")
      - [ ] ## 2. Scope Boundary has ≥1 in-scope + ≥1 out-of-scope item
      - [ ] ## 3. Impact Surface has ≥1 row (unless monolith with no modules)
      - [ ] ## 4. Evaluated Approaches is scope-level only (reject tech/framework mentions)
      - [ ] ## 7. Success Criteria are measurable and technology-agnostic
      - [ ] ## 8. Risks & Mitigations has ≥1 entry
      - [ ] ## 9. Unresolved Questions is "None" or numbered list
      - [ ] ## Clarifications section exists at end
      
      ## Tagging & Cross-references (conditional — skip if IMPACT_SURFACE is empty)
      
      - [ ] Every UR tagged with [sw/module] matching Impact Surface
      - [ ] Every FR tagged with [sw/module] matching Impact Surface
      
      ## Content Quality
      
      - [ ] No implementation details (languages, frameworks, APIs)
      - [ ] Focused on user value and business needs
      - [ ] Written for non-technical stakeholders
      - [ ] All mandatory sections completed
      
      ## Requirement Completeness
      
      - [ ] No inline [NEEDS CLARIFICATION] markers remain (all in ## 9. Unresolved Questions)
      - [ ] Requirements are testable and unambiguous
      - [ ] All acceptance scenarios defined (Given/When/Then)
      - [ ] Edge cases identified
      - [ ] Scope is clearly bounded (## 2. Scope Boundary)
      
      ## Notes
      
      - Items marked incomplete require spec updates before `/tdk-clarify` or `/tdk-plan`
      ```

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
- Readiness for next phase (`/tdk-clarify` or `/tdk-plan`)

**NOTE:** The script creates and checks out the new branch and initializes the spec file before writing.

## General Guidelines

## Quick Guidelines

- Focus on **WHAT** users need and **WHY**.
- Avoid HOW to implement (no tech stack, APIs, code structure).
- Written for business stakeholders, not developers.
- DO NOT create any checklists that are embedded in the spec. That will be a separate command.

### Section Requirements

- **Mandatory sections**: ## 1. Problem Statement, ## 2. Scope Boundary, ## 3. Impact Surface, ## 5. User Requirements & Testing, ## 6. Functional Requirements, ## 7. Success Criteria, ## 9. Unresolved Questions — must be completed for every feature
- **Recommended sections**: ## 4. Evaluated Approaches, ## 8. Risks & Mitigations — include when relevant; mark N/A only when genuinely not applicable
- **Reserved section**: Clarifications — always present, never remove

### For AI Generation

When creating this spec from a user prompt:

1. **Make informed guesses**: Use context, industry standards, and common patterns to fill gaps
2. **Document assumptions**: Record reasonable defaults in the Scope Boundary section
3. **No inline clarification markers**: All unresolved questions go to ## 9. Unresolved Questions — no [NEEDS CLARIFICATION] markers in other sections
4. **Prioritize questions**: scope > security/privacy > user experience > technical details
5. **Think like a tester**: Every vague requirement should fail the "testable and unambiguous" checklist item
6. **Tag format**: `[subworkspace/module]` — lowercase/slash only (e.g. `[backend/api]`). Must match names in .specify.json

**Examples of reasonable defaults** (don't ask about these):

- Data retention: Industry-standard practices for the domain
- Performance targets: Standard web/mobile app expectations unless specified
- Error handling: User-friendly messages with appropriate fallbacks
- Authentication method: Standard session-based or OAuth2 for web apps
- Integration patterns: RESTful APIs unless specified otherwise

### Success Criteria Guidelines

Success criteria must be:

1. **Measurable**: Include specific metrics (time, percentage, count, rate)
2. **Technology-agnostic**: No mention of frameworks, languages, databases, or tools
3. **User-focused**: Describe outcomes from user/business perspective, not system internals
4. **Verifiable**: Can be tested/validated without knowing implementation details

**Good examples**:

- "Users can complete checkout in under 3 minutes"
- "System supports 10,000 concurrent users"
- "95% of searches return results in under 1 second"
- "Task completion rate improves by 40%"

**Bad examples** (implementation-focused):

- "API response time is under 200ms" (too technical, use "Users see results instantly")
- "Database can handle 1000 TPS" (implementation detail, use user-facing metric)
- "React components render efficiently" (framework-specific)
- "Redis cache hit rate above 80%" (technology-specific)
