---
name: docs-seeker
description: Route documentation queries to the best tool — context7 MCP tools for library docs, GitHub MCP for repo files, WebFetch/WebSearch as fallback. Use for API docs, GitHub repository analysis, technical documentation lookup.
---

# Documentation Seeker — Routing Guide

Route documentation queries to the **best available tool** based on context.

## Tool Priority Chain

```
1. context7 MCP tools  — Library/framework docs (React, Laravel, EF Core...)
   ↓ not found / rate limit
2. GitHub MCP           — README, docs/, llms.txt from any public repo
   ↓ not available
3. WebFetch             — Direct URL fetch (llms.txt, official docs, package registries)
   ↓ no URL known
4. WebSearch            — Last resort, broad web search
```

## 1. context7 MCP Tools (Primary)

**When:** Need docs for any library/framework.

Use MCP tools directly: `resolve-library-id` then `query-docs`. Provided by the context7 plugin — no CLI installation required.

**Steps:**
1. `resolve-library-id(libraryName, query)` — find the library ID
2. `query-docs(libraryId, query)` — fetch relevant docs

## 2. GitHub MCP (Secondary)

**When:** Need to read specific files from a GitHub repo (README, docs/, llms.txt, source code examples) that context7 doesn't index.

**Available tools (read-only):**
- `GetFileContents` — Read any file from public repo
- `SearchRepositories` — Find repos by keyword
- `SearchCode` — Search code across GitHub
- `GetRepositoryTree` — Browse repo file structure
- `ListCommits`, `ListBranches`, `ListTags`, `GetLatestRelease`

**Example workflow:**
```
1. SearchRepositories("efcore entity framework")
2. GetRepositoryTree(owner: "dotnet", repo: "efcore", branch: "main")
3. GetFileContents(owner: "dotnet", repo: "efcore", path: "README.md")
```

## 3. WebFetch (Fallback)

**When:** context7 not found + know the direct URL.

```
# llms.txt from context7.com directly (bypasses CLI rate limits)
WebFetch(url: "https://context7.com/{org}/{repo}/llms.txt?topic=<keyword>")

# Official docs sites with llms.txt
WebFetch(url: "https://nextjs.org/llms.txt")
WebFetch(url: "https://docs.astro.build/llms.txt")

# Package registries for version info
WebFetch(url: "https://www.nuget.org/packages/<package>")
WebFetch(url: "https://www.npmjs.com/package/<package>")
```

## 4. WebSearch (Last Resort)

**When:** All above fail.

```
WebSearch(query: "<library> documentation <topic>")
WebSearch(query: "<library> llms.txt")
```

## Decision Matrix

| Scenario | Tool |
|----------|------|
| Library/framework docs | context7 MCP tools |
| Specific file from GitHub repo | GitHub MCP `GetFileContents` |
| Known doc URL or llms.txt | WebFetch |
| Version/release check | WebFetch (NuGet, npm, PyPI) |
| context7 rate limited | WebFetch `context7.com/{org}/{repo}/llms.txt` directly |
| Unknown library, no URL | WebSearch |

## Error Handling

| Error | Action |
|-------|--------|
| context7 returns empty | Try alternative names, then GitHub MCP `SearchRepositories` |
| context7 rate limit (429) | WebFetch `context7.com/{org}/{repo}/llms.txt` directly |
| GitHub MCP not configured | Skip to WebFetch |
| WebFetch 404 | Try WebSearch |
| All tools fail | Report to user, suggest manual URL |
