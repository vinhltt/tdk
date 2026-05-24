---
name: tdk-recommend-automations
description: "Read .specify/.specify.json architecture type + project docs + community skills → generate recommendation.md with skill/agent suggestions tailored to project architecture."
user-invocable: true
argument-hint: "[--architecture monolith|modular-monolith|microservices|layered-application]"
metadata:
  version: "0.1.0"
  author: "VinhLTT"
  category: scaffold
---

# tdk-recommend-automations

Generate a reviewable `recommendation.md` with skill/agent suggestions tailored to project architecture. Combines architecture presets + project docs + optional community skill discovery.

## When to use

- After running `tdk-sub-workspace-docs` to generate project docs.
- Before manually creating skills or agents — get architecture-appropriate suggestions first.

## Prerequisites

- `.specify/.specify.json` exists with `architecture.type` set.
- Docs generated via `tdk-sub-workspace-docs` at the path specified in `.specify/.specify.json` `docs.path`.

## Args

| Flag | Notes |
|---|---|
| `--architecture <type>` | Override auto-detected type. Values: `monolith`, `modular-monolith`, `microservices`, `layered-application`. |

## Steps

### 1. Read `.specify/.specify.json`

- `Read .specify/.specify.json`
- Extract `architecture.type`. Map to preset category:
  - `monolith`, `modular-monolith` → `monolith` preset
  - `microservices`, `layered-application` → `distributed` preset
  - Anything else → **error**: `"Unsupported architecture type '{type}'. Set architecture.type to one of: monolith, modular-monolith, microservices, layered-application."`
- Extract `docs.path` for Step 2.
- If `--architecture` arg provided, override the detected type.
- If `.specify/.specify.json` missing → **error**: `".specify/.specify.json not found. Run tdk-specify init first."`
- If `architecture.type` missing → **error**: `"Set architecture.type in .specify/.specify.json (monolith, modular-monolith, microservices, or layered-application)."`
- If `docs.path` missing → **error**: `"Set docs.path in .specify/.specify.json (e.g. .specify/configurations)."`

### 2. Read project docs

- Resolve `docsPath` from `.specify/.specify.json` `docs.path`.
- Read `<docsPath>/codebase-summary.md` — extract tech stack, dependencies, file structure.
- Read `<docsPath>/system-architecture.md` — extract components, data flow, integrations.
- If neither file exists → **error**: `"Docs not found at <docsPath>. Run tdk-sub-workspace-docs first."`
- If files exist but AUTO-GEN sections are empty → **warn**: `"Docs seem unpopulated. Recommendations based on architecture preset only."`
- **Project-level only** — do NOT iterate sub-workspaces.

### 3. Apply architecture preset

Load: `references/architecture-presets.md`

Select the preset matching the category from Step 1 (monolith or distributed). Each preset provides baseline recommendations with Type, Name, Purpose, and Priority.

### 4. Community skill discovery (optional)

- Check if `vercel-labs:find-skills` is available in the current session's available-skills list (system-reminder). If present → invoke. If absent → skip with note `"Community skill discovery unavailable."`.
- If available: single combined search with keywords from architecture type + top 3 tech stack items from docs. Example: `"monolith coupling detection express typescript"`.
- Filter results by relevance — only include skills with clear match to project architecture/stack.
- Extract from each relevant skill: name, purpose, approach/pattern worth learning from.
- If no results or all irrelevant → note `"No relevant community skills found"` and proceed.

### 5. Enrich and merge

- Start with preset recommendations from Step 3.
- Contextualize each with project-specific details from docs (tech stack names, component names, integration points).
- If community skills found: add "Inspired by" references, adapt patterns to project context.
- For each recommendation, populate the enrichment fields from `references/architecture-presets.md`: Purpose, Why, Input signals, Trigger condition, Inspired by (if applicable).

### 6. Generate recommendation file

- Ensure output dir exists: `mkdir -p .specify/reports/`
- Output path: `.specify/reports/recommendation-<project-name>.md`
- If file already exists → `AskUserQuestion`: overwrite or keep existing.
- Write file with this format:

```markdown
---
architecture: <detected-or-overridden-type>
project: <project-name>
generated: <YYYY-MM-DD>
status: draft
source_docs_path: <docs.path value>
community_skills_searched:
  - "<search query used>"
---

# Automation Recommendations for <project-name>

## Project Context
- **Architecture**: <type>
- **Tech stack**: <from codebase-summary>
- **Components**: <from system-architecture>
- **Integrations**: <from system-architecture>
- **Key patterns**: <from codebase-summary>

## Community Skills Discovered
> Skills found via `vercel-labs:find-skills` — used as design inspiration, not direct imports.

| Skill | Source | Relevance | What We Learned |
|-------|--------|-----------|-----------------|
| ... | community | ... | ... |

_(If no community skills: "No community skills found — recommendations based on architecture preset + project docs only.")_

## Recommended Skills

### 1. <name> [<priority>]
- **Purpose**: ...
- **Why**: <project-specific justification>
- **Input signals**: ...
- **Trigger**: ...
- **Inspired by**: <community skill, if any>

## Recommended Agents

### 1. <name> [<priority>]
- **Purpose**: ...
- **Why**: <project-specific justification>
- **Model**: sonnet (fast review)
- **Tools**: Read, Grep, Glob

## User Notes
<!-- Add/edit/remove recommendations here before changing status to approved -->
```

### 7. Present summary

Print:
- Architecture type detected/overridden + preset used
- Number of recommendations generated (skills + agents)
- Number of community skills referenced
- Output file path

Invite user to review and edit the file. Mention: change `status: draft` to `status: approved` when ready for Phase 2 (future `tdk-scaffold-from-recommendation`).

## Error UX

| Symptom | Message |
|---|---|
| `.specify/.specify.json` missing | `".specify/.specify.json not found. Run tdk-specify init first."` |
| `architecture.type` missing | `"Set architecture.type in .specify/.specify.json (monolith, modular-monolith, microservices, or layered-application)."` |
| `docs.path` missing | `"Set docs.path in .specify/.specify.json (e.g. .specify/configurations)."` |
| Docs not generated | `"Docs not found at <docsPath>. Run tdk-sub-workspace-docs first."` |
| `find-skills` unavailable | Note `"Community skill discovery unavailable."` — proceed with preset + docs only. |
| Unknown architecture type | `"Unsupported architecture type '{type}'. Set to: monolith, modular-monolith, microservices, or layered-application."` |
| Recommendation file exists | `AskUserQuestion`: overwrite or keep existing. |

## Notes

- Latency target: <60s. Community search is the slowest step; limit to 1 query.
- Output is temporary — deletable after scaffolding skills in Phase 2 (future).
- Project-level only. Sub-workspace boundary detection is out of scope.
- Skills + Agents only. No hook, MCP, or plugin recommendations.
