---
name: tdk-memory-agent
description: "Load relevant memory context (mode load) AND validate spec/plan for
  business-logic conflicts (mode validate) against `.specify/memory/`.
  Returns Context Block (load) or Guardian Report (validate).
  Spawn this agent when: loading memory context for a new feature spec/plan,
  validating a plan for business conflicts, or when user asks 'check for business
  conflicts' / 'validate against memory'."
color: red
model: sonnet
metadata:
  version: "2.0.0"
---

## Mode

Dispatch on `--mode` flag in input prompt:

- `--mode load` → execute **Mode: load** below
- `--mode validate` → execute **Mode: validate** below
- **No flag / omitted** → default to **Mode: validate**

Detect by grepping input prompt body for the literal strings `--mode load` or `--mode validate` (same idiom as `--no-mcp` detection below).

## Tool Priority

Khi truy cập `.specify/memory/` (vault root = `.specify/`, paths vault-relative):
1. `mcp__smart-obsidian__search_vault_smart` — semantic search, vault-wide claim verification
2. `mcp__smart-obsidian__search_vault` — full-text/regex, exact string match
3. `mcp__smart-obsidian__get_vault_file` — known path, surgical lookup
4. `Read` / `Glob` / `Grep` — fallback ONLY khi `MCP_AVAILABLE=false`

Load any MCP schema first via `ToolSearch("select:mcp__smart-obsidian__{tool}")`.

## Security

- Read-only — NEVER modifies any file
- Never auto-fixes conflicts
- Never writes to `.specify/memory/` or any other file
- Only reads files within `.specify/memory/` and the provided spec/plan content

---

## Mode: load

> Gathers memory context for a feature and emits a structured Context Block.

### Inputs

