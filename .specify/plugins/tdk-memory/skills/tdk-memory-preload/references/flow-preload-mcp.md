# Preload Flow — MCP Available

> Used when `MCP_AVAILABLE = true`. All paths are **vault-relative** (no `.specify/` prefix).
> Load any MCP tool schema via `ToolSearch("select:mcp__smart-obsidian__{tool_name}")` before first use.

## Step 1: Guard

Load schema: `ToolSearch("select:mcp__smart-obsidian__list_vault_files")`

Call `mcp__smart-obsidian__list_vault_files("memory")` and verify results contain:
- `memory/memory-index.md`

NOT found → return silently (non-blocking; memory not initialized).

## Step 2: Feature analysis

If spec file path provided: **Read file content** (`Read` tool — disk path). Extract:
- Feature name
- Mentioned entities, domains, user roles
- API endpoints or actions referenced

If natural language: extract same from `$ARGUMENTS`.

## Step 3: Domain resolution

Read `memory/memory-index.md` via `mcp__smart-obsidian__get_vault_file`.

Match extracted terms against `## Domain Map` table.
Produce `RELEVANT_DOMAINS` list.

If `--domains` flag provided: use it directly, skip NL matching.

If zero domains matched: check if data-model or screens sections are relevant.
If still nothing: output `No relevant memory context found.` and exit gracefully (non-blocking).

## Step 3.5: Cross-domain Semantic Discovery (MCP only)

Load schema: `ToolSearch("select:mcp__smart-obsidian__search_vault_smart")`

- `mcp__smart-obsidian__search_vault_smart(query="{feature description keywords}", filter={folders:["memory"]})` → discover cross-domain dependencies automatically
- Merge top results into RELEVANT_FILES list

This supplements (not replaces) domain resolution from Step 3 — captures cross-domain
files that keyword matching would miss.

## Step 4: Load memory files

1. Semantic results already collected in Step 3.5 (RELEVANT_FILES)
2. Load schema: `ToolSearch("select:mcp__smart-obsidian__get_vault_file")`
3. `mcp__smart-obsidian__get_vault_file(filename)` for each file in RELEVANT_FILES
4. If RELEVANT_DOMAINS has explicit domains not yet covered by Step 3.5 results:
   - Load schema: `ToolSearch("select:mcp__smart-obsidian__list_vault_files")`
   - `mcp__smart-obsidian__list_vault_files("memory/domains/{domain}")` for uncovered domains
   - `mcp__smart-obsidian__get_vault_file(filename)` for additional files not in semantic results

## Step 5: Output Context Block

Emit the following block (used by calling skill throughout its execution):

```
=== MEMORY CONTEXT BLOCK ===
Feature: {feature name}
Domains loaded: {comma-separated list}
Generated: {ISO datetime}

## Domain: {Domain Name}

### Business Rules
{full business-rules content}

### Services / API
{services summary}

### Known Flows
- {flow-name}: {first-line description}

## Data Models
{entity definitions — summary format}

## Related Screens
{screen titles + scenario summaries}

## Constraints & Warnings
{auto-extracted entries containing: "MUST NOT", "FORBIDDEN", "constraint", "required"}

=== END MEMORY CONTEXT BLOCK ===
```

## Step 6: Post-load note

Append after the Context Block:
```
Memory context loaded. If writing plan, validate conflicts with /memory-guardian agent.
```
