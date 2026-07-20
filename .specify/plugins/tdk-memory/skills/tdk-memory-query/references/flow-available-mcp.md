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

If completely ambiguous AND `--for-agent`: for `data-model`, continue to
Step 3 so it emits the canonical full-Markdown `warning_ambiguous` envelope;
other content types may return the existing lightweight envelope:
```
MEMORY_QUERY_RESULT_START
status: warning_ambiguous
files_read: 0
note: "Query too ambiguous to resolve. Caller should surface this to user."
MEMORY_QUERY_RESULT_END
```

## Step 3: Resolve CANDIDATE_FILES

### Data-model resolver (`--type data-model`, `schema`, or a known global data-model path/entity request)

This is the sole resolver for data-model queries in this transport, including
`--for-agent` calls from `tdk-memory-agent`. Read `memory/memory-index.md` with
`vault(action="read", path="memory/memory-index.md", raw=true)`, parse its **Data
Model** table into a stable-sorted canonical `data-model/*.md` inventory, and
preserve every indexed path's actual casing for exact reads and output. Search/index metadata only nominates candidates; exact-read content supplies identity, eligibility, and domain evidence.

1. **Candidate nomination and rank verification.** Use
   `vault(action="list", directory="memory/data-model", pageSize=50)` only to
   verify inventory paths; do not discover binding candidates outside the index.
   For an entity query, evaluate identity ranks in this order: exact frontmatter
   `id`, exact filename stem, exact title, then exact alias. At each rank, collect
   matching index fields plus exact `vault(action="search")` nominations for the
   same filename or frontmatter field, post-filter and stable-sort them against
   the canonical inventory, then exact-read only those nominated files with
   `vault(action="read", path="{vault-relative-path}", raw=true)`. Retain only
   files whose complete content verifies the identity at that rank. If none
   verify, continue to the next rank; stop at the first rank with one or more
   verified exact identities. This loop is bounded by four identity ranks and
   their nominated paths, not the full inventory. Do not use a blind top-K or
   ranked-search cutoff.
2. **Known-path precedence.** A supplied `data-model/{name}.md`,
   `memory/data-model/{name}.md`, or `.specify/memory/data-model/{name}.md` is
   normalized to a canonical indexed repository-relative POSIX path. Canonical
   path equality is the highest-precedence exact identity: select and exact-read
   only that path, without applying the text identity ranks or MCP prefix. A
   path outside the indexed `data-model/*.md` inventory is not a data-model
   candidate.
3. **Eligibility verification.** For a known path, verify canonical path equality
   from its complete exact read. For an entity query, reuse the complete exact
   reads from the rank loop. An exact identity qualifies only when it has
   `type: data-model`, `status: active`, `authority: memory`, and `binding: true`.
   Search snippets and nomination ranks never prove identity, eligibility,
   domain, or binding. After a rank yields a verified exact identity, never fall
   through to a lower identity rank merely because that identity is ineligible
   or lacks requested-domain proof.
4. **Optional domain proof.** When `--domain` is empty, skip **Files by Domain**
   parsing and all backlink reads. When it is non-empty, first accept an exact
   candidate's own `domain:`, `related.path`, or domain wikilink proof. If proof
   still needs backlinks, parse only the requested domain's relevant **Files by
   Domain** entries and use exact search/link nominations for that domain; stable-
   sort, deduplicate, and exact-read only those nominated proof files. Do not
   exact-read the backlink inventory.
5. **Deterministic outcome.** A qualifying identity is an eligible exact identity
   with requested-domain proof when a domain was requested. Apply this total
   decision table to the verified exact identities at the selected rank:

   | Verified exact identities | Qualifying identities | Outcome |
   |---|---|---|
   | `0` | `0` | `not_found`; `resolved_path: null`; `binding: false` |
   | `>=1` | `0` | `warning_unverified`; use the sole exact path as `resolved_path` only when exactly one exists, otherwise `null`; `binding: false` |
   | `>=1` | `1` | `resolved`; use the qualifying path as `resolved_path`; `binding: true` |
   | `>=2` | `>=2` | `warning_ambiguous`; `resolved_path: null`; `binding: false` |

   Thus multiple exact aliases that are all ineligible return
   `warning_unverified`, while one qualifying identity plus any ineligible exact
   identities resolves to the qualifying path. `candidate_paths` lists all
   verified exact identities at the selected rank. `files_read` also includes
   nominations exact-read and rejected at earlier ranks. Never choose a
   best-effort match.

### Other content types

**Known file path in query:**

- If the path starts with `memory/`, add it directly to CANDIDATE_FILES.
- If the path starts with `.specify/memory/`, strip `.specify/` before using MCP.

**With `--domain` flag:**

