---
name: tdk-validate-task-id
description: "Validate and normalize task ID from $ARGUMENTS or conversation context.
  Called by: tdk-consistency-check, tdk-clarify,
  tdk-implement, tdk-plan,
  tdk-specify (supports --fast mode).
  NOT user-invocable."
user-invocable: false
metadata:
  version: "4.2.1"
  category: "Validation"
  input_format: "$ARGUMENTS, host skill name, allow_infer_from_context flag"
  output_format: "TASK_ID (validated, lowercase), TASK_ID_SOURCE (arg|inferred|confirmed)"
---

## Validate or Infer Task ID

Parse `$ARGUMENTS` and resolve a valid task ID. Return `TASK_ID` and `TASK_ID_SOURCE` to the calling skill.

### 1. Parse user input

- Extract the **first argument** from `$ARGUMENTS`.
- Expected format: `[folder/]prefix-number` (e.g., `pref-001`, `aa-2`, `sub/feat-123`).

### 2. Check if task_id provided

**If first argument matches `[folder/]prefix-number`:**
- Convert to lowercase.
- Set `TASK_ID` = normalized value, `TASK_ID_SOURCE` = `arg`.
- → Done. Return to host skill.

**If missing or invalid format:**
- → Proceed to inference (step 3).

### 3. Infer from conversation context

> Skip this step if `allow_infer_from_context` is `false`. Go directly to error.

Search the current conversation for:
- Previous `/tdk-*` command executions with a task_id
- Task ID patterns mentioned (e.g., `pref-001`, `MRR-123`, `aa-2`)
- Output mentioning "Feature pref-001" or similar

**If context found** (e.g., `pref-001`):
- Use **AskUserQuestion** tool to confirm:
  ```json
  {
    "questions": [{
      "question": "No task_id provided. Use detected context '{detected_id}'?",
      "header": "Task ID",
      "options": [
        {"label": "Yes, use {detected_id}", "description": "Proceed with the detected task"},
        {"label": "No, specify another", "description": "I'll provide a different task_id"}
      ],
      "multiSelect": false
    }]
  }
  ```
- If user selects "Yes" → `TASK_ID` = detected value (lowercase), `TASK_ID_SOURCE` = `confirmed`. Return to host skill.
- If user selects "No" → Show usage, STOP.

**If NO context found:**
```
Error: task_id is required

Usage: {HOST_SKILL_NAME} <task-id>
Example: {HOST_SKILL_NAME} pref-001

No previous task context found in this conversation.
```
STOP — Do NOT proceed.

### 4. Validate format only

- Must match pattern: `[folder/]prefix-number`
- Case-insensitive (already converted to lowercase)
- **Do NOT** load config or validate prefix against `.specify.json` — that is `tdk-load-project-context`'s responsibility.

### Output Contract

Return these values to the calling skill:
- `TASK_ID` — validated, lowercase string
- `TASK_ID_SOURCE` — one of: `arg`, `inferred`, `confirmed`
