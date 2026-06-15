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
