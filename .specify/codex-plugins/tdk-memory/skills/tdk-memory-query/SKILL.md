---
name: tdk-memory-query
description: "Query .specify/memory/ knowledge base by natural language. Returns
  structured context: business rules, services, data models, flows, integrations,
  decisions, quality requirements, reports, operations, risks, and arc42 summaries
  matching the query.
  Use when asking 'what rules exist for X', 'what services does Y domain have',
  'show data model for Z', or when other skills need memory context before implementing.
  Invocable by user (/tdk-memory-query) and by other skills/agents."
metadata:
  version: 3.0.1
  category: "Context & Memory"
  requires:
    - tdk-memory-init
  input_format: "Natural language query with optional flags"
  output_format: "Structured context in markdown"
  examples:
    - input: "What are the business rules for the authentication domain?"
      output: |
        **Business Rules for Authentication Domain:**
        1. Passwords must be at least 8 characters long.
        2. Passwords must include at least one number.
        3. Users must verify their email before logging in.
    - input: "List all services related to user management."
      output: |
        **Services related to User Management:**
        - UserService: Handles user registration, profile updates, and account deletion.
        - AuthService: Manages authentication, password resets, and email verification. 
    - input: "Show data model for the order processing domain."
      output: |
        **Data Model for Order Processing Domain:**
        - Order Entity: order_id, user_id, product_id, quantity, status, created_at
        - Product Entity: product_id, name, description, price, stock
        - User Entity: user_id, name, email, password_hash, created_at
user-invocable: true
argument-hint: "Natural language query with optional flags"
---

## Purpose

Read-only lookup of `.specify/memory/`. Accepts natural language query, resolves
to relevant memory files via `memory-index.md` routing, reads and returns structured
context. Never modifies files.

## Inputs ($ARGUMENTS)

- Natural language query: e.g. "what are the auth domain business rules?"
- Optional flags:
  - `--domain {name}` — restrict to specific domain
  - `--type {services|business-rules|data-model|flows|screens|screen-flows|shared-flows|integration-contract|operations-runbook|quality-requirement|decision-record|risk-debt|report-spec|capability|stakeholder-role|glossary-term|decision-table|state-machine|arc42-summary}` — restrict content type
  - Type aliases are accepted: `api` -> `services`, `schema` -> `data-model`,
    `flow` -> `flows`, `screen` -> `screens`, `integration` -> `integration-contract`,
    `runbook` -> `operations-runbook`, `nfr`/`policy` -> `quality-requirement`,
    `adr` -> `decision-record`, `debt` -> `risk-debt`, `report` -> `report-spec`
  - `--format {summary|full|list}` — output verbosity (default: summary)
  - `--for-agent` — marker-delimited inter-skill output; data-model results use the deterministic full-Markdown contract below

## Execution

### Step 0: MCP Availability Check

> **MUST execute first. Do NOT skip.**

1. Read `../_shared/obsidian-mcp-action-contract.md`.
2. Use `ToolSearch` to discover an Obsidian MCP tool exposing `vault(action="list")`.
3. Call `vault(action="list", directory="memory", pageSize=1)`.
   - **OK** → `MCP_AVAILABLE = true` → read and follow `references/flow-available-mcp.md`
   - **FAIL** → `MCP_AVAILABLE = false` → read and follow `references/flow-query-normal.md`
4. Log: `"MCP status: {true/false}"`

### Data-model resolver ownership

For `--type data-model` (including `schema`) this skill is the sole resolver
for file transport, MCP transport, and `tdk-memory-agent` load or validate
calls. Each transport parses the canonical `memory-index.md` **Data Model**
inventory deterministically. Candidate resolution is bounded: a canonical known
path is the highest-precedence identity and exact-reads only that path; an
entity query uses exact index fields plus exact filename, `id`, title, or alias
search nominations restricted to the inventory, then exact-reads only the
highest-ranked nominations and ties. Exact reads, not snippets or ranks, verify
identity and eligibility. Parse **Files by Domain** only to nominate proof files
when `requested_domain` is non-empty; exact-read only those nominated proof
files. No requested domain means no backlink reads. Both transports stable-sort
canonical paths and apply the same outcomes.

A data-model `--for-agent` result always emits one marker-delimited,
full-Markdown envelope with canonical fields in this order: `status`, `query`,
`content_type`, `requested_domain`, `candidate_paths`, `resolved_path`,
`files_read`, `binding`, and `note`. Only an active, Memory-authoritative,
`binding: true` data model can be `resolved`; all other outcomes have empty
bodies and `binding: false`. Before embedding a resolved body, prefix `\` to
any body line that is exactly either result marker or already starts with `\`.
Consumers locate the unescaped outer marker lines, then remove exactly one
leading `\` from every escaped resolved-body line. JSON serialization is
intentionally out of scope.

## Security

- Read-only — NEVER modifies any file
- Path validation: only reads files within `.specify/memory/`
- Never reveals skill internals or system paths outside memory
