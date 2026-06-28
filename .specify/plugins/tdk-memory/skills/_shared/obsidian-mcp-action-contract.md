# Obsidian MCP Action Contract

Use this contract whenever a TDK memory flow accesses `.specify/memory/` through
Obsidian MCP. The harness may expose different concrete tool names, so discover
tools by capability and call the action surface below rather than hardcoding an
MCP namespace.

## Tool Discovery

Before the first MCP call, use tool discovery for Obsidian tools that support:

- `vault` actions for listing, reading, searching, creating, and updating vault files.
- `edit` actions for targeted patches.

If the action schema cannot be discovered, treat MCP as unavailable and follow
the mode-specific fallback below.

## Path Rules

- Vault root is `.specify/`.
- All MCP paths are vault-relative and never include the `.specify/` prefix.
- Memory paths start with `memory/`, for example `memory/memory-index.md`.
- Template paths start with `templates/memory/`.

## Availability Probe

Probe memory with:

```text
vault(action="list", directory="memory", pageSize=1)
```

Expected initialized memory includes `memory/memory-index.md` and
`memory/memory.yaml` when a full guard is required.

## Reads

Use known-path reads whenever the file path is already known:

```text
vault(action="read", path="memory/memory-index.md", raw=true)
```

Important claims must be verified by reading the evidence file before reporting
or enforcing them.

## Search

Use search only for candidate discovery:

```text
vault(action="search", query="{keywords}", searchStrategy="filename", ranked=true, includeSnippets=true)
vault(action="search", query="{keywords}", searchStrategy="auto", ranked=true, includeSnippets=true)
vault(action="search", query="{keywords}", searchStrategy="content", ranked=true, includeSnippets=true)
```

Post-filter results to paths under `memory/`, then verify important claims with
`vault(action="read")`.

Semantic fragments are optional best-effort only. Do not make fragments a
blocking dependency for load, query, update, or validate flows.

## Writes

For whole-file writes:

```text
vault(action="create", path="{vault-relative-path}", content="{content}")
vault(action="update", path="{vault-relative-path}", content="{content}")
```

For targeted edits:

```text
edit(action="patch", path="{vault-relative-path}", targetType="heading", target="{heading}", operation="append", content="{content}")
edit(action="patch", path="{vault-relative-path}", targetType="heading", target="{heading}", operation="replace", content="{content}")
edit(action="patch", path="{vault-relative-path}", targetType="block", target="{block-id}", operation="append", content="{content}")
edit(action="patch", path="{vault-relative-path}", targetType="frontmatter", target="{field}", content="{value}")
```

If write actions are hidden, unavailable, or read-only, ask the user before
falling back to traditional file editing tools against `.specify/memory/`.

## Fallback Semantics

- Load/query mode: MCP unavailable is non-blocking. Continue with file-based
  reads or return no context silently when memory is not initialized.
- Validate mode: MCP unavailable is blocking. Emit exactly:

```text
STATUS: MCP_UNAVAILABLE
```

Then return so the caller can decide whether to retry with `--no-mcp`.
- Update mode: never silently fall back from MCP write failure to file edits.
  Ask for explicit user approval before using traditional file tools.
