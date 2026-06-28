---
name: tdk-skill-guide
description: "Interactive guide for TDK skills and commands. Shows usage, scenarios, tips, and skill discovery. Use when asking 'how to use /tdk-*', 'what skills are available', 'show scenario', 'find a skill for X', 'tdk guide', 'tdk help'."
metadata:
  version: 2.1.0
---

# TDK Skill Guide

Interactive guide for discovering and using TDK skills in the marketplace.

## Critical Constraint

**DO NOT hallucinate or invent information.** All responses MUST be sourced from existing files:
- Skill info → `SKILL.md` files in `.specify/plugins/*/skills/*/`
- Command details → `.specify/docs/en/guides/command-reference.md`
- Scenarios → `.specify/docs/en/guides/scenarios/*.md`
- Setup → `.specify/docs/en/guides/setup/`

If information is not found in these sources, respond: "No documentation found for this topic." Never fabricate usage examples, parameters, or workflows.

## Tool Strategy

**CRITICAL — Vault Path Rule:** Smart-obsidian vault root = `.specify/`. All paths passed to MCP tools MUST be relative to vault root — NEVER prefix with `.specify/`.
- CORRECT: `get_vault_file("docs/en/guides/command-reference.md")`
- CORRECT: `list_vault_files("plugins")`
- WRONG: `get_vault_file(".specify/docs/en/guides/command-reference.md")` ← double-prefix, 404
- WRONG: `list_vault_files("")` or `list_vault_files("/")` ← empty path, 404

**Always prefer smart-obsidian MCP tools.** Fall back to built-in tools (Glob, Grep, Read) only when MCP is unavailable or returns errors.

### Primary Tools (smart-obsidian MCP)

| Task | Tool | Why |
|------|------|-----|
| Find skill files by name/pattern | `search_vault_simple(query)` | Fast filename + content search |
| Semantic/fuzzy search across vault | `search_vault_smart(query)` | Understands context, ranks by relevance |
| Read matched file content | `get_vault_file(path)` | Read any file in vault |
| List all files in a dir | `list_vault_files(path)` | Browse scenarios, skills |
| Find keyword in specific file | `search_vault_simple(query)` with path context | Scoped search within vault |

### Fallback Tools (when MCP unavailable)

| Task | Fallback Tool |
|------|---------------|
| Find skill files by name | `Glob` `.specify/plugins/*/skills/*/SKILL.md` |
| Find keyword in specific file | `Grep` on target file |
| Read matched file content | `Read` |
| List all files in a dir | `Glob` with directory pattern |

### MCP Availability Check

Before first tool call, attempt one smart-obsidian call (e.g., `get_server_info()`). If it fails, switch to fallback tools for the remainder of the session. Do not retry MCP after a failure.

### Preferred flow per mode (smart-obsidian)

- **Overview**: `list_vault_files("plugins")` → `get_vault_file` each SKILL.md for name+description
- **Skill Detail**: `search_vault_simple(skill-name)` → `get_vault_file` matched SKILL.md → `search_vault_simple` in command-reference.md
- **Search**: `search_vault_smart(keyword)` → filter by path → `get_vault_file` top results
- **Tips**: `search_vault_smart(skill-name + "tips OR gotchas OR best practices")` → `get_vault_file` relevant sections
- **Scenario**: `list_vault_files("docs/en/guides/scenarios")` → `get_vault_file` matched file

### Preferred flow per mode (fallback)

- **Overview**: `Glob` `.specify/plugins/*/skills/*/SKILL.md` → `Read` each
- **Skill Detail**: `Glob` exact match → `Read` SKILL.md → `Grep` command-reference.md
- **Search**: `Grep` across SKILL.md files + command-reference.md + scenarios
- **Tips**: `Grep` command-reference.md for tips/gotchas
- **Scenario**: `Glob` scenarios dir → `Read` matched file

## Usage

```
/tdk-skill-guide                        # Overview + all skill categories
/tdk-skill-guide <skill-name>           # Detailed guide for a specific skill
/tdk-skill-guide scenario <number>      # Show a specific workflow scenario
/tdk-skill-guide search <keyword>       # Find skills by keyword
/tdk-skill-guide tips <skill-name>      # Best practices & gotchas for a skill
```

## Arguments

Parse `$ARGUMENTS` to determine mode:

| Pattern | Mode |
|---------|------|
| Empty / no args | **Overview** |
| `scenario <N>` or `scenario <keyword>` | **Scenario** |
| `search <keyword>` | **Search** |
| `tips <skill-name>` | **Tips** |
| Any other text | **Skill Detail** (treat as skill name) |

## Mode: Overview (no args)

1. `get_vault_file("docs/en/README.md")` — display the quick start + guide index
   - Fallback: `Read` `.specify/docs/en/README.md`
2. `list_vault_files("plugins")` → filter for `SKILL.md` files → `get_vault_file` each for name+description
   - Fallback: `Glob` `.specify/plugins/*/skills/*/SKILL.md` → `Read` each
