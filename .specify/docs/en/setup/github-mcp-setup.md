# GitHub MCP Server Setup Guide (Read-Only)

## Overview

[GitHub MCP Server](https://github.com/github/github-mcp-server) provides read-only access to public repositories — browse files, search code, read READMEs and docs.

**IMPORTANT:** Uses `--read-only` mode — cannot create, edit, update, or delete anything.

## Step 1: Create a Read-Only PAT (Fine-Grained)

1. Go to [github.com/settings/tokens?type=beta](https://github.com/settings/tokens?type=beta)
2. Click **"Generate new token"**
3. Configure:
   - **Token name:** `mcp-readonly`
   - **Expiration:** 90 days (recommended)
   - **Repository access:** Select **"Public Repositories (read-only)"**
   - **Permissions:** All default (no extras needed)
4. Click **"Generate token"** — copy the token (`github_pat_...`)

## Step 2: Set Your PAT

The MCP config is already in `.mcp.json`. Replace `YOUR_GITHUB_PAT` with your token:

```json
"github": {
  "type": "http",
  "url": "https://api.githubcopilot.com/mcp",
  "headers": {
    "Authorization": "Bearer github_pat_xxxxxxxxxxxx"
  }
}
```

> **Note:** `.mcp.json` is gitignored — your token stays local.

## Step 3: Restart Claude Code

Restart Claude Code (or reload VSCode window) to apply the MCP config.

Verify:
```bash
claude mcp list
```

## Available Read-Only Tools

| Tool | Description |
|------|-------------|
| `GetFileContents` | Read any file from a public repo |
| `SearchRepositories` | Find repos by keyword |
| `SearchCode` | Search code across GitHub |
| `GetRepositoryTree` | Browse repo directory structure |
| `ListCommits` | View commit history |
| `GetLatestRelease` | Get latest release info |

## Rate Limits

Authenticated: **5,000 requests/hour**

## Official Resources

- GitHub: https://github.com/github/github-mcp-server
