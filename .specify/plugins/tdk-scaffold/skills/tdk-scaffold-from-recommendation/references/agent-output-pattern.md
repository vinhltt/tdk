# Agent Output Pattern

Structural pattern for generating agent.md files. Extracted from existing TDK plugin conventions.

## Required Frontmatter Fields

```yaml
---
name: <kebab-case>
tools: <comma-separated tool list>
description: "<one-line purpose for agent routing>"
model: <haiku|sonnet|opus>
metadata:
  version: "0.1.0"
---
```

## Tool Selection Guide

| Agent Purpose | Recommended Tools |
|--------------|-------------------|
| Code review / analysis | Read, Grep, Glob |
| Research / web lookup | Read, Grep, Glob, Bash, WebFetch, WebSearch |
| File modification | Read, Grep, Glob, Bash, Edit, Write |
| Task coordination | TaskCreate, TaskGet, TaskUpdate, TaskList, SendMessage |

## Model Selection Guide

| Complexity | Model | Use When |
|-----------|-------|----------|
| Low | haiku | Fast review, simple lookups, formatting |
| Medium | sonnet | Code analysis, pattern detection, moderate reasoning |
| High | opus | Complex architectural decisions, multi-file refactoring |

## Required Sections (in order)

1. **Role description** — 2-3 sentences: what this agent does, why it exists
2. **Behavioral checklist** — `- [ ]` items the agent must verify before completing
3. **Input/Output contract** — What caller provides, what agent returns

## Content Guidelines

- Description in frontmatter should be detailed enough for agent routing (include example triggers)
- Behavioral checklist: 3-5 items max, each verifiable
- Role description: focus on what makes this agent different from general-purpose agents
- Keep under 60 lines total

## Executor Variant — Routed `@executor` Agents Only

Use this variant only when a domain's approved route selects the generated agent as its executor.
Reviewers, researchers, coordinators, and other non-executor agents keep the pattern above unchanged.
Author the canonical file at `.claude/agents/<name>.md`; never dual-write an OMP agent.
Include `Skill` in Claude `tools` **and** list the domain's actual skill names in `skills:` (no slash prefix).
If the approved route is agent-only, use `skills: []`; never invent a domain skill.
Do not claim that frontmatter alone proves runtime loading or readiness.

The existing OMP conversion maps valid `skills:` lists to `autoloadSkills` and drops the Claude `Skill`
tool with a `read skill://<name>` hint. It preserves the body verbatim. Keep the load instructions
locator-driven so the same body obeys the selected dispatch contract without guessing the harness.

Generated executor example (keep the **generated agent**, including frontmatter, under 60 lines):

```markdown
---
name: <domain-executor>
tools: Read, Grep, Glob, Bash, Edit, Write, Skill
skills:
  - <domain-skill>
description: "Execute approved <domain> phases with the routed toolset and declared write boundary."
model: sonnet
metadata:
  version: "0.1.0"
---

You execute only the assigned domain phase. The caller owns routing, status transitions, and gate approval.

## Load Skills First

- Read the assigned phase and its `Load before writing:` entries.
- Before any write, load every listed skill's full instructions using the caller's locator/method:
  effective Claude `Skill` or proven full-body preload; OMP `read skill://<name>` even with autoload.
- An empty toolset needs no load. On a failed load, name the skill/error, write nothing, report BLOCKED.
- Report each loaded skill's locator/method and nonce-free first heading; never infer load from frontmatter.

## Write Boundary

- Write only this phase's `## Related Code Files` Modify/Create/Delete targets, using any injected working-root mapping.
- Do not write plan/status/routing/configuration authorities or another phase's targets.
- Before any undeclared path/delegate/command, report NEEDS_CONTEXT instead of widening scope.
- Satisfy the phase success criteria and Test Quality Gate; do not mark the phase done yourself.

## Output Contract

Report files changed, loaded skills, exercised checks/results, concerns, and blockers.
End with exactly one selected literal line: `Status: DONE`, `Status: DONE_WITH_CONCERNS`,
`Status: BLOCKED`, or `Status: NEEDS_CONTEXT`. Emit DONE only when all assigned criteria pass.
```

Replace placeholders with approved domain values. The final report line is one literal alternative,
never `Status: DONE | DONE_WITH_CONCERNS | BLOCKED | NEEDS_CONTEXT` and never multiple `Status:` lines.
The controller checks literal status **and** load receipts/success criteria before phase completion.