3. Group skills by plugin and display as categorized table:

   ```markdown
   ## Available Skills

   ### tdk-core (31 skills)
   | Skill | Description |
   |-------|-------------|
   | /tdk-specify | Create feature spec from natural language |
   | /tdk-plan | Generate implementation plan |
   | ... |

   ### tdk-utils (15 skills)
   | ... |
   ```

4. End with: "Use `/tdk-skill-guide <skill-name>` for detailed usage, or `/tdk-skill-guide scenario <N>` for workflow examples."

## Mode: Skill Detail (`<skill-name>`)

1. `search_vault_simple(skill-name)` → find matching `SKILL.md` in `plugins/`
   - Fallback: `Glob` `.specify/plugins/*/skills/{skill-name}/SKILL.md`
   - Try exact match first, then fuzzy (e.g., "specify" matches "tdk-specify")
   - If multiple matches, list them and ask user to pick

2. `get_vault_file(matched-path)` — extract name, description, and full content
   - Fallback: `Read` matched file

3. `search_vault_simple(skill-name)` scoped to `docs/en/guides/command-reference.md` — extract relevant section
   - Fallback: `Grep` `.specify/docs/en/guides/command-reference.md` for skill name

4. `search_vault_smart(skill-name)` scoped to `docs/en/guides/scenarios/` — list related scenarios
   - Fallback: `Grep` `.specify/docs/en/guides/scenarios/*.md` for skill name

5. Present combined output:
   ```markdown
   ## /tdk-specify

   **Plugin:** tdk-core
   **Description:** Create feature specification from natural language

   ### Usage
   [from SKILL.md]

   ### Tips & Details
   [from command-reference.md section]

   ### Related Scenarios
   - [01 - Full Feature Development](guides/scenarios/01-full-feature-development.md)
   - [02 - Quick Specification](guides/scenarios/02-quick-specification.md)
   ```

## Mode: Scenario (`scenario <N>` or `scenario <keyword>`)

1. `list_vault_files("docs/en/guides/scenarios")` → find matching file
   - If `<N>` is a number: match `{N}-*.md`
   - If `<keyword>`: `search_vault_smart(keyword)` scoped to scenarios
   - Fallback: `Glob` `.specify/docs/en/guides/scenarios/*.md` + `Grep` for keyword
2. `get_vault_file(matched-path)` — read scenario content
   - Fallback: `Read` matched file
3. If no match: list all available scenarios
4. Display the scenario content with a header note:
   ```
   > Scenario from .specify/docs/en/guides/scenarios/
   ```

## Mode: Search (`search <keyword>`)

Search across all sources using `search_vault_smart(keyword)`:

1. **Skill names & descriptions**: results from `plugins/*/skills/*/SKILL.md`
2. **Command reference**: results from `docs/en/guides/command-reference.md`
3. **Scenarios**: results from `docs/en/guides/scenarios/*.md`

Fallback (MCP unavailable):
1. `Grep` SKILL.md files for keyword
2. `Grep` `.specify/docs/en/guides/command-reference.md`
3. `Grep` `.specify/docs/en/guides/scenarios/*.md`

Present results grouped by source:

```markdown
## Search Results for "<keyword>"

### Skills
- **/tdk-specify** (tdk-core) — Create feature spec from natural language

### Command Reference
- Line 142: "Use /tdk-specify to kick off the workflow..."

### Scenarios
- **01-full-feature-development.md** — mentions keyword in step 3
- **02-quick-specification.md** — mentions keyword in overview
```

## Mode: Tips (`tips <skill-name>`)

Extract best practices and gotchas from existing docs only:

1. Find the skill's `SKILL.md` (same as Skill Detail mode — use `search_vault_simple`)
2. `search_vault_smart(skill-name + "tips OR best practices OR gotchas")` — extract relevant sections from command-reference.md
   - Fallback: `Grep` `command-reference.md` for skill name
3. `search_vault_smart(skill-name)` scoped to `docs/en/guides/scenarios/` — extract usage patterns (what comes before/after)
   - Fallback: `Grep` `scenarios/*.md` for skill name
4. Present:

```markdown
## Tips for /tdk-specify

### Best Practices
[extracted from command-reference.md tips section]

### Common Workflow Patterns
- Usually preceded by: feature description in natural language
- Usually followed by: `/tdk-clarify` → `/tdk-plan`
[extracted from scenarios]

### Gotchas
[extracted from command-reference.md or SKILL.md warnings]
```

**If no tips/gotchas found in docs:** respond "No specific tips documented for this skill yet. See `/tdk-skill-guide <skill-name>` for general usage."

## Error Handling

| Case | Action |
|------|--------|
| MCP unavailable / error | Switch to fallback tools (Glob, Grep, Read) for all remaining calls. No retry. |
| Skill not found | "Skill '<name>' not found. Did you mean: [list close matches]?" |
| Scenario number out of range | "Scenarios available: 01-15. Use `/tdk-skill-guide` for full list." |
| No search results | "No results for '<keyword>'. Try broader terms or `/tdk-skill-guide` for overview." |
| Guides dir missing | "Guides not found at `.specify/docs/en/guides/`. Run setup first: see `.specify/docs/en/guides/setup/README.md`" |
