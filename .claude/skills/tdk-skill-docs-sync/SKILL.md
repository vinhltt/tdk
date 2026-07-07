---
name: tdk-skill-docs-sync
description: "This skill should be used when the user asks to 'sync skill docs', 'update docs for new skill', 'check skill documentation', 'verify skill docs are up to date', 'tdk-skill-docs-sync', 'docs sync after skill creation', or needs to scan and update guide documentation (tdk-skills-guide, index, scenarios, document-flow) after creating or modifying a skill in the tdk-speckit marketplace."
---

# tdk-skill-docs-sync

Scan tdk-speckit marketplace skills against `.specify/docs/` documentation and update missing/outdated entries. All read/write operations go through smart-obsidian MCP tools.

**CRITICAL — Vault Path Rule:** Smart-obsidian vault root = `.specify/`. All paths passed to MCP tools MUST be relative to vault root — NEVER prefix with `.specify/`.
- CORRECT: `get_vault_file("docs/en/guides/tdk-skills-guide.md")`
- CORRECT: `list_vault_files("plugins")`
- WRONG: `get_vault_file(".specify/docs/en/guides/tdk-skills-guide.md")` ← double-prefix, 404
- WRONG: `list_vault_files("")` or `list_vault_files("/")` ← empty path, 404

## Usage

```
/tdk-skill-docs-sync <skill-name> [--plugin <plugin-name>] [--dry-run]
```

- **`<skill-name>`**: Name of the skill to sync docs for (e.g., `tdk-plan`)
- **`--plugin <name>`**: Target plugin (default: auto-detect from skill name)
- **`--dry-run`**: Report gaps only, do not modify any files

## Arguments

Parse `$ARGUMENTS`:

| Pattern | Behavior |
|---------|----------|
| `<skill-name>` | Sync docs for specific skill |
| `<skill-name> --dry-run` | Report only, no changes |
| `<skill-name> --plugin <name>` | Specify target plugin explicitly |
| Empty | Error — skill name required |

## Scope

All plugins under `.specify/plugins/`. Auto-detect plugin from skill path.

## Workflow

### Step 1: Parse Arguments & Locate Skill

1. Parse `$ARGUMENTS` for skill name, `--plugin`, `--dry-run` flags
2. If `--plugin` provided, search directly in `plugins/<plugin>/skills/<skill-name>/SKILL.md`
3. Otherwise, use `search_vault_simple` to find `SKILL.md` matching `<skill-name>` in `plugins/`
4. If not found, report error and exit
5. Use `get_vault_file` to read the skill's `SKILL.md` — extract: name, description, version, usage pattern
6. Identify which plugin owns the skill (from path)
7. If `--dry-run`, skip Steps 4-5 after gap report

### Step 2: Scan Documentation for Gaps

**Preferred**: Run `scripts/scan-skill-docs-gaps.py <skill-name>` for deterministic JSON gap report, then use output to populate Step 3.

**Fallback** (script unavailable): Run these checks manually via smart-obsidian. Track results as a gap report.

#### Check 1: TDK Skills Guide Cheat Sheet

Target: `docs/en/guides/tdk-skills-guide.md`

1. `get_vault_file("docs/en/guides/tdk-skills-guide.md")`
2. Search the **Cheat Sheet** table for `/<skill-name>`
3. If missing → **GAP**: "Cheat sheet entry missing"
4. If present but description differs from SKILL.md → **GAP**: "Cheat sheet description outdated"

#### Check 2: TDK Skills Guide Usage Reference

Same file, search below the cheat sheet for a dedicated section or mention of the skill.

1. Search for heading or paragraph containing `/<skill-name>` or the skill name
2. If the skill is a `/tdk-*` command and has no detailed section → **GAP**: "Detailed usage reference section missing"
3. Non-tdk skills (utility skills) may not need a detailed section — flag as **INFO** only

#### Check 3: Guides Index

Target: `docs/en/index.md`

1. `get_vault_file("docs/en/index.md")`
2. Check if skill counts or skill lists reference this skill
3. If the index has a skill count that's now stale → **GAP**: "Index skill count outdated"

#### Check 4: Skill Directory

Target: `docs/en/guides/tdk-skills-guide.md`

1. `get_vault_file("docs/en/guides/tdk-skills-guide.md")`
2. Check whether a user-facing `/tdk-*` skill has a contact-card row
3. If missing and `user-invocable` is not `false` → **GAP**: "Skill directory entry missing"
4. Non-tdk and internal helper skills are informational only

#### Check 5: Scenarios

Target: `docs/en/guides/scenarios/`

1. `list_vault_files("docs/en/guides/scenarios")`
2. `search_vault_simple(<skill-name>)` — filter results to paths containing `scenarios/`
3. If skill appears in no scenario → **INFO**: "No scenario references this skill"
4. This is informational only — scenarios are not auto-generated

#### Check 6: Document Flow Diagram

Target: `docs/en/guides/document-flow.md`

1. `get_vault_file("docs/en/guides/document-flow.md")`
2. Search the Mermaid diagram for `/tdk-<skill-name>`
3. If the skill is a `/tdk-*` command that produces or consumes artifacts and is missing from diagram → **GAP**: "Document flow diagram missing"
4. Non-tdk skills or utility skills that don't produce artifacts → **INFO** only

#### Check 7: Command Order Quick Reference

Target: `docs/en/guides/tdk-skills-guide.md` (section "Command Order Quick Reference")

1. Search for the ASCII dependency chain under "Command Order Quick Reference"
2. If the skill is a `/tdk-*` command and missing from the chain → **GAP**: "Command order chain missing"

