# Spec Quality Guidelines

## Quick Guidelines

- Focus on **WHAT** users need and **WHY**.
- Avoid HOW to implement (no tech stack, APIs, code structure).
- Written for business stakeholders, not developers.
- DO NOT create any checklists that are embedded in the spec. That will be a separate command.

## Section Requirements

- **Mandatory sections**: ## 1. Problem Statement, ## 2. Scope Boundary, ## 3. Impact Surface, ## 5. User Requirements & Testing, ## 6. Functional Requirements, ## 7. Success Criteria, ## 9. Unresolved Questions -- must be completed for every feature
- **Recommended sections**: ## 4. Evaluated Approaches, ## 8. Risks & Mitigations -- include when relevant; mark N/A only when genuinely not applicable
- **Reserved section**: Clarifications -- always present, never remove

## For AI Generation

When creating this spec from a user prompt:

1. **Make informed guesses**: Use context, industry standards, and common patterns to fill gaps
2. **Document assumptions**: Record reasonable defaults in the Scope Boundary section
3. **No inline clarification markers**: All unresolved questions go to ## 9. Unresolved Questions -- no [NEEDS CLARIFICATION] markers in other sections
4. **Prioritize questions**: scope > security/privacy > user experience > technical details
5. **Think like a tester**: Every vague requirement should fail the "testable and unambiguous" checklist item
6. **Tag format**: `[subworkspace/module]` -- lowercase/slash only (e.g. `[backend/api]`). Must match names in .specify.json

**Examples of reasonable defaults** (don't ask about these):

- Data retention: Industry-standard practices for the domain
- Performance targets: Standard web/mobile app expectations unless specified
- Error handling: User-friendly messages with appropriate fallbacks
- Authentication method: Standard session-based or OAuth2 for web apps
- Integration patterns: RESTful APIs unless specified otherwise

## Success Criteria Guidelines

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

## Checklist Template

Use this template for `FEATURE_DIR/checklists/requirements.md`:

```markdown
# Specification Quality Checklist: [FEATURE NAME]

**Purpose**: Validate specification completeness and quality before proceeding to planning
**Created**: [DATE]
**Feature**: [Link to spec.md]

## Structure Completeness

- [ ] ## 1. Problem Statement is concrete (not vague "improve X")
- [ ] ## 2. Scope Boundary has >=1 in-scope + >=1 out-of-scope item
- [ ] ## 3. Impact Surface has >=1 row (unless monolith with no modules)
- [ ] ## 4. Evaluated Approaches is scope-level only (reject tech/framework mentions)
- [ ] ## 7. Success Criteria are measurable and technology-agnostic
- [ ] ## 8. Risks & Mitigations has >=1 entry
- [ ] ## 9. Unresolved Questions is "None" or numbered list
- [ ] ## Clarifications section exists at end

## Tagging & Cross-references (conditional -- skip if IMPACT_SURFACE is empty)

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
