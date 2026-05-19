---
name: tdk-sub-workspace-init
description: "Initialize a new sub-workspace configuration in the current directory"
---

## Purpose

Create a new `.specify.json` configuration file for the current sub-workspace.

## Usage

```
/sub-workspace.init [sub-workspace-name]
```

## Execution Steps

### Step 1: Determine Sub-workspace Name

1. If argument provided: use as sub-workspace name
2. If no argument: use current directory name
3. Convert to lowercase, replace spaces with hyphens

### Step 2: Check Existing Config

1. Check if `.specify/.specify.json` exists → if yes, ask user to overwrite
2. If `.specify/.specify.yaml` exists but `.specify.json` does NOT:
   - Auto-migrate: `bash .specify/scripts/bash/migrate-yaml-to-json.sh`
   - If migrate succeeds: proceed with `.specify.json`
   - If migrate fails (yq/jq missing): notify user to install required tools:
     ```
     Migration failed — required tools (yq, jq) not found.
     Run: bash .specify/scripts/bash/setup.sh
     Then retry: bash .specify/scripts/bash/migrate-yaml-to-json.sh
     ```
   - yaml file preserved on disk as legacy reference
3. If neither exists: create fresh `.specify.json`

### Step 3: Detect Sub-workspace Type

Invoke `tdk-load-project-context` with `require_feature_dir: false` and `require_prefix_validation: false`.
If `PROJECT_CONTEXT.CONFIG_FOUND` is true:
- Type = "sub-workspace" (child of workspace)
- Inherit workspace settings
If `PROJECT_CONTEXT.CONFIG_FOUND` is false:
- Type = "sub-workspace" (standalone)

### Step 4: Auto-detect Metadata

Scan current directory for:

| File | Detection |
|------|-----------|
| `package.json` | language: typescript/javascript |
| `tsconfig.json` | language: typescript |
| `pyproject.toml` | language: python |
| `go.mod` | language: go |
| `Cargo.toml` | language: rust |

Framework detection:
| Pattern | Framework |
|---------|-----------|
| `next.config.*` | nextjs |
| `vite.config.*` | vite |
| `vue.config.*` | vue |
| `angular.json` | angular |

### Step 5: Generate Config

Create `.specify/.specify.json`:

```json
{
  "version": "1.0",
  "name": "{sub_workspace_name}",
  "type": "sub-workspace",
  "docs": {
    "path": ".specify/configurations",
    "rules": []
  },
  "metadata": {
    "language": "{detected_language}",
    "framework": "{detected_framework}",
    "packageManager": "{detected_pm}",
    "testFramework": ""
  },
  "rules": [],
  "commands": {
    "test": "",
    "build": "",
    "lint": ""
  }
}
```

### Step 6: Create Docs Directory

Use DOCS_PATH from workspace config if available, otherwise default to `.specify/configurations`:

1. Create `{DOCS_PATH}/` if not exists
2. Create `{DOCS_PATH}/rules.md` from template (use `.specify/examples/rules-template.md`)

### Step 7: Output

```
Sub-workspace initialized: {sub_workspace_name}

Created:
  - .specify/.specify.json
  - {DOCS_PATH}/
  - {DOCS_PATH}/rules.md

Detected:
  - Language: {language}
  - Framework: {framework}

Next steps:
  1. Edit .specify/.specify.json to configure sub-workspace
  2. Edit {DOCS_PATH}/rules.md to add sub-workspace rules
  3. Run /sub-workspace.list to verify workspace integration
```
