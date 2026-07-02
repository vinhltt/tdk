# Documentation Structure Map for Skill Docs Sync

Maps which documentation files track skill information and where new entries belong.

## Primary Docs (Check Always)

### 1. TDK Skills Guide — Cheat Sheet Table

- **Path**: `docs/en/guides/tdk-skills-guide.md`
- **Section**: `## Cheat Sheet`
- **Format**: `| # | Command | Description |`
- **Applies to**: All `/tdk-*` skills that are user-invocable
- **Action**: Add numbered row with `/skill-name` and description from SKILL.md frontmatter
- **Numbering**: Continue from last number in table. Group by category (see category markers `| — |`)

### 2. TDK Skills Guide — Usage Reference Detail

- **Path**: `docs/en/guides/tdk-skills-guide.md`
- **Section**: `## Usage Reference` (below quick start)
- **Format**: `### /skill-name` subsection with usage, args, output, tips
- **Applies to**: Core workflow `/tdk-*` commands that need artifact/ordering detail
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

### 3. TDK Skills Guide — Skill Directory Contact Cards

- **Path**: `docs/en/guides/tdk-skills-guide.md`
- **Section**: Relevant category table
- **Format**: `| Skill | Summary | Main modes/options | Use when |`
- **Applies to**: User-facing `/tdk-*` skills unless `user-invocable: false`; direct support guides such as `tdk-skill-guide` and `tdk-setup-guide`
- **Action**: Add or update one concise contact-card row from SKILL.md frontmatter, usage, and verified mode flags.

### 4. Guides Index

- **Path**: `docs/en/index.md`
- **What to check**: Skill counts, skill lists, category breakdowns
- **Action**: Update counts if stale. Link new catalog pages from the guides table when needed. Do NOT add individual skill entries unless the index has a skill list.

## Secondary Docs (Check if Relevant)

### 5. Scenarios

- **Path**: `docs/en/guides/scenarios/*.md`
- **What to check**: Whether any scenario mentions the skill
- **Action**: Informational only — report presence/absence. Do not auto-create scenarios.

### 6. Workflow Pipeline Diagram

- **Path**: `docs/en/guides/tdk-skills-guide.md`
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
| (top, no marker) | Core workflow: discovery, epic-prd, specify, clarify, epic-hld, task-breakdown, plan, analyze, status, checklist, constitution |
| `Unit Testing` | ut-backfill-plan and consumer test-skill routing |
| `Config & Workspace` | config-diff, config-sync, config-index, workflow-config-apply, sub-workspace-init/list/docs/automation-recommend, scaffold-from-recommendation |
| `Project Inception` | greenfield-start, brownfield-start, architecture-advisor, workspace-layout-propose, dependency-policy, golden-path-scaffold |
| `Primary Implementation` | implement |

New skills should be placed under the appropriate category. If no category fits, suggest a new one.

> **Note**: This category table is a snapshot. Always verify against the actual `tdk-skills-guide.md` cheat sheet before placing entries.

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
- `docs/en/guides/tdk-skills-guide.md` (not `.specify/docs/en/guides/tdk-skills-guide.md`)
- `plugins/tdk-core/.claude-plugin/plugin.json`
- `docs/en/guides/scenarios/01-full-feature-development.md`
