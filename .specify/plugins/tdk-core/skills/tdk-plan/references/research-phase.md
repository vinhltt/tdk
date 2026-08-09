# Research Phase

**Run only if:** At least one unresolved external or technical question needs
evidence before phase design. Skip when repository evidence, supplied reports,
and project context already settle every design choice. When skipped, do not
create `research/`.

**Sequential Thinking:** Break down problems step-by-step, hypothesis → verification → refinement.

## Tools

- `@workspace` — Search codebase for patterns
- `gh` CLI — Analyze GitHub issues, PRs, Actions logs
- `repomix --remote <url>` — AI-friendly repo summary
- Web search for external documentation

## Subagent Delegation

Spawn `N` `researcher` subagents in parallel, one per independent unresolved
research topic.

- `N` = number of distinct unresolved technical questions or approach areas.
- Default to 1 when only one topic exists; cap at 5 unless the user explicitly asks for more.
- Give each researcher a caller-provided absolute `output_path`.
- Create `{FEATURE_DIR}/research/` only after at least one research topic is
  accepted for delegation.
- Output path format: `{FEATURE_DIR}/research/yyMMdd-HHmmss-{slug}.md`.
- `{slug}` is a lowercase kebab-case topic slug. Make it unique per researcher by using a specific topic slug, not an agent index.

Prompt pattern:

```text
Research: [specific topic]
Output: {FEATURE_DIR}/research/yyMMdd-HHmmss-{slug}.md
```

Wait for all researcher reports before continuing to design. If any researcher returns BLOCKED or NEEDS_CONTEXT, summarize the blocker and ask user before proceeding.

## Project Knowledge Sources

**Obsidian MCP** (project knowledge across the vault):

```
- vault(action="search", query="feature-name", searchStrategy="auto", ranked=true, includeSnippets=true) -> discover candidate files
- vault(action="search", query="memory-index", searchStrategy="filename", ranked=true) -> find known memory files
- vault(action="read", path="memory/memory-index.md", raw=true) -> read evidence files
```

Search ranks candidate files only; verify important claims by read before using
them in research conclusions.

**AI Docs Manager** — `tdk-memory-query` skill OR ask `tdk-memory-agent` agent. Reads `.specify/memory/` based on feature domain.

**Obsidian Brain** — modes:
- Detective: semantic search → grep → infer relations
- Writer: search → read context → draft with project terminology
- Reviewer: verify consistency, warn on conflicts

Before completing project-knowledge research, verify relevant `.specify/memory/`
files were read, terminology conflicts were checked, and prior feature plans were
searched when the feature area overlaps existing work.

## Codebase Understanding

**Skip if:** User provides scout reports or codebase docs that answer the
required repository questions.

**Essential engineering context to read first:**
- Active harness/project instructions already resolved by the running agent
  (Claude or Codex harness) — conventions, standards, and workflow rules. Use
  whichever instruction set the current harness loaded; do not assume one fixed
  file path.
- Relevant sub-workspace `README`, architecture, interfaces, and engineering
  docs for the feature area.
- Code scout evidence for the touched modules (see Scout Delegation below).

Route durable decisions, quality constraints, domain rules, and other typed
facts through the memory route above (`tdk-memory-query` skill or
`tdk-memory-agent` agent), not a flat engineering-memory file.

Before phase design, identify the existing patterns the implementation must
match: architecture boundaries, error handling, state management, API shape,
test organization, dependencies, config files, and verification scripts.

**Scout Delegation:**

```
Scout: Find all files related to [feature]
Output: .specify/specs/{task-id}/reports/scout-{area}.md
```

Persist a scout report only when a later phase or reviewer needs it as durable
evidence. Otherwise keep internal repository discovery ephemeral and do not
create `reports/`.

## Output

When research runs, write `research/yyMMdd-HHmmss-{slug}.md` reports with
Decision, Rationale, Alternatives, and References for each researched item.
Index every persisted report in `plan.md ## Supporting Artifacts`, including its
owner phase and consumer. Synthesize only key decisions into `plan.md`; do not
create a top-level `research.md` or an empty `research/` directory.
