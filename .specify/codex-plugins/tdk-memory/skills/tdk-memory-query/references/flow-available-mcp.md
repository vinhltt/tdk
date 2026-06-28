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

Normalize `--type` aliases before resolving files:

| Alias | Canonical Type |
|---|---|
| `api` | `services` |
| `schema` | `data-model` |
| `flow` | `flows` |
| `screen` | `screens` |
| `integration` | `integration-contract` |
| `runbook` | `operations-runbook` |
| `nfr` | `quality-requirement` |
| `policy` | `quality-requirement` |
| `adr` | `decision-record` |
| `debt` | `risk-debt` |
| `report` | `report-spec` |

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

- `vault(action="search", query="{canonical-type}", searchStrategy="content", ranked=true, includeSnippets=true)` -> build CANDIDATE_FILES.
- Post-filter paths to `memory/` and content filenames matching the requested type when possible.
- Also map canonical types to path prefixes when tags are absent:
  - `services` -> `memory/domains/*/services.md`
  - `business-rules` -> `memory/domains/*/business-rules.md`
  - `data-model` -> `memory/data-model/*.md`
  - `flows` -> `memory/domains/*/flows/*.md`, `memory/shared-flows/*.md`
  - `screens` -> `memory/screens/**/*.md`
  - `screen-flows` -> `memory/screen-flows/*.md`
  - `integration-contract` -> `memory/integrations/*.md`
  - `operations-runbook` -> `memory/operations/*.md`
  - `quality-requirement` -> `memory/quality-requirements/*.md`
  - `decision-record` -> `memory/decisions/*.md`
  - `risk-debt` -> `memory/risks-and-debt/*.md`
  - `report-spec` -> `memory/reports/*.md`
  - `capability` -> `memory/capabilities/*.md`
  - `stakeholder-role` -> `memory/stakeholders-and-roles/*.md`
  - `glossary-term` -> `memory/glossary/*.md`
  - `decision-table` -> `memory/decision-tables/*.md`
  - `state-machine` -> `memory/state-machines/*.md`
  - `arc42-summary` -> `memory/arc42/*.md`

**Natural language (no explicit flags):**

- `vault(action="search", query="{keywords}", searchStrategy="auto", ranked=true, includeSnippets=true)` -> build CANDIDATE_FILES from top results.
- If the query looks filename-like, also call `vault(action="search", query="{filename keywords}", searchStrategy="filename", ranked=true, includeSnippets=true)`.
- Post-filter all candidates to paths under `memory/`.
- If a matched candidate is under `memory/arc42/`, treat it as summary context
  only. Follow one hop through `related.path` or wikilinks to typed
  `binding: true` files before returning it as blocking evidence for agents.

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
