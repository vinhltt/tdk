---
name: tdk-load-project-context
description: "Load project configuration and resolve feature directory from validated TASK_ID.
  Called by: tdk-analyze, tdk-clarify,
  tdk-implement, tdk-plan,
  tdk-specify (supports --fast mode).
  NOT user-invocable."
user-invocable: false
metadata:
  version: "3.0.1"
  category: "Configuration"
  input_format: "Validated TASK_ID, require_feature_dir flag (default true), require_prefix_validation flag (default true)"
  output_format: "PROJECT_CONTEXT object, FEATURE_DIR path"
---

## Load Project Context

Receive a validated `TASK_ID` from the calling skill (output of `tdk-validate-task-id`). Load project configuration and resolve the feature directory.

### 1. Run config detection

Execute from repo root:
```bash
bash -lc '
PROJECT_DIR="$1"
if [ -z "$PROJECT_DIR" ] || [ ! -d "$PROJECT_DIR/.specify/scripts/ts" ]; then
  echo "Invalid project root: $PROJECT_DIR" >&2
  exit 1
fi
(cd "$PROJECT_DIR/.specify/scripts/ts" && bun src/commands/detect-config.ts)
' -- "<agent-resolved-project-root>"
```

The agent must resolve `<agent-resolved-project-root>` from the active coding harness/session before running the command. Ask the user for the project root if it is unclear; do not pass the placeholder literally.

Parse JSON output into `PROJECT_CONTEXT`.

### 2. Process config result

**If `PROJECT_CONTEXT.configFound` is `true`:**
- Store `PROJECT_NAME`, `PROJECT_PATH`, `METADATA` for context.
- Read each file in `RULES_FILES` array.
- Apply `INLINE_RULES` to generation guidelines.
- Use `METADATA` (language, framework) for tech-specific guidance.

**If `PROJECT_CONTEXT.configFound` is `false`:**
- Continue with defaults (backward compatible).

**If a rules file is not found:**
- Warning: `Rule file not found: {path}` — continue without it.

### 3. Validate prefix against config

> Skip this step if `require_prefix_validation` is `false`.

- Extract prefix from `TASK_ID` (part before the number).
- Check prefix is in `PROJECT_CONTEXT.featureEnv.prefixList` (from `.specify.json`).
- If prefix not found → WARNING (non-blocking), inform user.

### 4. Resolve feature directory

> Skip this step if `require_feature_dir` is `false`.

- Default folder from `PROJECT_CONTEXT.featureEnv.defaultFolder` (fallback: `feature`).
- Pattern: `.specify/{folder}/{task-id}/`
- If directory not found → ERROR, suggest running `/tdk-specify` first.

### Output Contract

Return these values to the calling skill:
- `PROJECT_CONTEXT` — full config object (PROJECT_NAME, METADATA, RULES_FILES, INLINE_RULES, FEATURE_ENV, TEST_CONFIG)
- `FEATURE_DIR` — resolved absolute path to the feature directory (when `require_feature_dir` is `true`)

### Project Context Reference

After loading, the calling skill has access to:
- Project: `{PROJECT_NAME}`
- Language: `{metadata.language}`
- Framework: `{metadata.framework}`
- Rules: Applied from `RULES_FILES` and `INLINE_RULES`
