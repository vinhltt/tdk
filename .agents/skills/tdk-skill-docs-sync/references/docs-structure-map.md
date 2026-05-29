# Documentation Structure Map for Skill Docs Sync

Maps which documentation files track skill information and where new entries belong.

## Primary Docs (Check Always)

### 1. Command Reference — Cheat Sheet Table

- **Path**: `docs/guides/command-reference.md`
- **Section**: `## Cheat Sheet`
- **Format**: `| # | Command | Description |`
- **Applies to**: All `/tdk-*` skills that are user-invocable
- **Action**: Add numbered row with `/skill-name` and description from SKILL.md frontmatter
- **Numbering**: Continue from last number in table. Group by category (see category markers `| — |`)

### 2. Command Reference — Detailed Section

- **Path**: `docs/guides/command-reference.md`
- **Section**: `## Command Reference` (below cheat sheet)
- **Format**: `### /skill-name` subsection with usage, args, output, tips
- **Applies to**: `/tdk-*` commands only (not utility skills)
- **Action**: Add subsection derived from SKILL.md usage + description
- **Template**:
  ```markdown
  ### /skill-name

  **Description**: <from SKILL.md>
  **Plugin**: <plugin-name>

  ```
  /skill-name <args>
  ```

  | Arg | Required | Description |
  |-----|----------|-------------|
  | ... | ... | ... |

  **Output**: <what the command produces>
  **Tips**: <key gotchas or best practices>
  ```

### 3. Guides README

- **Path**: `docs/guides/README.md`
- **What to check**: Skill counts, skill lists, category breakdowns
- **Action**: Update counts if stale. Do NOT add individual skill entries unless README has a skill list.

## Secondary Docs (Check if Relevant)

### 4. Scenarios

- **Path**: `docs/guides/scenarios/*.md`
- **What to check**: Whether any scenario mentions the skill
- **Action**: Informational only — report presence/absence. Do not auto-create scenarios.

### 5. Workflow Pipeline Diagram

- **Path**: `docs/guides/command-reference.md`
- **Section**: `### Workflow Pipeline` (ASCII diagram)
- **Applies to**: Skills that fit into the core workflow pipeline (specify → clarify → plan → tasks → implement)
- **Action**: If skill is part of core flow, suggest updating diagram. Do NOT auto-modify ASCII art.

## Read-Only Checks

### 6. Plugin Manifest

- **Path**: `plugins/<plugin>/.claude-plugin/plugin.json`
- **What to check**: Whether skill is registered in `skills` object
- **Action**: Report only. Do NOT modify. Suggest using `/tdk-bump` for manifest updates.

## Category Mapping

Skills in the cheat sheet are grouped by category markers:

| Category Marker | Skills |
|----------------|--------|
| (top, no marker) | Core workflow: specify, clarify, plan, tasks, implement, analyze, status, checklist, constitution |
| `Page Design & Quality` | specify-pages, update-page-design, review-code |
| `Change & Progress` | change-requirement, show-progress |
| `Unit Testing` | ut-auto, ut-plan, ut-generate, ut-create-rules, ut-check-rules |
| `Config & Workspace` | config-diff, config-sync, config-index, sub-workspace-init, sub-workspace-list |

New skills should be placed under the appropriate category. If no category fits, suggest a new one.

> **Note**: This category table is a snapshot. Always verify against the actual `command-reference.md` cheat sheet before placing entries.

## Smart-Obsidian Tool Reference

| Task | Tool | Notes |
|------|------|-------|
| Read file | `get_vault_file(filename)` | Returns markdown content |
| Search by keyword | `search_vault_simple(query)` | Fast text search |
| List directory | `list_vault_files(directory)` | Browse files |
| Append to section | `patch_vault_file(..., operation: "append")` | Add content after heading |
| Replace section | `patch_vault_file(..., operation: "replace")` | Replace heading content |
| Create file | `create_vault_file(filename, content)` | New file |

## Vault Path Convention

Smart-obsidian vault root = `.specify/`

All paths passed to MCP tools are **relative to vault root**:
- `docs/guides/command-reference.md` (not `.specify/docs/guides/command-reference.md`)
- `plugins/tdk-core/.claude-plugin/plugin.json`
- `docs/guides/scenarios/01-full-feature-development.md`
