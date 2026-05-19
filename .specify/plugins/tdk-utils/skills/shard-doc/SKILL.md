---
name: shard-doc
description: |
  Split large markdown documents into smaller files by heading level.
  Replaces extracted sections with Obsidian [[wikilinks]] in the original.
  Use when: document exceeds 200+ lines, needs modularization, or
  sections should be independently navigable.
version: 1.0.0
user-invocable: false
---

# shard-doc

Split large markdown documents into smaller section files by heading level, replace extracted content with Obsidian `[[wikilinks]]`, and generate a navigation index.

## When to Use

- Document exceeds 200+ lines and needs modularization
- Sections should be independently navigable in Obsidian
- You want to reduce file size while maintaining a hub document with navigation
- Breaking up monolithic documentation into linked sections

## Workflow

1. **Agent reads** source file overview (first 30-50 lines) to understand doc type
2. **Agent scans** project directory structure for existing patterns
3. **Agent decides** output path (or asks user with 2-3 suggestions)
4. **Agent prompts** user for split depth and backup preference
5. **Script executes** headless: parse -> split -> write shards -> rewrite original -> generate index
6. **Agent reports** completion with file count and size reduction

## CLI Usage

```bash
python .claude/skills/shard-doc/scripts/shard_doc.py <input.md> <output-dir> [options]
```

**Note:** `output-dir` is **required** (no default). Agent determines the optimal path.

## Options

| Flag | Description | Default |
|------|-------------|---------|
| `--depth N` | Heading level to split on (1-6) | 2 (H2) |
| `--backup` | Create .bak before rewriting original | off |
| `--no-rewrite` | Skip wikilink replacement in original | off |
| `--dry-run` | Zero file writes, print report only | off |
| `--json` | Output report as JSON (for agent parsing) | off |
| `--implode` | Reconstruct original from shard folder (input=dir, output=file) | off |

## Examples

```bash
# Basic sharding at H2 level with backup
python scripts/shard_doc.py docs/architecture.md docs/architecture/ --backup --json

# Dry run preview (no files written)
python scripts/shard_doc.py docs/big-doc.md docs/big-doc/ --dry-run

# Split at H3 level, no rewrite
python scripts/shard_doc.py docs/guide.md docs/guide/ --depth 3 --no-rewrite --json

# Reconstruct original from shards (implode)
python scripts/shard_doc.py docs/architecture/ docs/architecture.md --implode --json
```

## Output Structure

```
docs/architecture/
  ├── index.md              # TOC with wikilinks to all sections
  ├── 01-database-design.md # Section shard with parent backlink
  ├── 02-api-endpoints.md
  └── 03-authentication.md
```

Each shard includes `> Parent: [[../original|original]]` backlink.
Original file becomes a hub with summaries + `[[wikilinks]]`.

## Re-sharding (Agent Decision Logic)

When a previously sharded document needs re-sharding:

### Scenario A: Hub file has only wikilink stubs
- **Detect**: Hub sections contain `> Full details: [[...]]` pattern
- **Action**: Implode shards first, then re-shard the reconstructed file
- **Command**: `--implode shard-dir/ reconstructed.md` then shard again

### Scenario B: A shard file grew too large (200+ lines)
- **Detect**: Individual shard exceeds size threshold
- **Action**: Sub-shard the large shard at deeper heading level
- **Command**: Shard the specific file with `--depth 3` (or deeper)

### Scenario C: Hub file has mix of stubs + new content
- **Detect**: Hub has both wikilink stubs AND regular markdown sections
- **Action**: Shard only the new sections (incremental)
- **Command**: Copy hub, strip existing stubs, shard new content only

### Preamble Note
Content before the first split-level heading (preamble) is NOT stored in shards.
After implode, check if preamble needs to be prepended manually from the hub file's header content.

## Limitations

- Summary extraction uses character-based truncation (max 200 chars), not sentence detection
- Backlink assumes output dir is 1 level below original's parent directory
- Indented code blocks (4+ spaces) not detected as code — only fenced blocks (```, ~~~)
- Cross-drive paths produce lossy wikilinks (uses dir name only)
- Implode does not restore preamble (content before first heading) — only shard content is reconstructed

## References

- [Wikilink Sharding Patterns](references/wikilink-sharding-patterns.md)
- [Obsidian Markdown Reference](../obsidian-brain/references/obsidian-markdown.md)
