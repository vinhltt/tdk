# Output Standards & Quality

## Plan File Format

### YAML Frontmatter (Required for plan.md)

All `plan.md` files MUST include YAML frontmatter:

```yaml
---
title: "{Brief plan title}"
description: "{One-sentence summary}"
status: pending  # pending | in-progress | completed | cancelled
priority: P2     # P1 (High) | P2 (Medium) | P3 (Low)
effort: 4h       # Estimated total effort
issue: 74        # GitHub issue number (if applicable)
branch: {feature-name}
tags: [frontend, api]
created: 2025-12-16
---
```

### Auto-Population Rules

When creating plans, auto-populate:
- **title**: Extract from task description
- **description**: First sentence of Overview
- **status**: Always `pending` for new plans
- **priority**: From user request or default `P2`
- **effort**: Sum of phase estimates
- **tags**: Infer from task keywords (frontend, backend, api, auth)
- **created**: Today's date in YYYY-MM-DD format

### Tag Vocabulary

Use these predefined tags:
- **Type**: `feature`, `bugfix`, `refactor`, `docs`, `infra`
- **Domain**: `frontend`, `backend`, `database`, `api`, `auth`
- **Scope**: `critical`, `tech-debt`, `experimental`

## Task Breakdown

- Transform complex requirements into manageable, actionable tasks
- Each task independently executable with clear dependencies
- Prioritize by dependencies, risk, business value
- Eliminate ambiguity in instructions
- Include specific file paths for all modifications
- Provide clear acceptance criteria per task

### File Management

List affected files with:
- Full paths (not relative)
- Action type (modify/create/delete)
- Brief change description
- Dependencies on other changes

## Plan Structure

### Overview Plan (plan.md)

**SpecKit Format:**

```markdown
---
title: "Feature Implementation Plan"
description: "Add user authentication with OAuth2 support"
status: pending
priority: P1
effort: 8h
issue: 123
branch: feat/oauth-auth
tags: [auth, backend, security]
created: 2025-12-16
---

# Feature Implementation Plan

## Summary
Brief description of what this plan accomplishes, extracted from spec.md and research findings.

## Technical Context
- **Language/Version**: Python 3.11
- **Primary Dependencies**: FastAPI, SQLAlchemy
- **Storage**: PostgreSQL
- **Testing**: pytest
- **Performance Goals**: <200ms p95 latency
- **Constraints**: Must support 1000 concurrent users

## Constitution Check
[Gates determined from .specify/memory/constitution.md]

## Phase 0: Research
Summary of key decisions from research.md:
- Approach: OAuth2 with JWT tokens
- Rationale: Industry standard, good library support
- Alternatives rejected: Session-based (doesn't scale), custom auth (security risk)

See: [research.md](./research.md)

## Phase 1: Design
Artifacts generated:
- [data-model.md](./data-model.md) - User, Token entities
- [contracts/](./contracts/) - Auth endpoints
- [quickstart.md](./quickstart.md) - Integration scenarios

## Dependencies
- PostgreSQL 14+
- Redis for token caching
- OIDC provider configuration

## Risks
- Token expiry handling complexity
- Multi-device session management
- Rate limiting implementation

## Next Steps
Run `/tdk-implement-from-plan {task-id}` to begin implementation from the plan.md ## Phases table. (Use `/tdk-plan {task-id}` to view/update the ## Phases table. `/tdk-tasks` is [deprecated].)
```

**Guidelines:**
- Keep concise, under 100 lines
- Summarize research + design, do NOT create implementation steps
- Link to detailed artifacts (research.md, data-model.md, contracts/)
- Guide user to `/tdk-implement-from-plan` for implementation from plan.md ## Phases table (`/tdk-tasks` [deprecated])

### Phase Tracking (plan.md ## Phases — Primary SoT)

**Important:** SpecKit uses `plan.md ## Phases` table for phase/task tracking. `phase-XX-name.md` files and `tasks.md` are not used in SpecKit.

Artifacts:
- Research findings → `research.md`
- Design artifacts → `data-model.md`, `contracts/`, `quickstart.md`
- Task/phase tracking → `plan.md ## Phases` table (primary SoT)
- `tasks.md` [deprecated] — legacy task breakdown created by `/tdk-tasks` ([deprecated])

The SpecKit workflow:
1. `/tdk-plan` creates research + design artifacts and the `plan.md ## Phases` table
2. `/tdk-implement-from-plan` executes phases from the plan.md ## Phases table

## Writing Style

**IMPORTANT:** Sacrifice grammar for concision
- Focus clarity over eloquence
- Use bullets and lists
- Short sentences
- Remove unnecessary words
- Prioritize actionable info

## Quality Checklist

Before finalizing plan:
- [ ] All phases have success criteria
- [ ] File paths are specific and complete
- [ ] Dependencies are documented
- [ ] Security concerns addressed
- [ ] Performance implications noted
- [ ] Edge cases considered
- [ ] No unresolved questions (or listed at end)