#### Check 8: Plugin Manifest

Target: `plugins/<plugin>/.claude-plugin/plugin.json`

1. `get_vault_file("plugins/<plugin>/.claude-plugin/plugin.json")`
2. Check if skill is registered in the `skills` object
3. If missing → **WARNING**: "Skill not registered in plugin.json (use /tdk-bump or manual update)"
4. **Read-only** — do NOT modify plugin.json

### Step 3: Present Gap Report

Format the report and present to user:

```markdown
## Docs Sync Report: <skill-name>

**Plugin**: <plugin-name>
**Skill**: <skill-name>
**Description**: <from SKILL.md>

### Gaps Found

| # | Doc | Status | Detail |
|---|-----|--------|--------|
| 1 | Cheat Sheet | GAP | Entry missing |
| 2 | Usage Reference Detail | OK | Section exists |
| 3 | Index | GAP | Skill count says 32, actual 33 |
| 4 | Skill Directory | GAP | Contact-card entry missing |
| 5 | Scenarios | INFO | No scenario references |
| 6 | Document Flow | GAP | Missing from Mermaid diagram |
| 7 | Command Order | GAP | Missing from dependency chain |
| 8 | plugin.json | WARNING | Not registered |

### Proposed Changes

1. Add row to cheat sheet table: `| 36 | /tdk-new-skill | Description here |`
2. Add or update skill directory row in `docs/en/guides/tdk-skills-guide.md`
3. Update index skill count: 32 → 33
```

### Step 4: Confirm with User

Use `AskUserQuestion` to confirm:

```
"Found N documentation gaps for <skill-name>. Apply proposed changes?"
Options:
- "Yes, apply all changes"
- "Let me pick which changes to apply"
- "Dry run only — don't change anything"
```

If user picks selective: present each change individually for approval.

### Step 5: Apply Changes via Smart-Obsidian

For each approved change, use the appropriate smart-obsidian tool:

#### Adding cheat sheet row

```
patch_vault_file(
  filename: "docs/en/guides/tdk-skills-guide.md",
  target: "Cheat Sheet",
  targetType: "heading",
  operation: "append",
  content: "| N | `/tdk-skill-name` | Description |",
  contentType: "text/markdown"
)
```

#### Updating index counts

```
patch_vault_file(
  filename: "docs/en/index.md",
  target: <heading containing count>,
  targetType: "heading",
  operation: "replace",
  content: <updated section>,
  contentType: "text/markdown"
)
```

#### Updating skill directory

```
patch_vault_file(
  filename: "docs/en/guides/tdk-skills-guide.md",
  target: <category heading>,
  targetType: "heading",
  operation: "replace",
  content: <updated category table with skill contact card>,
  contentType: "text/markdown"
)
```

#### Adding usage reference section

```
patch_vault_file(
  filename: "docs/en/guides/tdk-skills-guide.md",
  target: "Usage Reference",
  targetType: "heading",
  operation: "append",
  content: <new section from SKILL.md>,
  contentType: "text/markdown"
)
```

#### Adding to document flow diagram

```
patch_vault_file(
  filename: "docs/en/guides/document-flow.md",
  target: "Full Workflow Flow",
  targetType: "heading",
  operation: "replace",
  content: <updated Mermaid diagram with new command nodes and edges>,
  contentType: "text/markdown"
)
```

Place new nodes near related workflow commands. Keep legacy command names out of current diagrams unless the skill still exists as a verified compatibility route.

#### Updating command order chain

```
patch_vault_file(
  filename: "docs/en/guides/tdk-skills-guide.md",
  target: "Command Order Quick Reference",
  targetType: "heading",
  operation: "replace",
  content: <updated ASCII dependency chain>,
  contentType: "text/markdown"
)
```

### Step 6: Summary

After all changes applied, output summary:

```markdown
## Changes Applied

- [ ] Cheat sheet entry added
- [ ] Usage reference detail section added
- [ ] Skill directory entry added or refreshed
- [ ] Document flow Mermaid diagram updated
- [ ] Command order dependency chain updated
- [ ] Index skill count updated (if applicable)
- [ ] plugin.json — not modified (use separate workflow)
- [ ] Scenarios — no action needed

Run `/tdk-skill-guide <skill-name>` to verify the skill is now discoverable.
```

## Error Handling

| Case | Action |
|------|--------|
| Skill not found | "Skill '<name>' not found in marketplace. Check spelling or provide --plugin." |
| MCP unavailable | Fall back to Glob/Grep/Read for scanning, Edit for writing. Report MCP status. |
| tdk-skills-guide.md missing | "Guide docs not found. Run setup first." |
| Dry run mode | Report all gaps, skip Steps 4-5 |
| User cancels | Exit gracefully, no changes |

## Additional Resources

### Scripts

- **`scripts/scan-skill-docs-gaps.py`** — Deterministic gap scanner. Run before workflow Step 2 to get structured JSON report of documentation gaps.

```bash
# Single skill
python .claude/skills/tdk-skill-docs-sync/scripts/scan-skill-docs-gaps.py <skill-name>

# With plugin filter
python .claude/skills/tdk-skill-docs-sync/scripts/scan-skill-docs-gaps.py <skill-name> --plugin tdk-core

# Scan all skills
python .claude/skills/tdk-skill-docs-sync/scripts/scan-skill-docs-gaps.py --all
```

Use script output to populate the gap report in Step 3 instead of manually parsing markdown.

### Reference Files

- **`references/docs-structure-map.md`** — Maps which docs track which skill types, where entries belong, smart-obsidian tool reference, and vault path conventions
