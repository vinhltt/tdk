---
name: obsidian-brain
description: "Advanced knowledge management for Obsidian vaults.Use when: creating/editing .md notes, .canvas visual maps, .base database views, researching existing docs, or validating content consistency."
metadata:
  version: "2.1.1"
user-invocable: false
---

# Obsidian Brain Skill

Transform the Agent into a "Project Researcher" capable of working with Obsidian files - Markdown notes, Canvas visuals, and Bases databases.

## Core Capabilities

### 1. Writer Mode (Markdown Content)
**Goal:** Create context-aware Obsidian notes with proper syntax.

**Reference:** #file:references/obsidian-markdown.md

**Key features:**
- Wikilinks: `[[Note Name]]`, `[[Note#Heading]]`, `[[Note|Display Text]]`
- Embeds: `![[image.png]]`, `![[note.md]]`, `![[doc.pdf#page=3]]`
- Callouts: `> [!note]`, `> [!warning]`, `> [!tip]`
- Frontmatter: YAML properties for metadata
- Tags: `#tag`, `#nested/tag`

**Procedure:**
1. Check existing notes for context
2. Draft using project terminology
3. Add `[[Internal Links]]` to related documents
4. Include proper frontmatter metadata

### 2. Canvas Mode (Visual Organization)
**Goal:** Create/edit `.canvas` files for visual maps, flowcharts, project boards.

**Reference:** `references/json-canvas.md`

**Key features:**
- Node types: `text`, `file`, `link`, `group`
- Edges: connect nodes with arrows and labels
- Colors: preset 1-6 or hex colors
- Layout: position nodes with x, y, width, height

**Procedure:**
1. Plan the visual structure
2. Create nodes array with proper IDs (16-char hex)
3. Add edges to connect related nodes
4. Use groups to organize sections

### 3. Database Mode (Structured Views)
**Goal:** Create/edit `.base` files for database-like views of notes.

**Reference:** `references/obsidian-base.md`

**Key features:**
- Views: `table`, `cards`, `list`, `map`
- Filters: `file.hasTag()`, `file.inFolder()`, property comparisons
- Formulas: computed fields, date calculations
- Summaries: `Sum`, `Average`, `Min`, `Max`, etc.

**Procedure:**
1. Define global filters for note selection
2. Create formulas for computed properties
3. Configure views with property order
4. Add summaries for aggregations

### 4. Detective Mode (Research)
**Goal:** Discover connections and implicit dependencies.

**Note:** Obsidian MCP integration coming soon for semantic search.

**Current procedure:**
1. Use `grep` for exact entity matches across `.specify/`
2. Use `Glob` tool to find related files by pattern
3. Infer relations: Doc A defines → Doc B validates = dependency
4. Check backlinks via `file.backlinks` in Bases

## Instructions for Agent

**CRITICAL — Vault Path Rule:** Smart-obsidian vault root = `.specify/`. All paths passed to MCP tools MUST be relative to vault root — NEVER prefix with `.specify/`.
- CORRECT: `get_vault_file("docs/en/guides/command-reference.md")`
- CORRECT: `list_vault_files("plugins")`
- WRONG: `get_vault_file(".specify/docs/en/guides/command-reference.md")` ← double-prefix, 404
- WRONG: `list_vault_files("")` or `list_vault_files("/")` ← empty path, 404
- For built-in tools (Read, Glob, Grep): use full filesystem path including `.specify/`

- **Cite sources:** "According to `specs/Emissions.md`..."
- **Link aggressively:** Insert `[[Wikilinks]]` to connect concepts
- **Validate syntax:** Check reference files before creating Obsidian files
- **Frontmatter first:** Always include YAML metadata in notes

## References

For detailed syntax and examples, see:
- #file:references/obsidian-markdown.md - Obsidian Flavored Markdown
- #file:references/json-canvas.md - JSON Canvas Spec
- #file:references/obsidian-base.md - Obsidian Bases Syntax
