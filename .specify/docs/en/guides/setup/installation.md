# TDK Setup Guide

Complete guide for setting up TDK tooling after cloning a consumer repository.

> **Scope:** TDK CLI tools, scripts, and Claude Code skills only. For Docker, backend, or frontend setup, see their respective docs.

## Quick Setup (Recommended)

Run the automated installer from the project root:

```bash
# Run from the consumer project root, not from inside .specify/
bash .specify/setup.sh
```

The script bootstraps prerequisites (git, bun) in bash, then delegates all remaining setup logic to TypeScript (`setup.ts`). Follow the printed manual steps after it completes.

> If you prefer manual setup or the script fails, follow the sections below.

---

## 1. System Prerequisites

Install all required tools before proceeding.

| Tool | Min Version | Verify | Purpose |
|------|-------------|--------|---------|
| Git | any | `git --version` | Version control |
| Python | 3.8+ | `python --version` or `python3 --version` | Scripts, skills, automation |
| Bun | 1.3+ | `bun --version` | TypeScript CLI runtime |

### Install Commands

**Windows (Chocolatey — run as Admin):**
```powershell
choco install python git -y
# Bun: powershell -c "irm bun.sh/install.ps1 | iex"
```

**macOS (Homebrew):**
```bash
brew install python git
curl -fsSL https://bun.sh/install | bash
```

**Linux (Debian/Ubuntu):**
```bash
sudo apt-get update && sudo apt-get install -y python3 python3-venv git
# Bun
curl -fsSL https://bun.sh/install | bash
```

## 2. Python Virtual Environment

A shared `.venv/` at the project root is used by Claude skills, `.specify/` scripts, and project development.

See full setup instructions: [**Setup Claude Code Environment**](claude-code-environment.md)

## 3. Claude Code Installation

Follow the official guide to install Claude Code CLI and the VSCode extension:

