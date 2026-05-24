# Spec Writing Principles

## Core Principles

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

## Planning Framework

**Purpose:** Transform requirements into actionable implementation plans.
**Boundary:** This skill produces PLANS only. No code implementation.
**Be honest, brutal, straight to the point, and concise.**

**Workflow:**
1. Research - Gather context, resolve unknowns (use @workspace, gh, repomix)
2. Design - Architecture decisions, data models, trade-offs
3. Decompose - Break into phases with clear deliverables
4. Document - Create plan files with success criteria

**Subagent Delegation:** Delegate -> output to file -> user continues manually -> main agent reads output.

> Shared base instructions: `.specify/_shared/skills/embedded-brainstorm.md`

## Embedded Brainstorming (Scope Exploration) -- Full Mode Only

**Applies when:** SPEC_MODE = full
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

**Note:** Embedded brainstorm is NOT used in fast mode. Scope decisions use direct YAGNI/KISS reasoning without multi-option comparison.