- `vault(action="list", directory="memory/domains/{domain}", pageSize=50)` -> build CANDIDATE_FILES.

**With `--type` flag:**

- `vault(action="search", query="{canonical-type}", searchStrategy="content", ranked=true, includeSnippets=true)` -> build CANDIDATE_FILES.
- Post-filter paths to `memory/` and content filenames matching the requested type when possible.
- Also map canonical types to path prefixes when tags are absent:
  - `services` -> `memory/domains/*/services.md`
  - `business-rules` -> `memory/domains/*/business-rules.md`
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

Step 3 resolves data-model candidates and, only for a requested domain, its
nominated proof files. For each other file in CANDIDATE_FILES:
- `vault(action="read", path="{vault-relative-path}", raw=true)` — example: `memory/domains/platform/services.md`.

For a **resolved data-model in normal mode** (without `--for-agent`), extract its
exact-read Markdown using `--format`:
- `--format full`: include the complete exact-read data-model Markdown.
- `--format summary` (default): include frontmatter `title` + `updated_at`, H2/H3
  headings, and the first 3-5 lines of each section.
- `--format list`: include only the canonical resolved vault-relative path and
  frontmatter `title`.

Extract non-data-model content per `--format` flag:
- `--format full`: include entire file content
- `--format summary` (default): frontmatter title + `updated_at`, H2/H3 headers, first 3-5 lines per section
- `--format list`: file paths + frontmatter titles only

Search results are candidates only. Do not answer from snippets when a matched
file can be read.

## Step 5: Render output

**Normal mode** (no `--for-agent`):

For a data-model outcome, render this normal Markdown result rather than an
agent envelope:
- `resolved`: render the extracted content from Step 4 using the requested
  `--format`.
- `warning_unverified`: render `Resolved:` with the sole exact path when one
  exists, otherwise `Resolved: None`; then render `Candidates: {candidate paths}`
  and `Note: Exact identity or identities are unverified; no binding data-model
  body is shown.`
- `warning_ambiguous`: render `Resolved: None`, then `Candidates: {candidate
  paths}` and `Note: Multiple equally supported candidates; no binding
  data-model body is shown.`
- `not_found`: render `Resolved: None`, `Candidates: []`, then `Note: No exact
  data-model identity was found; no binding data-model body is shown.`

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

Every data-model `--for-agent` outcome uses exactly one canonical
marker-delimited full-Markdown block. Emit these metadata fields in this exact
order, then `---`, then the body. The `--format` value never truncates a
resolved data-model body. Paths are canonical repository-relative POSIX paths so
this envelope exactly matches the file transport.

```
MEMORY_QUERY_RESULT_START
status: {resolved|warning_unverified|warning_ambiguous|not_found}
query: "{normalized query term}"
content_type: data-model
requested_domain: "{requested domain, or empty string when none was requested}"
candidate_paths:
  - .specify/memory/data-model/{actual-indexed-name}.md
resolved_path: .specify/memory/data-model/{actual-indexed-name}.md
files_read:
  - .specify/memory/data-model/{actual-indexed-name}.md
  - .specify/memory/memory-index.md
binding: {true|false}
note: "{explanation; empty when resolved}"
---
{complete Markdown file content only when status is resolved}
MEMORY_QUERY_RESULT_END
```

`candidate_paths` and `files_read` are stable-sorted Markdown lists of canonical
repository-relative POSIX paths. Use `[]` for an empty list and `null` for no
resolved path. `files_read` includes the index, each exact-read candidate, and
only requested-domain proof files actually exact-read. Only `resolved` sets
`binding: true` and includes the complete Markdown file after `---`;
`warning_unverified`, `warning_ambiguous`, and `not_found` set `binding: false`
and leave the body empty. Do not emit a shorter special envelope for an
ambiguous or missing data-model query.

### Resolved-body marker escaping

Before placing a resolved file body in the envelope, process it line by line.
Prefix one `\` to every body line that is exactly
`MEMORY_QUERY_RESULT_START`, exactly `MEMORY_QUERY_RESULT_END`, or already
begins with `\`. Do not escape the outer envelope markers. Thus a marker-only
body line cannot terminate the envelope, and an original leading backslash is
preserved after consumer unescaping. Consumers locate only exact unescaped outer
marker lines; after extracting the outer envelope and its `---` separator, they
remove exactly one leading `\` from every escaped resolved-body line.

Non-data-model aggregate `--for-agent` results (e.g. whole-domain summaries)
keep their existing lightweight envelope:

```
MEMORY_QUERY_RESULT_START
files_read: {N}
domain: {domain}
content_type: {type}
---
{extracted content, no markdown decoration}
MEMORY_QUERY_RESULT_END
```
