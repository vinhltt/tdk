# Preload Flow — Normal (No MCP)

> Used when `MCP_AVAILABLE = false`. All paths are **disk paths** relative to project root.
> Uses Claude Code built-in tools: Read, Glob, Grep.

## Step 1: Guard

`Glob(".specify/memory/memory-index.md")` → must return a result.

NOT found → return silently (non-blocking; memory not initialized).

## Step 2: Feature analysis

If spec file path provided: `Read` the file. Extract:
- Feature name
- Mentioned entities, domains, user roles
- API endpoints or actions referenced

If natural language: extract same from `$ARGUMENTS`.

## Step 3: Domain resolution

`Read(".specify/memory/memory-index.md")`.

Match extracted terms against `## Domain Map` table.
Produce `RELEVANT_DOMAINS` list.

If `--domains` flag provided: use it directly, skip NL matching.

If zero domains matched: check if data-model or screens sections are relevant.
If still nothing: output `No relevant memory context found.` and exit gracefully (non-blocking).

> **Note:** Step 3.5 (Cross-domain Semantic Discovery) is MCP-only and not available in this path.

## Step 4: Load memory files

For each resolved domain, invoke `tdk-memory-query` with `--for-agent` and `--format summary`:
```
tdk-memory-query --domain {domain} --format summary --for-agent
```
Parse `MEMORY_QUERY_RESULT_START...MEMORY_QUERY_RESULT_END` blocks.

For `business-rules` content type specifically, use `--format full` to ensure all constraints are captured:
```
tdk-memory-query --domain {domain} --type business-rules --format full --for-agent
```

**If any result has `status: warning_ambiguous`:** Use `AskUserQuestion` to clarify:
- "Memory query for domain '{domain}' was ambiguous. Did you mean: [list candidates from Domain Map]?"
- If user confirms → re-run with explicit `--domain`. If skip → proceed without that domain.

For matched entities, also load data models:
```
tdk-memory-query --type data-model --domain {entity} --format summary --for-agent
```

For related screens (if any listed in `memory-index.md` Screens table):
```
tdk-memory-query --type screens --format summary --for-agent
```

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
