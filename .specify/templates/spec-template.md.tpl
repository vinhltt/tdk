---
title: "[FEATURE NAME]"
status: Draft
branch: "[FEATURE NAME]"
created: "[DATE]"
input: 'User description: "$ARGUMENTS"'
memory_context_loaded: [true/false]
schema_version: 1
# Optional promote-link fields — omit entirely for a root spec. Set only when this
# spec was promoted from a parent work-item (see .specify/docs/en/promote-convention.md):
#   parent_spec: <[folder/]ticket>   # canonical link to the parent spec; include the category folder when non-default (e.g. test/aa-100)
#   promoted_from: "<work-item-id>"  # the parent work-item id this child was promoted from
---
# Feature Specification: [FEATURE NAME]

<!--
  Product-wide durable facts belong in constitution and memory v3 typed routes.
  Use arc42 summaries only as read-model context; binding facts live in typed memory.
  Discovery is epic context.
  Spec is the PRD and requirement-ID source of truth.
-->

## 1. Problem Statement *(mandatory)*

<!--
  Describe the CONCRETE problem this feature solves.
  - Who is affected? (specific actors/roles)
  - What is the current pain point?
  - Why does this feature need to exist now?
  When discovery exists, summarize the problem and point to `discovery/problem.md` or `discovery/index.md`.
  Avoid vague statements like "improve UX" or "make it better."
-->

[Concrete problem description: who is affected, what pain point exists, why this feature is needed]

## 2. Scope Boundary *(mandatory)*

<!--
  Every item must have a rationale.
  Apply YAGNI: if uncertain, default to out-of-scope with documented reasoning.
-->

**In scope:**
- [Item] (Rationale: [why included for MVP])
- [Item] (Rationale: [why included for MVP])

**Out of scope:**
- [Item] (YAGNI: [why not needed for MVP])
- [Item] (YAGNI: [why not needed for MVP])

## 3. Impact Surface *(mandatory)*

<!--
  Auto-detected from .specify.json subWorkspaces and modules.
  Confirm or edit before proceeding.
  If monolith project with no subWorkspaces/modules: "N/A — monolith project"
-->

| Subworkspace | Module | Impact Type | Description |
|---|---|---|---|
| [subworkspace] | [module] | [create/modify/extend] | [brief description] |

## 4. Evaluated Approaches *(recommended)*

<!--
  Scope-level options ONLY. No implementation details, no tech/framework/library mentions.
  Evaluate MVP boundary: what to include vs exclude.
  When discovery exists, summarize the selected MVP boundary and point to `discovery/mvp-scope.md` or `discovery/index.md`.
-->

### Option A: [Approach Name]
- **Scope**: [what's included/excluded]
- **Pros**: [benefits]
- **Cons**: [drawbacks]

### Option B: [Approach Name]
- **Scope**: [what's included/excluded]
- **Pros**: [benefits]
- **Cons**: [drawbacks]

**Recommended**: Option [X] — [rationale grounded in YAGNI/KISS]

## 5. User Requirements & Testing *(mandatory)*

<!--
  User stories MUST be PRIORITIZED as user journeys ordered by importance.
  Each story must be INDEPENDENTLY TESTABLE — implement just ONE and still have a viable MVP.
  Tag each story with [subworkspace/module] from Impact Surface (lowercase/slash only).
  If monolith with no modules: omit tags.
-->

### UR-1: [Title] (P1) `[subworkspace/module]`
[Description]
**Why this priority**: [rationale]
**Independent Test**: [how to verify in isolation]
**Acceptance Scenarios**:
1. **Given** [state], **When** [action], **Then** [outcome]

[Add more user requirements as needed, each with assigned priority and [subworkspace/module] tag]

### Edge Cases

- What happens when [boundary condition]?
- How does system handle [error scenario]?

## 6. Functional Requirements *(mandatory)*

<!--
  Tag each FR with [subworkspace/module] from Impact Surface (lowercase/slash only).
  If monolith with no modules: omit tags.
  Requirements must be testable and unambiguous.
-->

- **FR-001** `[subworkspace/module]`: System MUST [capability]
- **FR-002** `[subworkspace/module]`: UI MUST [capability]

### Key Entities *(include if feature involves data)*

- **[Entity 1]**: [What it represents, key attributes without implementation]
- **[Entity 2]**: [What it represents, relationships to other entities]

## 7. Success Criteria *(mandatory)*

<!--
  Measurable, technology-agnostic outcomes.
  No mention of frameworks, languages, databases, or tools.
  Describe from user/business perspective, not system internals.
-->

- **SC-001**: [Measurable, tech-agnostic outcome]
- **SC-002**: [Quantitative metric]

## 8. Risks & Mitigations *(recommended)*

| Risk | Impact | Mitigation |
|---|---|---|
| [Risk description] | [High/Medium/Low] | [Mitigation strategy] |
| [Risk description] | [High/Medium/Low] | [Mitigation strategy] |

## 9. Unresolved Questions *(mandatory)*

<!--
  Migrate all unclear requirements here (no inline [NEEDS CLARIFICATION] markers in other sections).
  No limit on number of questions — agent asks until requirements are clear.
  Each question must include a recommendation.
-->

1. [Question about unclear requirement] — Recommend: [suggestion]
2. [Question about unclear requirement] — Recommend: [suggestion]

*(Write "None" if all requirements are clear)*

## Clarifications

<!-- Reserved for /tdk-clarify sessions. Do not remove this section. -->
