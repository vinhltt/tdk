# Project Knowledge Research

Research codebase and project knowledge using the available skills.

## Skills Reference

| Skill | Role | Method |
|-------|------|--------|
| `obsidian-mcp` | Semantic search, file navigation | MCP tools (native) |
| `tdk-memory-query` | Doc structure, templates, validation | use `tdk-memory-query` or ask agent `memory-guardian` |
| `obsidian-brain` | Research modes, context synthesis | use `obsidian-brain` |

---

## 1. Obsidian MCP (Knowledge Search)

Native MCP tools for vault-based knowledge discovery.

### Core Tools

| Tool | Purpose | Use Case |
|------|---------|----------|
| `obsidian_simple_search` | Full-text search | Quick concept discovery |
| `obsidian_complex_search` | JsonLogic queries | Advanced filtering (tags, frontmatter) |
| `obsidian_batch_get_file_contents` | Batch file reading | Read multiple related docs |
| `obsidian_list_files_in_dir` | Directory listing | Navigate vault structure |

### Search Patterns

**Semantic Search:**
```
obsidian_simple_search("api authentication")
→ Returns scored results with context
→ Lower score = higher relevance
```

**Advanced Filtering:**
```
obsidian_complex_search({"glob": ["**/*.md", {"var": "path"}]})
obsidian_complex_search({"regexp": ["related-to:.*Entity", {"var": "content"}]})
```

**Batch Reading:**
```
obsidian_batch_get_file_contents([
  ".specify/memory/codebase-summary.md",
  ".specify/memory/code-standards.md"
])
```

### Metadata Conventions

Use frontmatter for explicit relations:
```yaml
---
related-to: [EntityA, EntityB]
depends-on: [ModuleX]
tags: [api, backend]
---
```

Infer relations from `[[WikiLinks]]` in content.

---

## 2. AI Docs Manager (Project Documentation)

**Agent:** `memory-guardian` agent to fetch and summarize relevant documentation based on project domain.
**Skill:** `tdk-memory-query` for doc structure validation and scaffolding.

## 3. Obsidian Brain (Knowledge Synthesis)

**Skill:** `obsidian-brain`

### Research Modes

**Detective Mode (Deep Research)**
```
# 1. Semantic search
obsidian_simple_search("EmissionID")

# 2. Batch read top results
obsidian_batch_get_file_contents([top_result_paths])

# 3. Exact match search
grep -r "EmissionID" .specify/memory/ src/
```
→ Infer relations: Doc A defines → Doc B validates = dependency

**Writer Mode (Content Synthesis)**
1. Search: `obsidian_simple_search("topic")`
2. Batch read top results for context
3. Draft content using project terminology
4. Add `[[Internal Links]]` to related documents

**Reviewer Mode (Consistency Check)**
1. Search Obsidian MCP for related terms
2. Verify terminology consistency
3. Warn on logic conflicts

---

## Integration Workflow

### Before Planning

```
# 1. Semantic search for related concepts
obsidian_simple_search("feature-name")
→ Filter top 3-5 results by score

# 2. Batch read relevant docs
obsidian_batch_get_file_contents([top_result_paths])

# 3. Check vault structure
obsidian_list_files_in_dir(".specify/memory/")

# 4. Validate doc structure (unchanged)
python .claude/skills/tdk-memory-query/scripts/validate-structure.py
```

### Subagent Delegation Pattern

```markdown
## Knowledge Research Task

**Delegate:** Research project knowledge for [feature-name]
**Output:** .specify/specs/{task-id}/research/knowledge-research.md

**Tools to use:**
1. `obsidian_simple_search("[feature]")` - Find related docs
2. `obsidian_batch_get_file_contents([paths])` - Read top results
3. `obsidian_complex_search({"frontmatter": ["related-to"]})` - Find linked entities

**User continues** when research complete.
```

---

## Quality Checklist

Before completing knowledge research:
- [ ] Obsidian MCP searched for semantic matches
- [ ] Related docs batch-read for context
- [ ] Frontmatter relations checked
- [ ] Relevant .specify/memory/ files read
- [ ] Previous feature plans checked
- [ ] Decisions documented with sources cited
