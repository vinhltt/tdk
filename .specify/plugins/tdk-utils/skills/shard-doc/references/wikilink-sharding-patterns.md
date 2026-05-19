# Wikilink Sharding Patterns

Reference for Obsidian wikilink syntax used in document sharding.

## Wikilink Syntax

```markdown
# Basic link (Obsidian auto-resolves to .md)
[[filename]]

# Link with display text
[[filename|Display Text]]

# Link to file in subfolder
[[subfolder/filename|Display Text]]

# Link to parent (relative)
[[../parent-doc|Parent Document]]
```

## Sharding Patterns

### Hub Document (Rewritten Original)

After sharding, the original becomes a hub with summary + wikilink per section:

```markdown
## Database Design

PostgreSQL chosen for ACID compliance. Schema uses normalized tables.

> Full details: [[system-architecture/01-database-design|Database Design]]
```

### Shard File (Extracted Section)

Each shard starts with a backlink to the hub:

```markdown
> Parent: [[../system-architecture|system-architecture]]

## Database Design

Full section content here...
```

### Index File (TOC)

Generated index lists all shards with numbered wikilinks:

```markdown
# System Architecture - Sections

> Sharded from [[../system-architecture|system-architecture.md]]

## Table of Contents

1. [[01-database-design|Database Design]]
2. [[02-api-endpoints|API Endpoints]]
3. [[03-authentication|Authentication]]
```

## Wikilink Rules

- **Omit .md extension** — Obsidian auto-resolves `[[file]]` to `file.md`
- **Use display text** — `[[path|Name]]` for readable navigation
- **Forward slashes** — even on Windows, wikilinks use `/` separators
- **Relative paths** — from the file containing the link to the target
