# Query Flow — MCP Available

> Used when `MCP_AVAILABLE = true`. All paths are **vault-relative** (no `.specify/` prefix).
> Load any MCP tool schema via `ToolSearch("select:mcp__smart-obsidian__{tool_name}")` before first use.

## Step 1: Guard checks

Load schema: `ToolSearch("select:mcp__smart-obsidian__list_vault_files")`

Call `mcp__smart-obsidian__list_vault_files("memory")` and verify results contain:
- `memory/memory-index.md`
- `memory/memory.yaml`

Either missing → STOP: "Memory not initialized. Run /tdk-memory-init first."

## Step 2: Parse query intent

Read `$ARGUMENTS`. Identify:
- Target domains (from `--domain` flag or NL extraction)
- Target content types (from `--type` flag or NL: "business rules" → `business-rules.md`)
- Scope: single file, whole domain, or cross-domain
- Output mode: is `--for-agent` flag present?

If completely ambiguous AND NOT `--for-agent`: use `AskUserQuestion` to clarify.

If completely ambiguous AND `--for-agent`: return immediately:
```
MEMORY_QUERY_RESULT_START
status: warning_ambiguous
files_read: 0
note: "Query too ambiguous to resolve. Caller should surface this to user."
MEMORY_QUERY_RESULT_END
```

## Step 3: Resolve CANDIDATE_FILES

**With `--domain` flag:**

Load schema: `ToolSearch("select:mcp__smart-obsidian__list_vault_files")`

- `mcp__smart-obsidian__list_vault_files("memory/domains/{domain}")` → build CANDIDATE_FILES
- If query mentions entity/model: also list `memory/domains/{domain}/data-model`

**With `--type` flag:**

Load schema: `ToolSearch("select:mcp__smart-obsidian__search_vault")`

- `mcp__smart-obsidian__search_vault(query="type: {type}", queryType="dataview")` → build CANDIDATE_FILES from all matching files across domains

**Natural language (no explicit flags):**

Load schema: `ToolSearch("select:mcp__smart-obsidian__search_vault_smart")`

- `mcp__smart-obsidian__search_vault_smart(query="{keywords}", filter={folders:["memory"]})` → build CANDIDATE_FILES from top results

If a resolved path does not appear in vault: skip with note `{file}: not found`.

## Step 4: Read and extract

Load schema: `ToolSearch("select:mcp__smart-obsidian__get_vault_file")`

For each file in CANDIDATE_FILES:
- `mcp__smart-obsidian__get_vault_file(filename, format="json")` — filename is vault-relative, e.g. `memory/domains/platform/services.md`

Extract per `--format` flag:
- `--format full`: include entire file content
- `--format summary` (default): frontmatter title + `updated_at`, H2/H3 headers, first 3-5 lines per section
- `--format list`: file paths + frontmatter titles only

## Step 5: Render output

**Normal mode** (no `--for-agent`):

```
## Memory Query Results

Query: "{query}"
Resolved: {vault-relative file paths}

### {Domain} — {Content Type} (updated: {date})

{extracted content}

---
Files read: {N} | Domains: {list} | Content type: {type}
Run /tdk-memory-update to modify these entries.
```

**Agent mode** (`--for-agent` flag):

```
MEMORY_QUERY_RESULT_START
files_read: {N}
domain: {domain}
content_type: {type}
---
{extracted content, no markdown decoration}
MEMORY_QUERY_RESULT_END
```
