# Signal Target Routing

Use this table to classify feedback signals into update targets.

## Technical Targets

| ID | Target | Use When |
|---|---|---|
| T1 | `CLAUDE.md` | Agent behavior rule applies across the project. |
| T2 | `.claude/rules/*.md` | Workspace rule needs refinement. |
| T3 | `.specify/configurations/**/*.md` | TDK configuration or hook guidance is stale. |
| T4 | Consumer test skill resolved by `consumer-skill-discovery.md` (`.claude/skills/<name>/SKILL.md`) | Test convention or implementation rule belongs to the consumer project. |
| T5 | `delegate-routing.md` or routing template | Skill routing selected the wrong specialist. |
| T6 | User skill `SKILL.md` | A reusable user-facing skill needs behavior guidance. |

## Knowledge Targets

| ID | Target | Use When |
|---|---|---|
| K1 | `domains/` under the memory root | Business rule, service, flow, screen, or data model knowledge is missing or stale. |
| K2 | Memory index under the memory root | Domain routing or memory index is missing or stale. |

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
| Routed agent followed the wrong practice | Toolset guidance missing | T4 when the agent's toolset skill is a routed test skill, else T6 on that toolset skill |
| Routed agent's contract is wrong (tools, skills, model, write set, `Status:` or output contract) | Agent contract stale | T3 on the recommendation that owns the agent |
| Agent-only route (`skills: []`) needs behavior guidance | No toolset skill to carry it | T3 on the recommendation that owns the agent, to add a toolset skill |

## Selection Rules

- Prefer the narrowest target that will prevent recurrence.
- Prefer consumer-owned test skills for consumer-specific test conventions.
- A test convention with no T4 candidate gets no entry: never move it to T6 on a test-like skill or on a phase delegate outside the test route, because that bypasses the route. The test-like warning, when it applies, is the outcome.
- Never target `.claude/agents/*.md`, `.omp/**`, or `.specify/plugins/**`. An agent changes only through its recommendation and `/tdk-scaffold-from-recommendation`, because scaffold owns the agent contract. A `manual:` blocked entry below may name the agent file as `target_path`; apply never edits it.
- An agent's toolset skills are the `skills:` list in its `.claude/agents/<name>.md` frontmatter. An agent with no `skills:` list is treated as an agent-only route. A toolset skill is a T4 or T6 target only when `.claude/skills/<name>/SKILL.md` exists and is not TDK-managed (`consumer-skill-discovery.md`, TDK-Managed Skills). With several such skills, target the one whose text the lesson corrects and list the others in `evidence`. With none, treat the agent as an agent-only route.
- The recommendation that owns an agent is `.specify/configurations/automation-recommendations/sub-workspaces/*/automation-recommendation.md`, or a legacy recommendation that `/tdk-scaffold-from-recommendation` still accepts (`.specify/configurations/automation-recommendations/recommendation-*.md`, `.specify/reports/recommendation-*.md`). It must have an `agent` row for that name in an `## Executor Decisions` Artifacts table, or list the agent under `## Recommended Agents`. A T3 entry may target a legacy `.specify/reports/` recommendation.
- The three `blocked` rules below apply only to an agent signal that a row above routes to T3. A lesson routed to T4 or T6 needs neither scaffold nor an owner. Check them in this order and use the first that holds; join `{paths}` with `, `.
- `/tdk-scaffold-from-recommendation` is not in the live skill catalog: create a `status: blocked` entry with `target_id: T3`, `target_path: .claude/agents/<name>.md`, and `blocked_reason: manual: /tdk-scaffold-from-recommendation is not installed; edit .claude/agents/<name>.md by hand`.
- No recommendation owns the agent: create a `status: blocked` entry with `target_id: T3`, `target_path: .claude/agents/<name>.md`, and `blocked_reason: manual: no recommendation owns @<name>; edit .claude/agents/<name>.md by hand or add it to a recommendation`.
- Several recommendations own the agent: create the same `blocked` entry with `blocked_reason: manual: several recommendations own @<name> ({paths}); pick one`.
- Do not propose memory targets unless memory is `ready`. With `ready` memory and an unknown domain, mark the entry `blocked`.
- Do not propose direct edits to the memory root; `/tdk-memory-update` owns memory writes.
- `target_path` is repo-relative with no leading `./`; history matches it exactly.
