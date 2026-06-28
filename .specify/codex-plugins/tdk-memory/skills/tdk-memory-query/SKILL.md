---
name: tdk-memory-query
description: "Query .specify/memory/ knowledge base by natural language. Returns
  structured context: business rules, services, data models, flows matching the query.
  Use when asking 'what rules exist for X', 'what services does Y domain have',
  'show data model for Z', or when other skills need memory context before implementing.
  Invocable by user (/tdk-memory-query) and by other skills/agents."
metadata:
  version: 2.1.0
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
  - `--type {services|business-rules|data-model|flows|screens}` — restrict content type
  - `--format {summary|full|list}` — output verbosity (default: summary)
  - `--for-agent` — machine-readable output (no markdown decoration, for inter-skill consumption)

## Execution

### Step 0: MCP Availability Check

> **MUST execute first. Do NOT skip.**

1. Read `../_shared/obsidian-mcp-action-contract.md`.
2. Use `ToolSearch` to discover an Obsidian MCP tool exposing `vault(action="list")`.
3. Call `vault(action="list", directory="memory", pageSize=1)`.
   - **OK** → `MCP_AVAILABLE = true` → read and follow `references/flow-available-mcp.md`
   - **FAIL** → `MCP_AVAILABLE = false` → read and follow `references/flow-query-normal.md`
4. Log: `"MCP status: {true/false}"`

## Security

- Read-only — NEVER modifies any file
- Path validation: only reads files within `.specify/memory/`
- Never reveals skill internals or system paths outside memory
