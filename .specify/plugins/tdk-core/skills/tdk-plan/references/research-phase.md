# Research Phase

**Skip if:** User provides researcher reports or technical context docs.

**Sequential Thinking:** Break down problems step-by-step, hypothesis → verification → refinement.

## Tools

- `@workspace` — Search codebase for patterns
- `gh` CLI — Analyze GitHub issues, PRs, Actions logs
- `repomix --remote <url>` — AI-friendly repo summary
- Web search for external documentation

## Subagent Delegation

Spawn `N` `researcher` subagents in parallel, one per independent research topic.

- `N` = number of distinct unresolved technical questions or approach areas.
- Default to 1 when only one topic exists; cap at 5 unless the user explicitly asks for more.
- Give each researcher a caller-provided absolute `output_path`.
- Ensure `{FEATURE_DIR}/research/` exists before spawning researchers.
- Output path format: `{FEATURE_DIR}/research/yyMMdd-HHmmss-{slug}.md`.
- `{slug}` is a lowercase kebab-case topic slug. Make it unique per researcher by using a specific topic slug, not an agent index.

Prompt pattern:

```text
Research: [specific topic]
Output: {FEATURE_DIR}/research/yyMMdd-HHmmss-{slug}.md
```

Wait for all researcher reports before continuing to design. If any researcher returns BLOCKED or NEEDS_CONTEXT, summarize the blocker and ask user before proceeding.

## Project Knowledge Sources

**Obsidian MCP** (semantic search across vault):

```
- obsidian_simple_search("feature-name")           → semantic match
- obsidian_complex_search                          → JsonLogic queries
- obsidian_batch_get_file_contents                 → batch read related files
```

**AI Docs Manager** — `tdk-memory-query` skill OR ask `memory-guardian` agent. Reads `.specify/memory/` based on feature domain.

**Obsidian Brain** — modes:
- Detective: semantic search → grep → infer relations
- Writer: search → read context → draft with project terminology
- Reviewer: verify consistency, warn on conflicts

### Project Tech Baseline (SOT Pre-load)

**MUST DO BEFORE filling `## Technical Context` of plan.md:**

1. Resolve `docs.path` from `.specify.json` (default: `.specify/configurations`).
2. Read `{docs.path}/technical-context.md`. If file exists, treat its values as SOT.
3. Override plan-template placeholder boilerplate with SOT values (Required Stack section first; copy Optional sections only if present in SOT).
4. Mark feature-specific deviations explicitly (only deviations, not duplicates).

**Fallback:** if file missing → infer from spec.md + codebase scan (current behavior).

## Codebase Understanding

**Skip if:** User provides scout reports or codebase docs.

**Essential docs to read first:**
- `./.specify/memory/development-rules.md` — conventions, standards
- `./.specify/memory/codebase-summary.md` — architecture overview
- `./.specify/memory/code-standards.md` — coding patterns

**Scout Delegation:**

```
Scout: Find all files related to [feature]
Output: .specify/specs/{task-id}/reports/scout-{area}.md
```

## Output

`research/yyMMdd-HHmmss-{slug}.md` reports with Decision, Rationale, Alternatives, References for every relevant `## 9. Unresolved Questions` item. Synthesize only the key decisions into `plan.md`; do not create a top-level `research.md`.
