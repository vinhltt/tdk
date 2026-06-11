---
name: tdk-distribute
description: "Distribute common .specify/ files (plugins, scripts, templates) from current project to a target project. Use when bootstrapping a new project or pushing toolkit updates."
metadata:
  version: "1.0.8"
---

# tdk-distribute

One-way sync of common `.specify/` files from a source project to a target project.

## Usage

```
/tdk-distribute [--target <path-to-target-project>]
```

## Workflow

### Step 1: Resolve target path

If `--target` arg provided: use it directly.

If not provided, use `AskUserQuestion`:
- **Question**: "What is the path to the target project root?"
- Free text input (no preset options)

Validate: target project root must exist; `distribute.sh` creates or updates `.specify/` inside it.

### Step 2: Resolve source path

Auto-detect source by searching upward from CWD for `.specify/` directory.
Fallback: `git rev-parse --show-toplevel` + `/.specify`.

Inform user: `"Syncing from: {source_path}"`

### Step 3: Dry-run

Run `distribute.sh` in dry-run mode. It always prints a summary before applying changes.

```bash
bash "{source_path}/../distribute.sh" <target-project-path> --dry-run
```

### Step 4: Show dry-run summary

Review the `distribute.sh` dry-run output and present the key changed files:

```
Dry-run output from `distribute.sh` includes files that will be added/updated.
```

### Step 5: Confirm

Use `AskUserQuestion`:
- **Question**: "Proceed with sync to `{target_path}`?"
- **Options**:
  - "Yes, sync now" (Recommended)
  - "No, cancel"

If user cancels: stop here.

### Step 6: Execute sync

```bash
bash "{source_path}/../distribute.sh" <target-project-path> [--force] [--with-claude]
```

### Step 7: Report

Summarize what changed (`NEW`/`UPDATED`/`DELETED`), and note any command errors from the dry-run/execute output.

## Alternative: CLI

For direct terminal usage without Claude skill:

```bash
bash <tdk-source-root>/distribute.sh [target-path] [--with-claude] [--force] [--dry-run] [--yes] [--log-file path]
```

Interactive mode (no args) prompts for target path and options when stdin is a TTY.

## Troubleshooting

- **"No manifest.json found"**: Run `bun run manifest --write` first to generate manifest
- **"yq not found"**: Install yq or rely on hardcoded fallback include/exclude rules
- **"Permission denied"**: Check target directory permissions
- **No skill diffs shown**: Ensure `bun` is available and `bun run manifest` works
