---
name: tdk-distribute
description: "Distribute common .specify/ files (plugins, scripts, templates) from current project to a target project. Use when bootstrapping a new project or pushing toolkit updates."
metadata:
  version: "1.0.8"
---

# tdk-distribute

One-way sync of common `.specify/` files from a source project to a target project. Uses skill checksums from `plugin.json` per-plugin for smart diffing — only copies changed/new files.

## Usage

```
/tdk-distribute [--target <path-to-target-specify-dir>]
```

## Workflow

### Step 1: Resolve target path

If `--target` arg provided: use it directly.

If not provided, use `AskUserQuestion`:
- **Question**: "What is the path to the target project's `.specify/` directory?"
- Free text input (no preset options)

Validate: path must exist or will be created on sync.

### Step 2: Resolve source path

Auto-detect source by searching upward from CWD for `.specify/` directory.
Fallback: `git rev-parse --show-toplevel` + `/.specify`.

Inform user: `"Syncing from: {source_path}"`

### Step 3: Dry-run

Run sync script in dry-run mode (reads skill checksums from `plugin.json` directly):

```bash
python .claude/skills/tdk-distribute/scripts/sync-distribute-common-files.py \
  --source <source-specify-dir> \
  --target <target-specify-dir> \
  --config .claude/skills/tdk-distribute/sync-config.yaml \
  --dry-run [--with-claude] [--verbose]
```

### Step 4: Show dry-run summary

Parse JSON output and present to user:

```
Skills (from plugin.json):
  NEW:       tdk-distribute (0.1.0)
  UPDATED:   tdk-bump (checksum changed)
  UNCHANGED: 5 skills

Other files:
  NEW:       templates/spec-template.md.tpl (14 files)
  UPDATED:   CHANGELOG.md (1 file)
  UNCHANGED: .specify.json (1 file)
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
python .claude/skills/tdk-distribute/scripts/sync-distribute-common-files.py \
  --source <source-specify-dir> \
  --target <target-specify-dir> \
  --config .claude/skills/tdk-distribute/sync-config.yaml \
  [--with-claude] [--force]
```

### Step 7: Report

Show results: N skills synced, M files synced. Note any errors from the `errors` array in JSON output.

## Alternative: CLI

For direct terminal usage without Claude skill:

```bash
bash distribute.sh [target-path] [--with-claude] [--force] [--dry-run] [--yes] [--log-file path]
```

Interactive mode (no args) prompts for target path and options when stdin is a TTY.

## Troubleshooting

- **"No manifest.json found"**: Run `bun run manifest --write` first to generate manifest
- **"yq not found"**: Install yq or rely on hardcoded fallback include/exclude rules
- **"Permission denied"**: Check target directory permissions
- **No skill diffs shown**: Ensure `bun` is available and `bun run manifest` works
