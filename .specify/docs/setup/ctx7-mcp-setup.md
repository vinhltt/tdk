# Context7 Plugin Setup for Claude Code

## Setup

**Step 1:** Add marketplace (one-time per machine):
```bash
claude plugin marketplace add https://github.com/upstash/context7
```

**Step 2:** Add to `.claude/settings.json`:
```json
{
  "enabledPlugins": {
    "context7-plugin@context7-marketplace": true
  }
}
```

**Step 3:** Restart Claude Code (or reload VSCode window if using extension) to apply plugin changes.

## Verify MCP is working

Ask Claude:
> "Use context7 to fetch docs for Laravel 11 — what are the available auth methods?"

If `resolve-library-id` and `query-docs` tool calls appear in the response, MCP is working correctly.

## What the plugin provides

MCP tools available directly in Claude Code:
- `resolve-library-id` — find library ID by name
- `query-docs` — fetch up-to-date docs for a library


## Authentication

Plugin uses remote HTTP MCP server (`https://mcp.context7.com/mcp`).
Works on free tier without API key (1,000 calls/month with free account at [context7.com/dashboard](https://context7.com/dashboard)).

## Official Resources

- GitHub: https://github.com/upstash/context7
- Dashboard: https://context7.com/dashboard
