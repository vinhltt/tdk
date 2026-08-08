# Signal Target Routing

Use this table to classify feedback signals into update targets.

## Technical Targets

| ID | Target | Use When |
|---|---|---|
| T1 | `CLAUDE.md` | Agent behavior rule applies across the project. |
| T2 | `.claude/rules/*.md` | Workspace rule needs refinement. |
| T3 | `.specify/configurations/**/*.md` | TDK configuration or hook guidance is stale. |
| T4 | Consumer `.claude/skills/*-ut/SKILL.md` or `*-test/SKILL.md` | Test convention or implementation rule belongs to the consumer project. |
| T5 | `delegate-routing.md` or routing template | Skill routing selected the wrong specialist. |
| T6 | User skill `SKILL.md` | A reusable user-facing skill needs behavior guidance. |

## Knowledge Targets

| ID | Target | Use When |
|---|---|---|
| K1 | `.specify/memory/domains/` | Business rule, service, flow, screen, or data model knowledge is missing or stale. |
| K2 | `.specify/memory/memory-index.md` | Domain routing or memory index is missing or stale. |

## Routing Rules

| Signal Pattern | Root Cause | Target |
|---|---|---|
| Repeated coding mistake | Behavior rule missing | T1 or T2 |
| Wrong code or test pattern | Convention missing | T4 or T6 |
| Wrong skill routed | Routing mismatch | T5 |
| Business rule discovered mid-implementation | Memory incomplete | K1 |
| Data model changed mid-implementation | Memory stale | K1 and K2 |
| Spec ambiguity caused rework | Missing domain context | K1 |
| Framework or hook quirk discovered | Configuration undocumented | T3 and optionally T4 |

## Selection Rules

- Prefer the narrowest target that will prevent recurrence.
- Prefer consumer-owned test skills for consumer-specific test conventions.
- Do not propose memory targets if memory is not initialized; mark the entry `blocked`.
- Do not propose direct edits to `.specify/memory/`; `/tdk-memory-update` owns memory writes.
