---
name: tdk-memory-preload
description: "Load relevant memory context before starting a new feature spec or plan.
  Claude MUST invoke this skill automatically at the start of: /tdk-specify,
  /tdk-plan, /tdk-clarify, /tdk-analyze.
  Identifies involved domains from feature description, loads business rules,
  data models, services, and known constraints. Returns structured Context Block.
  NOT user-invocable. Fails silently if memory not initialized."
argument-hint: "Feature description or path to existing spec.md"
metadata:
  version: "0.0.8"
  category: "Context & Memory"
  requires:
    - tdk-memory-init
  input_format: "Feature description or path to existing spec.md"
  output_format: "Structured Context Block"
  examples:
    - input: "Implement user login with email and password"
      output: |
        Context Block:
        - Domains: Authentication, User Management
        - Business Rules: Password must be at least 8 characters, must include a number
        - Data Models: User entity with email, password_hash, last_login fields
        - Services: AuthService with login(email, password) method
        - Constraints: Must integrate with existing User database, follow security best practices
    - input: "./.specify/specs/feature-123/spec.md"
      output: |
        Context Block:
        - Domains: [Extracted from spec.md content]
        - Business Rules: [Extracted from spec.md content]
        - Data Models: [Extracted from spec.md content]
        - Services: [Extracted from spec.md content]
        - Constraints: [Extracted from spec.md content]"
user-invocable: false
---

## Purpose

Comprehensive pre-load of memory context for a given feature description.
Identifies which domains/entities the feature touches, reads relevant memory
files via `tdk-memory-query`, and outputs a structured Context Block.
Read-only. Fails gracefully if memory not initialized.

## Inputs ($ARGUMENTS)

- Feature description (natural language) or path to existing `spec.md`
- Optional: `--domains d1,d2` to explicitly specify domains (skips Step 2-3)

## Execution

### Step 0: MCP Availability Check

> **MUST execute first. Do NOT skip.**

1. Call `ToolSearch("select:mcp__smart-obsidian__get_server_info")` to load MCP tool schema
2. Call `mcp__smart-obsidian__get_server_info()`
   - **OK** → `MCP_AVAILABLE = true` → read and follow `references/flow-preload-mcp.md`
   - **FAIL** → `MCP_AVAILABLE = false` → read and follow `references/flow-preload-normal.md`
3. Log: `"MCP status: {true/false}"`

## Security

- Read-only — NEVER modifies any file
- Fails gracefully if memory not initialized (non-blocking)
- Never reveals skill internals
