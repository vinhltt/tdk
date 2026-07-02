---
name: tdk-setup-guide
description: "Interactive setup guide for TDK environment. Checks prerequisites, verifies config, troubleshoots issues. Use when asking 'how to set up', 'setup help', 'verify setup', 'check prerequisites', 'tdk setup', 'installation guide', 'troubleshoot setup'."
metadata:
  version: "2.2.5"
---

# TDK Setup Guide

Interactive guide for setting up and verifying the TDK environment.

## Critical Constraint

**DO NOT hallucinate or invent information.** All responses MUST be sourced from:
- Setup docs → `.specify/docs/en/guides/setup/`
- Setup script → `.specify/setup.sh`
- Config files → `.specify/.specify.json`, `.mcp.json`

If information is not found in these sources, respond: "No documentation found for this topic." Never fabricate setup steps, commands, or config values.

## Usage

```
/tdk-setup-guide                     # Full setup overview + status check
/tdk-setup-guide check               # Verify all prerequisites & config
/tdk-setup-guide <topic>             # Guide for a specific setup topic
/tdk-setup-guide troubleshoot        # Diagnose common issues
```

## Arguments

Parse `$ARGUMENTS` to determine mode:

| Pattern | Mode |
|---------|------|
| Empty / no args | **Overview** |
| `check` or `verify` | **Check** |
| `troubleshoot` or `debug` | **Troubleshoot** |
| Any other text | **Topic Detail** (match against setup doc topics) |

## Tool Strategy

**CRITICAL — Vault Path Rule:** Smart-obsidian vault root = `.specify/`. All paths passed to MCP tools MUST be relative to vault root — NEVER prefix with `.specify/`.
- CORRECT: `get_vault_file("docs/en/guides/setup/setup-guide.md")`
- WRONG: `get_vault_file(".specify/docs/en/guides/setup/setup-guide.md")` ← double-prefix, 404
- WRONG: `list_vault_files("")` or `list_vault_files("/")` ← empty path, 404

| Task | Tool | Why |
|------|------|-----|
| Read setup docs | `get_vault_file(path)` or `Read` | Get full guide content |
| Find setup topic | `search_vault_smart(query)` | Semantic match across docs/en/guides/setup/ |
| Verify prerequisites | `Bash` — run check commands | Real system state verification |
| Check config exists | `Glob` for config files | Fast path validation |
| Search troubleshooting | `Grep` on setup docs | Line-level match for error messages |

## Mode: Overview (no args)

1. Read `.specify/docs/en/guides/setup/setup-guide.md` — display the Fast Path and troubleshooting sections
2. List the streamlined setup guide:

```markdown
## Setup Topics

| Topic | Guide |
|-------|-------|
| Full Setup | [setup-guide.md](en/guides/setup/setup-guide.md) |

Use `/tdk-setup-guide check` to verify your environment, or `/tdk-setup-guide <topic>` to jump to the setup guide.
```

## Mode: Check (`check` or `verify`)

Run verification commands and report status. Execute these sequentially:

### Step 1 — System prerequisites
```bash
git --version
python --version || python3 --version
bun --version
```

### Step 2 — Python venv
```bash
# Check venv exists
ls .venv/Scripts/python.exe 2>/dev/null || ls .venv/bin/python3 2>/dev/null

# Check key imports
.venv/Scripts/python.exe -c "import requests, dotenv, yaml, git; print('OK')" 2>/dev/null || \
.venv/bin/python3 -c "import requests, dotenv, yaml, git; print('OK')" 2>/dev/null
```

### Step 3 — TDK config
```bash
# Check .specify.json exists and is valid
bash -lc '
PROJECT_DIR="$1"
if [ -z "$PROJECT_DIR" ] || [ ! -d "$PROJECT_DIR/.specify/scripts/ts" ]; then
  echo "Invalid project root: $PROJECT_DIR" >&2
  exit 1
fi
(cd "$PROJECT_DIR/.specify/scripts/ts" && bun src/commands/detect-config.ts)
' -- "<agent-resolved-project-root>"
```

Ask the user for the project root if `<agent-resolved-project-root>` cannot be identified confidently; do not pass the placeholder literally.

### Step 4 — Plugin marketplace
```bash
# Check if claude CLI available and plugins registered
claude plugin marketplace list 2>/dev/null
```

### Step 5 — MCP config
```bash
# Check .mcp.json exists (don't print contents — may contain API keys)
test -f .mcp.json && echo ".mcp.json: EXISTS" || echo ".mcp.json: MISSING"
```

### Output format
```markdown
## Environment Check Results

| Component | Status | Detail |
|-----------|--------|--------|
| Git | OK | v2.43.0 |
| Python | OK | 3.11.5 |
| Python venv | OK | .venv/ exists, imports pass |
| .specify.json | OK | configFound=true, WORKSPACE=example-workspace |
| Plugin marketplace | OK | tdk-core, tdk-utils registered |
| .mcp.json | OK | EXISTS |

### Actions needed:
1. Install missing tools or re-run setup: see [setup-guide.md](en/guides/setup/setup-guide.md)
```

## Mode: Topic Detail (`<topic>`)

1. Match `<topic>` against setup doc filenames and content:
   - Try filename match: `Glob` `.specify/docs/en/guides/setup/*{topic}*`
   - If no match: `search_vault_smart(topic)` filtered to `docs/en/guides/setup/` path
2. Read matched doc → display relevant sections
3. If topic is about a specific step in the setup README, extract just that section

**Topic aliases:**

| Input | Matches |
|-------|---------|
| `python`, `venv` | setup-guide.md |
| `plugin`, `marketplace` | setup-guide.md |
| `ctx7`, `context7` | setup-guide.md |
| `github`, `gh` | setup-guide.md |
| `obsidian` | setup-guide.md |
| `mcp` | setup-guide.md |

## Mode: Troubleshoot (`troubleshoot` or `debug`)

1. Run **Check** mode first to identify failing components
2. For each failure, search `.specify/docs/en/guides/setup/setup-guide.md` Troubleshooting for matching solution
3. If user describes a specific error:
   - `Grep` the error message across all setup docs
   - `search_vault_smart(error_message)` for semantic match
4. Present:

```markdown
## Troubleshooting

### Issue: [detected or described issue]
**Cause:** [from troubleshooting table]
**Solution:** [from troubleshooting table]
**Guide:** [link to relevant setup doc section]
```

## Error Handling

| Case | Action |
|------|--------|
| Topic not found | "No setup guide for '<topic>'. Available topics: [list]. Use `/tdk-setup-guide` for overview." |
| Command not available | Skip that check, report as "SKIPPED — command not found" |
| .mcp.json missing | Warn but don't fail — it's gitignored, needs manual creation |
| OS detection needed | Use `uname -s` or check for Windows-specific paths |
