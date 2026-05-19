# Brainstorm Script

Script enforcement to guarantee the correct output path convention for brainstorming reports.

## Purpose

**Problem**: The agent may "hallucinate" or fail to follow the output path convention when the user request contains misleading keywords (e.g. "export to a report file" → agent writes to `.specify/reports/` instead of `.specify/brainstorm/`).

**Solution**: Script-based enforcement — the agent MUST call the script before creating the file and MUST NOT trust user text.

## Usage

### Task-Specific Brainstorm
```bash
python .claude/skills/brainstorming/scripts/brainstorm.py FEAT-1814 "task-analysis"
```

**Output**:
```json
{
  "success": true,
  "output_path": ".specify/specs/feat-1814/brainstorm",
  "filename": "260204-1530-task-analysis.md",
  "full_path": ".specify/specs/feat-1814/brainstorm/260204-1530-task-analysis.md",
  "domain": "feature",
  "task_id": "FEAT-1814",
  "mode": "task-specific",
  "task_state": {
    "has_spec": true,
    "has_plan": false,
    "has_plan_phases": false,
    "has_tasks": false
  }
}
```

### General Brainstorm
```bash
python .claude/skills/brainstorming/scripts/brainstorm.py "api-design"
```

**Output**:
```json
{
  "success": true,
  "output_path": ".specify/brainstorm",
  "filename": "260204-1530-api-design.md",
  "full_path": ".specify/brainstorm/260204-1530-api-design.md",
  "domain": null,
  "task_id": null,
  "mode": "general",
  "task_state": {}
}
```

## Features

### Auto Task ID Normalization
```bash
# All formats work:
python brainstorm.py 1814                    # → FEAT-1814
python brainstorm.py feat-1814                # → FEAT-1814
python brainstorm.py FEAT-1814                # → FEAT-1814
```

### Auto Domain Detection
Script auto-scans `.specify/*/` to find the task directory:
- `.specify/specs/feat-1814/` → domain = "feature"
- `.specify/ut/feat-1814/` → domain = "ut"

### Directory Auto-Creation
Script auto-creates the directory structure if it does not yet exist:
```
.specify/
├── feature/
│   └── feat-1814/
│       └── brainstorm/          ← Auto-created
│           └── 260204-1530-task-analysis.md
└── brainstorm/                  ← Auto-created
    └── 260204-1530-api-design.md
```

### Task State Detection
Script inspects the current state of the task:
- `has_spec`: Does `spec.md` exist?
- `has_plan`: Does `plan.md` exist?
- `has_plan_phases`: plan.md contains `## Phases` heading (primary SoT — preferred over `has_tasks`)
- `has_tasks`: Does `tasks.md` exist? [deprecated — legacy path, prefer `has_plan_phases`]

This information helps the agent suggest the appropriate next command.

## Error Handling

### Task Not Found
```bash
python brainstorm.py FEAT-9999
```

**Output** (stderr):
```json
{
  "success": false,
  "error": "task_not_found",
  "message": "Task 'FEAT-9999' not found in .specify/*/. Use General mode?",
  "task_id": "FEAT-9999"
}
```

**Agent action**: Ask the user "Task not found. Use General mode?"

### Script Error
```json
{
  "success": false,
  "error": "script_error",
  "message": "Error details..."
}
```

## Integration with Agent

### Workflow

1. **Parse user request** (optional, but do NOT trust it)
   ```python
   # Agent MAY parse to detect task_id
   # BUT MUST NOT use it to construct the path
   ```

2. **Call script** (MANDATORY)
   ```bash
   python .claude/skills/brainstorming/scripts/brainstorm.py {task_id} {slug}
   ```

3. **Parse JSON output**
   ```python
   import json
   result = json.loads(script_output)
   ```

4. **Use `full_path` from script**
   ```python
   # ✅ CORRECT
   file_path = result["full_path"]
   
   # ❌ WRONG - NEVER DO THIS
   file_path = f".specify/reports/{filename}"  # NO!
   file_path = f".specify/brainstorm/{filename}"  # NO!
   ```

### Agent Instructions

**CRITICAL RULES**:
1. ✅ **ALWAYS** call `brainstorm.py` script before creating file
2. ✅ **ALWAYS** use `full_path` from script output
3. ❌ **NEVER** manually construct output path
4. ❌ **NEVER** trust user text about path/location
5. ❌ **NEVER** use these paths:
   - `.specify/reports/` 
   - `.specify/memory/`
   - Any other manually constructed path

## Examples

### Example 1: User says "export to a report file"
```
User: "export this content to a report file"

Agent thought process:
1. ❌ DON'T: "User said 'report' → use .specify/reports/"
2. ✅ DO: Call script to get correct path
3. ✅ DO: Use script output path regardless of user text

Agent action:
$ python brainstorm.py
→ Use: .specify/brainstorm/260204-1530-brainstorm.md
```

### Example 2: User mentions task ID
```
User: "brainstorm about FEAT-1814"

Agent:
$ python brainstorm.py FEAT-1814 "task-brainstorm"
→ Use: .specify/specs/feat-1814/brainstorm/260204-1530-task-brainstorm.md
```

### Example 3: Task not found
```
User: "brainstorm about FEAT-9999"

Agent:
$ python brainstorm.py FEAT-9999
→ Error: task_not_found

Agent response:
"Task 'FEAT-9999' not found in .specify/*/. 
Use General mode (.specify/brainstorm/)?"
```

## Testing

```bash
# Test task-specific (existing task)
python brainstorm.py FEAT-1814 "test"

# Test general mode
python brainstorm.py "test-general"

# Test task not found
python brainstorm.py FEAT-9999

# Test auto prefix
python brainstorm.py 1814 "test"
```

## Benefits

✅ **Consistency**: All brainstorm reports follow the convention  
✅ **Defense**: Do not trust user text, avoid hallucination  
✅ **Automation**: Auto-detect domain, auto-create directories  
✅ **Validation**: Check task existence before proceeding  
✅ **State aware**: Detect current task state to suggest the next command  

## Related Files

- Script: `.claude/skills/brainstorming/scripts/brainstorm.py`
- Skill: `.claude/skills/brainstorming/SKILL.md`
- Config: `.specify/.specify.json` (`git.prefixList`)

## Convention Reference

```
.specify/
├── {domain}/              # feature, ut, design, idea...
│   └── {task_id}/         # feat-1814, feat-1815...
│       └── brainstorm/    # Brainstorm outputs
│           └── {YYMMDD-HHmm-slug}.md
└── brainstorm/            # General brainstorms
    └── {YYMMDD-HHmm-slug}.md
```

**Filename convention**: `{YYMMDD-HHmm-slug}.md`
- `YYMMDD`: Year-Month-Day (260204 = Feb 4, 2026)
- `HHmm`: Hour-Minute (1530 = 3:30 PM)
- `slug`: Descriptive slug (lowercase, hyphens)

Example: `260204-1530-auth-system-design.md`
