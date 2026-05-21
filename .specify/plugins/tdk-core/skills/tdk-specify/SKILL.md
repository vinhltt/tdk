---
name: tdk-specify
description: "Create or update the feature specification from a natural language feature description."
metadata: 
  version: "1.11.1"
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

> Shared base instructions: `.specify/_shared/skills/embedded-brainstorm.md`

### Embedded Brainstorming (Scope Exploration)

**Mode:** Embedded -- reasoning technique only.
**DO NOT** call brainstorm.py. **DO NOT** create separate brainstorm files.
Output goes directly into spec.md.

**When to trigger:** At every scope boundary decision:
- Feature in-scope vs out-of-scope determination
- Requirement inclusion/exclusion when multiple interpretations exist
- "Nice to have" vs "must have" classification

**Technique per scope decision:**
1. Identify what's being considered for inclusion
2. Apply YAGNI analysis: "Is this needed NOW for MVP?"
3. If unclear, generate 2-3 scope boundary options
4. Evaluate: complexity cost vs user value
5. Recommend with YAGNI/KISS rationale
6. Document in spec under Scope section as:
   - In scope: [item] (Rationale: [why included])
   - Out of scope: [item] (Rationale: [YAGNI -- not needed for MVP])

## Boundary Declaration

**This command produces:**
- Feature specification (spec.md)
- Quality validation checklist
- Clarification questions (max 3)

**This command does NOT:**
- Create implementation plans (use /tdk-plan)
- Generate tasks (use /tdk-tasks)
- Write code

## Quality Gates

### Before Writing Spec
- [ ] Feature description provided
- [ ] Task_id validated
- [ ] Project context loaded (if available)

### Before Completion
- [ ] All mandatory sections filled
- [ ] Max 3 NEEDS CLARIFICATION markers
- [ ] Success criteria are measurable
- [ ] No implementation details in spec

## Outline

## Execution Steps

### Step 0 — Validate Task ID
Invoke `tdk-validate-task-id` with `$ARGUMENTS` and host skill name `/tdk-specify`.
If STOP → halt execution.
Store: `TASK_ID`, `TASK_ID_SOURCE`.

### Step 0.1 — Load Project Context
Invoke `tdk-load-project-context` with validated `TASK_ID`.
Store: `PROJECT_CONTEXT`, `FEATURE_DIR`.

### Step 0.2: Check Feature Description

- Extract second argument onwards as description
- If description EMPTY or MISSING:
  ERROR: "Description required. Usage: /tdk-specify {task-id} {description}"
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

### Step 0.memory: Memory Context Pre-load

**Only if `.specify/memory/memory-index.md` exists** (check silently, non-blocking):

1. Invoke `tdk-memory-preload` skill with feature description from `$ARGUMENTS`.
2. If Context Block returned: use it as reference throughout spec writing.
   - Respect all CONSTRAINTS & WARNINGS listed in the Context Block.
   - Note in `spec.md` frontmatter: `memory_context_loaded: true`
3. If memory not initialized or no relevant context: proceed normally.
   - Note in `spec.md` frontmatter: `memory_context_loaded: false`

**This step MUST NOT block or error.** If `tdk-memory-preload` fails for any reason, skip and continue.

### Step 1: Load `.specify/templates/spec-template.md.tpl` to understand required sections.

### Step 2: Follow Specification Generation Flow:

    1. Parse user description from Input
       If empty: ERROR "No feature description provided"
    2. Extract key concepts from description
       Identify: actors, actions, data, constraints
       **Brainstorm Scope Boundaries:**
       For each concept extracted, apply embedded brainstorming:
       - Is this core to the feature? (in scope)
       - Is this a future enhancement? (out of scope, note as future)
       - Are there multiple interpretations? Generate alternatives, recommend one
       - Apply YAGNI: if uncertain, default to out-of-scope with documented rationale
    3. For unclear aspects:
       - Make informed guesses based on context and industry standards
       - Only mark with [NEEDS CLARIFICATION: specific question] if:
         - The choice significantly impacts feature scope or user experience
         - Multiple reasonable interpretations exist with different implications
         - No reasonable default exists
       - When creating a [NEEDS CLARIFICATION] marker, include brief alternatives analysis:
         `[NEEDS CLARIFICATION: <question> | Options: A (<pros>), B (<pros>) | YAGNI note: <if applicable>]`
       - **LIMIT: Maximum 3 [NEEDS CLARIFICATION] markers total**
       - Prioritize clarifications by impact: scope > security/privacy > user experience > technical details
    4. Fill User Scenarios & Testing section
       If no clear user flow: ERROR "Cannot determine user scenarios"
    5. Generate Functional Requirements
       Each requirement must be testable
       Use reasonable defaults for unspecified details (document assumptions in Assumptions section)
    6. Define Success Criteria
       Create measurable, technology-agnostic outcomes
       Include both quantitative metrics (time, performance, volume) and qualitative measures (user satisfaction, task completion)
       Each criterion must be verifiable without implementation details
    7. Identify Key Entities (if data involved)
    8. Return: SUCCESS (spec ready for planning)

4. Write the specification to SPEC_FILE using the template structure, replacing placeholders with concrete details derived from the feature description (arguments) while preserving section order and headings.

