# Query Flow — Normal (No MCP)

> Used when `MCP_AVAILABLE = false`. All paths are **disk paths** relative to project root.
> Uses Claude Code built-in tools: Read, Glob, Grep.

## Step 1: Guard checks

- `Glob(".specify/memory/memory-index.md")` → must return a result
- `Glob(".specify/memory/memory.yaml")` → must return a result

Either missing → STOP: "Memory not initialized. Run /tdk-memory-init first."

## Step 2: Parse query intent

Read `$ARGUMENTS`. Identify:
- Target domains (from `--domain` flag or NL extraction)
- Target content types (from `--type` flag or NL: "business rules" → `business-rules.md`)
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

**With `--domain` flag:**

- `Glob(".specify/memory/domains/{domain}/*.md")` → build CANDIDATE_FILES
- If query mentions entity/model: also `Glob(".specify/memory/domains/{domain}/data-model/*.md")`

**With `--type` flag:**

- `Read(".specify/memory/memory-index.md")` → parse the Routing Rules table manually
- Find all files tagged with `type: {canonical-type}` → build CANDIDATE_FILES
- Also map canonical types to path prefixes when tags are absent:
  - `services` → `domains/*/services.md`
  - `business-rules` → `domains/*/business-rules.md`
  - `data-model` → `data-model/*.md`
  - `flows` → `domains/*/flows/*.md`, `shared-flows/*.md`
  - `screens` → `screens/**/*.md`
  - `screen-flows` → `screen-flows/*.md`
  - `integration-contract` → `integrations/*.md`
  - `operations-runbook` → `operations/*.md`
  - `quality-requirement` → `quality-requirements/*.md`
  - `decision-record` → `decisions/*.md`
  - `risk-debt` → `risks-and-debt/*.md`
  - `report-spec` → `reports/*.md`
  - `capability` → `capabilities/*.md`
  - `stakeholder-role` → `stakeholders-and-roles/*.md`
  - `glossary-term` → `glossary/*.md`
  - `decision-table` → `decision-tables/*.md`
  - `state-machine` → `state-machines/*.md`
  - `arc42-summary` → `arc42/*.md`

**Natural language (no explicit flags):**

- `Grep("{keywords}", ".specify/memory")` → match across all memory files
- Build CANDIDATE_FILES from top matching results (max 5)
- If a matched candidate is under `arc42/`, treat it as summary context only.
  Follow one hop through `related.path` or wikilinks to typed `binding: true`
  files before returning it as blocking evidence for agents.

If a resolved path does not exist on disk: skip with note `{file}: not found`.

## Step 4: Read and extract

For each file in CANDIDATE_FILES:
- `Read(".specify/memory/{relative-path}")` — full disk path

Extract per `--format` flag:
- `--format full`: include entire file content
- `--format summary` (default): frontmatter title + `updated_at`, H2/H3 headers, first 3-5 lines per section
- `--format list`: file paths + frontmatter titles only

## Step 5: Render output

**Normal mode** (no `--for-agent`):

```
## Memory Query Results

Query: "{query}"
Resolved: {disk-relative file paths}

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
