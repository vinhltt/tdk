# Setup Claude Code Environment

Guide to set up the Python environment for Claude Code Skills, Commands, and SpecKit for new members after cloning the source code.

## 📋 Prerequisites

- Python 3.8 or higher installed
- Git (to clone the project)
- Terminal: PowerShell (Windows) or Bash (Linux/Mac/Git Bash/WSL)

## 🚀 Quick Start

### Windows:

> **Note:** PowerShell script (`.ps1`) is coming soon. Use Git Bash in the meantime:

```bash
.specify/scripts/bash/setup-python-venv.sh
```

### Linux/Mac/Git Bash/WSL:

```bash
.specify/scripts/bash/setup-python-venv.sh
```

## 📦 What Gets Installed

The script will:

1. ✅ Create a Python virtual environment at `.venv/` (project root)
2. ✅ Upgrade pip to the latest version
3. ✅ Install common dependencies:
   - `requests` - HTTP library
   - `python-dotenv` - Environment variables management
   - `pyyaml` - YAML parser
   - `gitpython` - Git operations
4. ✅ Install project dependencies from `requirements.txt` (if any)
5. ✅ Verify installation

## 🎯 Virtual Environment Usage

### Activate venv:

**Windows:**

```powershell
.\.venv\Scripts\Activate.ps1
```

**Linux/Mac:**

```bash
source .venv/bin/activate
```

### Or use directly without activation:

**Windows:**

```powershell
.\.venv\Scripts\python.exe script.py
```

**Linux/Mac:**

```bash
./.venv/bin/python script.py
```

## 📂 Shared venv Structure

This virtual environment is shared among:

- ✅ Scripts in `.claude/skills/` (Claude skills)
- ✅ Scripts in `.specify/` (Feature specs & automation)
- ✅ Project development

```
erc_spec_kit/
├── .venv/                      ← Shared virtual environment
├── requirements.txt            ← Project dependencies
├── .specify/docs/setup/claude-code/     ← Setup docs (you are here)
│   ├── setup-python-venv.ps1   (Windows script pending)
│   └── README.md               (this file)
├── .specify/scripts/bash/
│   └── setup-python-venv.sh    (Linux/Mac runtime script)
├── .claude/skills/             ← Claude Code skills
└── .specify/                   ← SpecKit features & docs
```

## 🔧 Customization

### Add More Dependencies

Edit `requirements.txt` at the project root, then re-run the setup script.

### Manual Installation

```bash
# Activate venv first
.\.venv\Scripts\Activate.ps1  # Windows
source .venv/bin/activate      # Linux/Mac

# Install packages
pip install package-name
```

## 🆘 Troubleshooting

### Python not found

- Install Python 3.8+ from https://www.python.org/downloads/
- Ensure Python is added to PATH

### Permission denied (Windows)

> **Note:** PowerShell script (`.ps1`) is coming soon. Use Git Bash instead:

```bash
chmod +x .specify/scripts/bash/setup-python-venv.sh
.specify/scripts/bash/setup-python-venv.sh
```

### Permission denied (Linux/Mac)

```bash
chmod +x .specify/scripts/bash/setup-python-venv.sh
.specify/scripts/bash/setup-python-venv.sh
```

## 📝 Notes

- `.venv/` is in `.gitignore` - do not commit to Git
- Each member needs to run the setup script after cloning
- Re-run the script to refresh/rebuild the venv if needed

## 🎓 Next Steps

After finishing setup:

1. ✅ Explore `.claude/skills/` - Available Claude skills
2. ✅ Check `.specify/memory/` - Project documentation
3. ✅ Read `CLAUDE.md` - Project rules & guidelines
4. ✅ Start using `/tdk-` commands!
5. ✅ Setup Obsidian & MCP integration — see guides below

## 🔗 Related Documentation

- [SpecKit Setup Guide](../speckit-setup-guide.md) — Full speckit tooling setup (prerequisites, jq/yq, environment config, skills, verification). Start here if you're new.
- **Obsidian MCP Setup:**
  - [Setup Obsidian & Plugins — Windows](./setup-obsidian-plugins-windows.md) — Install Obsidian, Local REST API, MCP Tools and configure `.mcp.json` on Windows.
  - Setup Obsidian & Plugins — macOS *(coming soon)*
- [Claude Code Documentation](https://github.com/anthropics/claude-code)
- [SpecKit Documentation](.specify/memory/)
- [Project Rules](.claude/rules/)

> **Note:** This document covers Python venv setup only. For the complete SpecKit tooling setup, see the [SpecKit Setup Guide](../speckit-setup-guide.md).

---

**Questions?** Contact the team lead or check project docs in `.specify/memory/`