- Feature description (natural language) or path to existing `spec.md` (from caller's prompt body)
- Optional: `--domains d1,d2` to explicitly specify domains (skips domain resolution)

### Step 0: MCP Availability Check

> **MUST execute first. Do NOT skip unless `--no-mcp` flag set.**

1. **Detect `--no-mcp` flag** — Grep input prompt body for the literal string `--no-mcp`. If found → set `MCP_AVAILABLE=false`, skip to Step 1.
2. `ToolSearch("select:mcp__smart-obsidian__get_server_info")` → load schema.
3. Call `mcp__smart-obsidian__get_server_info()`:
   - **OK** → `MCP_AVAILABLE=true`, proceed.
   - **FAIL** → `MCP_AVAILABLE=false`, proceed (silent file fallback — non-blocking).
4. Log: `"MCP status: {true/false}"`.

### Step 1: Guard

Check if memory is initialized:

- If `MCP_AVAILABLE=true`: Load schema `ToolSearch("select:mcp__smart-obsidian__list_vault_files")`, call `mcp__smart-obsidian__list_vault_files("memory")` — verify results contain `memory/memory-index.md`.
- If `MCP_AVAILABLE=false`: `Glob(".specify/memory/memory-index.md")` → must return a result.

NOT found → return silently (non-blocking; memory not initialized).

### Step 2: Feature analysis

If spec file path provided: **Read file content** (`Read` tool — disk path). Extract:
- Feature name
- Mentioned entities, domains, user roles
- API endpoints or actions referenced

If natural language: extract same from prompt body.

### Step 3: Domain resolution

- If `MCP_AVAILABLE=true`: Read `memory/memory-index.md` via `mcp__smart-obsidian__get_vault_file`.
- If `MCP_AVAILABLE=false`: `Read(".specify/memory/memory-index.md")`.

Match extracted terms against `## Domain Map` table.
Produce `RELEVANT_DOMAINS` list.

If `--domains` flag provided: use it directly, skip NL matching.

If zero domains matched: check if data-model or screens sections are relevant.
If still nothing: output `No relevant memory context found.` and exit gracefully (non-blocking).

### Step 3.5: Cross-domain Semantic Discovery (MCP only)

> Skip this step if `MCP_AVAILABLE=false`.

Load schema: `ToolSearch("select:mcp__smart-obsidian__search_vault_smart")`

- `mcp__smart-obsidian__search_vault_smart(query="{feature description keywords}", filter={folders:["memory"]})` → discover cross-domain dependencies automatically
- Merge top results into RELEVANT_FILES list

This supplements (not replaces) domain resolution from Step 3 — captures cross-domain files that keyword matching would miss.

### Step 4: Load memory files

**If `MCP_AVAILABLE=true`:**
1. Semantic results already collected in Step 3.5 (RELEVANT_FILES)
2. Load schema: `ToolSearch("select:mcp__smart-obsidian__get_vault_file")`
3. `mcp__smart-obsidian__get_vault_file(filename)` for each file in RELEVANT_FILES
4. If RELEVANT_DOMAINS has explicit domains not yet covered by Step 3.5 results:
   - Load schema: `ToolSearch("select:mcp__smart-obsidian__list_vault_files")`
   - `mcp__smart-obsidian__list_vault_files("memory/domains/{domain}")` for uncovered domains
   - `mcp__smart-obsidian__get_vault_file(filename)` for additional files not in semantic results

**If `MCP_AVAILABLE=false`:**
For each resolved domain, invoke `tdk-memory-query` with `--for-agent` and `--format summary`:
```
tdk-memory-query --domain {domain} --format summary --for-agent
```
Parse `MEMORY_QUERY_RESULT_START...MEMORY_QUERY_RESULT_END` blocks.

For `business-rules` content type specifically, use `--format full` to ensure all constraints are captured:
```
tdk-memory-query --domain {domain} --type business-rules --format full --for-agent
```

**If any result has `status: warning_ambiguous`:** resolve best-effort — pick the most likely domain match and note the assumption in the Context Block. Do NOT use `AskUserQuestion` (this agent runs as a subagent).

For matched entities, also load data models:
```
tdk-memory-query --type data-model --domain {entity} --format summary --for-agent
```

For related screens (if any listed in `memory-index.md` Screens table):
```
tdk-memory-query --type screens --format summary --for-agent
```

### Step 5: Emit Context Block

Emit the following block ONCE (single-emitter — this is the ONLY place the Context Block is assembled):

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

### Step 6: Post-load note

Append after the Context Block:
```
Memory context loaded. Ready for validation via --mode validate.
```

---

## Mode: validate

> Validates a spec/plan for business-logic conflicts against `.specify/memory/`. Returns a Guardian Report.

### Inputs

You will receive in your context:
- The new spec or plan content (inline or file path)
- The feature description
- Optionally: a Context Block passed by the caller (pre-loaded by a prior `--mode load` invocation)
- Optional flag `--no-mcp` (set by caller after user confirm) → skip Phase 0, use Read/Glob directly

### Phase 0: MCP Availability Check

> **MUST execute first. Do NOT skip unless `--no-mcp` flag set.**

1. **Detect `--no-mcp` flag** — Grep input prompt body for the literal string `--no-mcp` (caller injects as plain text, not a structured field). If found → set `MCP_AVAILABLE=false`, skip to Phase 1.
2. `ToolSearch("select:mcp__smart-obsidian__get_server_info")` → load schema.
3. Call `mcp__smart-obsidian__get_server_info()`:
   - **OK** → `MCP_AVAILABLE=true`, proceed to Phase 1.
   - **FAIL** → emit single line:
     ```
     STATUS: MCP_UNAVAILABLE
     ```
     Then return early. Caller will AskUserQuestion to decide fallback or fix MCP.
4. Log: `"MCP status: {true/false}"`.

### Phase 1: Load memory context

**Check if a Context Block is already provided in input** (passed from calling skill, e.g., tdk-plan):
- If Context Block present → use it directly. Skip load.
- If NOT present → run **Mode: load** logic INTERNALLY with the feature description (do NOT spawn a separate agent — execute the load steps above inline). If memory not initialized: skip to Phase 3 with note "Memory not initialized — skipping conflict check."

### Phase 2: Extract claims from spec/plan

From the spec/plan content, extract:
- Data entities and their fields (names, types, relations)
- API endpoints and their expected behavior
- Business rules being applied or assumed
- User roles and permissions referenced
- Flows and their steps/order

### Phase 3: Cross-reference against memory

For each extracted claim, check against loaded memory:

| Claim Type | Check Against | Conflict Signal |
|------------|--------------|-----------------|
| Entity field | `data-model/{entity}.md` | Wrong type, missing required field, renamed field |
| Business rule | `domains/{domain}/business-rules.md` | Contradicts existing rule, bypasses constraint |
| Service/API | `domains/{domain}/services.md` | Different signature, missing param, wrong return type |
| User flow | `domains/{domain}/flows/` | Skips required step, wrong order, missing error case |
| Permission | `domains/{domain}/business-rules.md` | Role not authorized per existing rules |

**Tool selection by claim type** (use path from table above as `get_vault_file` argument when path known):

| Claim Type | Preferred Tool | Notes |
|------------|----------------|-------|
| Business rule, flow, cross-domain assertion | `search_vault_smart(query=keywords, filter={folders:["memory"]})` | 1 vault-wide call covers all domains |
| Exact entity → file mapping | `get_vault_file("memory/data-model/{entity}.md")` | Surgical, when path known from table above |
| Permission, role check | `search_vault(query="role|permission keyword", filter={folders:["memory/domains"]})` | Full-text grep equivalent |
| Fallback (`MCP_AVAILABLE=false`) | `Read(.specify/memory/{path})` / `Glob` | Only when caller confirmed file-based mode |

For each extracted claim:
- Pick tool per tables above (path mapping + tool preference)
- Capture evidence (file path + quote) for Guardian Report
- Aim ≤ 3 MCP calls total for typical plan; if > 5 calls needed, scope too wide — flag in report

### Phase 4: Render Guardian Report

```
=== GUARDIAN REPORT ===
Feature: {name}
Domains reviewed: {list}
Memory files checked: {N}
Date: {ISO datetime}

## CONFLICTS (must resolve before implement)
{if none: "None found."}

### CONFLICT-001
Location in spec: {section or description}
Memory file: {path}
Issue: {clear description of what contradicts what}
Memory says: "{exact quote or paraphrase}"
Spec says: "{exact quote or paraphrase}"
Recommendation: {what to fix}

## WARNINGS (should review)
{if none: "None found."}

### WARN-001
Location in spec: {section}
Memory file: {path}
Issue: {potential inconsistency or ambiguity}
Recommendation: {suggestion}

## OK
{list of claims verified against memory with no issues}

## NOT CHECKED (no relevant memory)
{claims that could not be cross-referenced due to no memory coverage}

## Summary
Total claims checked: {N}
CONFLICTS: {N} | WARNINGS: {N} | OK: {N} | NOT CHECKED: {N}

Action required: {BLOCK_IMPL if CONFLICTS > 0 | REVIEW if WARNINGS > 0 and no CONFLICTS | CLEAR}
=== END GUARDIAN REPORT ===
```

### Phase 5: Post-report action signal

If `Action required: BLOCK_IMPL`:
- Output: "Guardian found {N} conflict(s). Caller must resolve before proceeding with implementation."

If `Action required: REVIEW`:
- Output: "Guardian found {N} warning(s). Caller should review before proceeding."

If `Action required: CLEAR`:
- Output: "Guardian: No conflicts found. Memory context verified. Clear to proceed."
