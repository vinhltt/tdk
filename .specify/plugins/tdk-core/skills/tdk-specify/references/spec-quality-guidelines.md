# Spec Quality Guidelines

## Quick Guidelines

- Focus on **WHAT** users need and **WHY**.
- Avoid HOW to implement (no tech stack, APIs, code structure).
- Written for business stakeholders, not developers.
- Persist requirement-quality results in the embedded
  `## Specification Quality Gate`; do not create a standalone checklist for a
  new spec.

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

## Specification Quality Gate

Use the existing checklist dimensions below as an internal validation rubric.
Persist only this compact block in `spec.md`, after `## 9. Unresolved Questions`
and before `## Clarifications`:

```markdown
## Specification Quality Gate

| Field | Value |
|---|---|
| Status | pass |
| Iterations | 1 |
| Source | tdk-specify |
| Last Checked | YYYY-MM-DD HH:mm |

### Blocking Issues

None.
```

Allowed status values: `pass`, `warn`, `fail`. `warn` is valid only when
`Blocking Issues` is `None.`. Iterations must be `0-3`. Source is
`tdk-specify` or `tdk-clarify`.

Validation dimensions: structure completeness, Impact Surface tag alignment,
content quality, requirement testability, acceptance scenarios, edge cases,
scope boundaries, unresolved-question placement, and measurable
technology-agnostic success criteria.

Legacy compatibility: an existing `checklists/requirements.md` remains a
read-only fallback when a legacy spec has no embedded gate. New workflows do
not create or update that file.
