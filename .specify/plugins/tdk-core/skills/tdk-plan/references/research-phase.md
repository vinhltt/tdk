# Research Phase

**Skip if:** User provides researcher reports or technical context docs.

**Sequential Thinking:** Break down problems step-by-step, hypothesis → verification → refinement.

## Tools

- `@workspace` — Search codebase for patterns
- `gh` CLI — Analyze GitHub issues, PRs, Actions logs
- `repomix --remote <url>` — AI-friendly repo summary
- Web search for external documentation

## Subagent Delegation

```
Research: [specific topic]
Output: .specify/specs/{task-id}/research/researcher-01-{topic}.md
```

User continues manually when subagent completes.

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

`research.md` with Decision, Rationale, Alternatives, References for every NEEDS CLARIFICATION item.
