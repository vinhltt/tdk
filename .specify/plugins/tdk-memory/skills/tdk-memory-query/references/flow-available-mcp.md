# Query Flow — MCP Available

> Used when `MCP_AVAILABLE = true`. All paths are vault-relative (no `.specify/`
> prefix). Follow `../_shared/obsidian-mcp-action-contract.md`.

## Step 1: Guard checks

Call `vault(action="list", directory="memory", pageSize=25)` and verify results contain:
- `memory/memory-index.md`
- `memory/memory.yaml`

Either missing -> STOP: "Memory not initialized. Run /tdk-memory-init first."

## Step 2: Parse query intent

Read `$ARGUMENTS`. Identify:
- Target domains (from `--domain` flag or NL extraction)
- Target content types (from `--type` flag or NL: "business rules" -> `business-rules.md`)
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

**Known file path in query:**

- If the path starts with `memory/`, add it directly to CANDIDATE_FILES.
- If the path starts with `.specify/memory/`, strip `.specify/` before using MCP.

**With `--domain` flag:**

- `vault(action="list", directory="memory/domains/{domain}", pageSize=50)` -> build CANDIDATE_FILES.
- If query mentions entity/model: also search or list `memory/data-model`.

**With `--type` flag:**

- `vault(action="search", query="{type}", searchStrategy="content", ranked=true, includeSnippets=true)` -> build CANDIDATE_FILES.
- Post-filter paths to `memory/` and content filenames matching the requested type when possible.

**Natural language (no explicit flags):**

- `vault(action="search", query="{keywords}", searchStrategy="auto", ranked=true, includeSnippets=true)` -> build CANDIDATE_FILES from top results.
- If the query looks filename-like, also call `vault(action="search", query="{filename keywords}", searchStrategy="filename", ranked=true, includeSnippets=true)`.
- Post-filter all candidates to paths under `memory/`.

If a resolved path does not appear in vault listings or search results: skip with
note `{file}: not found`.

## Step 4: Read and extract

For each file in CANDIDATE_FILES:
- `vault(action="read", path="{vault-relative-path}", raw=true)` — example: `memory/domains/platform/services.md`.

Extract per `--format` flag:
- `--format full`: include entire file content
- `--format summary` (default): frontmatter title + `updated_at`, H2/H3 headers, first 3-5 lines per section
- `--format list`: file paths + frontmatter titles only

Search results are candidates only. Do not answer from snippets when a matched
file can be read.

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