**[https://docs.anthropic.com/en/docs/claude-code/getting-started](https://docs.anthropic.com/en/docs/claude-code/getting-started)**

After installation, Claude Code will be available in the VSCode sidebar and via the terminal `claude` command.

## 4. Plugin Marketplace Registration

Register the local plugin marketplace once after clone/pull to activate all bundled skills.

See full setup instructions: [Plugin Marketplace Setup](plugin-marketplace-setup.md)

After registering, set up the required MCP integrations:

- **[Context7 Plugin Setup](ctx7-mcp-setup.md)** *(required — enables docs-seeker)*
- **[GitHub MCP Setup](github-mcp-setup.md)** *(optional — enables GitHub repo browsing)*

## 5. Configuration (Reference Only)

The workspace config at [`.specify/.specify.json`](../../../../.specify.json) is already committed. No action needed.

Simplified view of current config:

```json
{
  "$schema": "./schemas/specify.schema.json",
  "version": "1.0",
  "name": "example-workspace",
  "architecture": {
    "type": "modular-monolith"
  },
  "docs": {
    "path": ".specify/configurations"
  },
  "subWorkspaces": [
    {
      "name": "frontend",
      "path": "frontend"
    },
    {
      "name": "backend",
      "path": "backend"
    }
  ]
}
```

### Field Reference

| Field | Required | Purpose |
|-------|----------|---------|
| `version` | Yes | Config schema version (currently `1.0`) |
| `name` | Yes | Workspace identifier — appears as `workspaceName` in `detect-config.ts` output |
| `architecture.type` | Yes | Codebase pattern: `monolith`, `modular-monolith`, `microservices`, or `layered-application`. Used for project-init auto-detection |
| `docs.path` | No | Where TDK stores project documentation, relative to repo root. Defaults to `.specify/configurations` when omitted |
| `subWorkspaces` | No | List of child workspaces (`name` + `path`). `detect-config.ts` auto-detects which sub-workspace you're in based on CWD |
| `rules.path` | No | Directory for Markdown rule files. Defaults to `.specify/rules` when omitted |

> **Tip:** See `.specify/.specify.json.example` for a full template with all optional fields documented.

### JSON Schema

TDK commits a generated JSON Schema at `.specify/schemas/specify.schema.json` for editor autocomplete, validation hints, and field descriptions. Runtime validation still comes from the TypeScript Zod parser used by TDK commands.

To opt in per workspace config:

```json
{
  "$schema": "./schemas/specify.schema.json",
  "name": "example-workspace"
}
```

TDK does not automatically add `$schema` to consumer configs. If you do not want to edit `.specify/.specify.json`, configure your editor to associate `.specify/.specify.json` with `.specify/schemas/specify.schema.json`.

Defaults may be applied by the runtime parser without being written back to the file. Unknown top-level keys are tolerated during runtime parse for plugin-owned metadata, but only documented fields are supported as the public config contract.

This file is used by `detect-config.ts` to discover workspace settings. Modify only if workspace structure changes.

## 6. Skills Dependencies (Optional)

Base setup covers most needs. Install these only when using specific skills:

| Skill | Package | Install |
|-------|---------|---------|
| xlsx processing | `openpyxl` | `pip install openpyxl` |
| PDF processing | `pypdf` | `pip install pypdf` |
| PPTX processing | `markitdown[pptx]` | `pip install "markitdown[pptx]"` |
| MCP builder | `anthropic`, `mcp` | `pip install anthropic mcp` |
| GitHub issues | `requests` | Already in base install |

**docs-seeker** now uses context7 MCP tools (`resolve-library-id` + `query-docs`) — no Node.js required. Requires the context7 plugin enabled (see [Plugin Marketplace setup](plugin-marketplace-setup.md)).

> Run pip commands inside the activated venv or prefix with `.venv/bin/pip` (Linux) / `.venv\Scripts\pip.exe` (Windows).

## 7. Verification Checklist

Run these checks from the project root to confirm everything works:

### a) Config Detection
```bash
cd .specify/scripts/ts && bun src/commands/detect-config.ts
```
Expected: JSON output with `"configFound": true` and the configured `"workspaceName"`.

### b) Python Imports
```bash
# Linux/Mac/Git Bash
.venv/bin/python -c "import requests, dotenv, yaml, git; print('All imports OK')"

# Windows
.\.venv\Scripts\python.exe -c "import requests, dotenv, yaml, git; print('All imports OK')"
```

### c) docs-seeker (context7 MCP)

In Claude Code, ask:
> "Use context7 to fetch docs for Laravel 11 — what are the available auth methods?"

If `resolve-library-id` and `query-docs` tool calls appear in the response, docs-seeker MCP is working.

### d) Claude Code Commands
In Claude Code, the `/tdk-` command prefix should be visible. Key commands:
- `/tdk-specify` — Create feature spec
- `/tdk-plan` — Plan implementation

## 8. File Map & Quick Reference

```
consumer-project/
├── .specify/
│   ├── .specify.json              # Workspace config
│   ├── .specify.json.example      # Config template
│   ├── .specify.env.example       # Env template (copy to .specify.env)
│   ├── scripts/bash/              # Automation scripts
│   │   └── ...
│   ├── schemas/                   # JSON Schema for editor validation
│   ├── docs/                      # All TDK documentation
│   │   ├── README.md              # Language index
│   │   ├── en/                    # English docs
│   │   │   └── guides/            # Guides, setup docs, workflow scenarios
│   │   └── vi/                    # Vietnamese docs
│   ├── configurations/            # Project documentation
│   ├── plugins/       # Bundled Claude Code plugins & skills
│   └── templates/                 # Spec templates
├── .claude/
│   ├── rules/                     # Development rules & workflows
│   └── settings.json              # Claude Code config & permissions
├── .venv/                         # Shared Python venv (gitignored)
└── .mcp.json                      # MCP server config (gitignored)
```

## 9. Troubleshooting

| Problem | Cause | Solution |
|---------|-------|----------|
| detect-config.ts fails | Missing bun | Install Bun (Section 1) and run `cd .specify/scripts/ts && bun install` |
| Python `ModuleNotFoundError` | venv not set up | Re-run setup script (Section 2) |
| CRLF parse errors in bash | Windows line endings | Convert to LF: `dos2unix .specify/.specify.env` or configure `git config core.autocrlf input` |
| `.specify.env` changes ignored | File not saved as LF | Ensure LF line endings, no trailing whitespace |
| `/tdk-` commands not visible | Claude Code not in project root | Open Claude Code from the consumer project root |
| docs-seeker not working | context7 plugin not enabled | Enable plugin via `.claude/settings.json` → `enabledPlugins` (Section 4) |

---

## Related

- [Context7 Plugin Setup](ctx7-mcp-setup.md) — docs-seeker MCP integration
- [GitHub MCP Setup](github-mcp-setup.md) — optional GitHub repo browsing
- [Setup Claude Code Environment](claude-code-environment.md)
- [Setup Obsidian Plugins — Windows](obsidian-plugins-windows.md)