5. **Specification Quality Validation**: After writing the initial spec, validate it against quality criteria:

   a. **Create Spec Quality Checklist**: Generate a checklist file at `FEATURE_DIR/checklists/requirements.md` using the checklist template structure with these validation items:

      ```markdown
      # Specification Quality Checklist: [FEATURE NAME]
      
      **Purpose**: Validate specification completeness and quality before proceeding to planning
      **Created**: [DATE]
      **Feature**: [Link to spec.md]
      
      ## Content Quality
      
      - [ ] No implementation details (languages, frameworks, APIs)
      - [ ] Focused on user value and business needs
      - [ ] Written for non-technical stakeholders
      - [ ] All mandatory sections completed
      
      ## Requirement Completeness
      
      - [ ] No [NEEDS CLARIFICATION] markers remain
      - [ ] Requirements are testable and unambiguous
      - [ ] Success criteria are measurable
      - [ ] Success criteria are technology-agnostic (no implementation details)
      - [ ] All acceptance scenarios are defined
      - [ ] Edge cases are identified
      - [ ] Scope is clearly bounded
      - [ ] Dependencies and assumptions identified
      
      ## Feature Readiness
      
      - [ ] All functional requirements have clear acceptance criteria
      - [ ] User scenarios cover primary flows
      - [ ] Feature meets measurable outcomes defined in Success Criteria
      - [ ] No implementation details leak into specification
      
      ## Notes
      
      - Items marked incomplete require spec updates before `/tdk-clarify` or `/tdk-plan`
      ```

   b. **Run Validation Check**: Review the spec against each checklist item:
      - For each item, determine if it passes or fails
      - Document specific issues found (quote relevant spec sections)

   c. **Handle Validation Results**:

      - **If all items pass**: Mark checklist complete and proceed to step 6

      - **If items fail (excluding [NEEDS CLARIFICATION])**:
        1. List the failing items and specific issues
        2. Update the spec to address each issue
        3. Re-run validation until all items pass (max 3 iterations)
        4. If still failing after 3 iterations, document remaining issues in checklist notes and warn user

      - **If [NEEDS CLARIFICATION] markers remain**:
        1. Extract all [NEEDS CLARIFICATION: ...] markers from the spec
        2. **LIMIT CHECK**: If more than 3 markers exist, keep only the 3 most critical (by scope/security/UX impact) and make informed guesses for the rest
        3. For each clarification needed (max 3), present options to user in this format:

           ```markdown
           ## Question [N]: [Topic]
           
           **Context**: [Quote relevant spec section]
           
           **What we need to know**: [Specific question from NEEDS CLARIFICATION marker]
           
           **Suggested Answers**:
           
           | Option | Answer | Implications |
           |--------|--------|--------------|
           | A      | [First suggested answer] | [What this means for the feature] |
           | B      | [Second suggested answer] | [What this means for the feature] |
           | C      | [Third suggested answer] | [What this means for the feature] |
           | Custom | Provide your own answer | [Explain how to provide custom input] |
           
           **Your choice**: _[Wait for user response]_
           ```

        4. **CRITICAL - Table Formatting**: Ensure markdown tables are properly formatted:
           - Use consistent spacing with pipes aligned
           - Each cell should have spaces around content: `| Content |` not `|Content|`
           - Header separator must have at least 3 dashes: `|--------|`
           - Test that the table renders correctly in markdown preview
        5. Number questions sequentially (Q1, Q2, Q3 - max 3 total)
        6. Present all questions together before waiting for responses
        7. Wait for user to respond with their choices for all questions (e.g., "Q1: A, Q2: Custom - [details], Q3: B")
        8. Update the spec by replacing each [NEEDS CLARIFICATION] marker with the user's selected or provided answer
        9. Re-run validation after all clarifications are resolved

   d. **Update Checklist**: After each validation iteration, update the checklist file with current pass/fail status

6. Report completion with branch name, spec file path, checklist results, and readiness for the next phase (`/tdk-clarify` or `/tdk-plan`).

**NOTE:** The script creates and checks out the new branch and initializes the spec file before writing.

## General Guidelines

## Quick Guidelines

- Focus on **WHAT** users need and **WHY**.
- Avoid HOW to implement (no tech stack, APIs, code structure).
- Written for business stakeholders, not developers.
- DO NOT create any checklists that are embedded in the spec. That will be a separate command.

### Section Requirements

- **Mandatory sections**: Must be completed for every feature
- **Optional sections**: Include only when relevant to the feature
- When a section doesn't apply, remove it entirely (don't leave as "N/A")

### For AI Generation

When creating this spec from a user prompt:

1. **Make informed guesses**: Use context, industry standards, and common patterns to fill gaps
2. **Document assumptions**: Record reasonable defaults in the Assumptions section
3. **Limit clarifications**: Maximum 3 [NEEDS CLARIFICATION] markers - use only for critical decisions that:
   - Significantly impact feature scope or user experience
   - Have multiple reasonable interpretations with different implications
   - Lack any reasonable default
4. **Prioritize clarifications**: scope > security/privacy > user experience > technical details
5. **Think like a tester**: Every vague requirement should fail the "testable and unambiguous" checklist item
6. **Common areas needing clarification** (only if no reasonable default exists):
   - Feature scope and boundaries (include/exclude specific use cases)
   - User types and permissions (if multiple conflicting interpretations possible)
   - Security/compliance requirements (when legally/financially significant)

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
