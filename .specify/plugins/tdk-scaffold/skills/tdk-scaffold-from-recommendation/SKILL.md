---
name: tdk-scaffold-from-recommendation
description: "Read approved recommendation.md → scaffold SKILL.md + references/ stubs for skills and agent.md for agents, following existing TDK conventions."
user-invocable: true
argument-hint: "[<path-to-recommendation.md>] [--dry-run] [--skills-only] [--agents-only]"
metadata:
  version: "0.3.0"
  author: "VinhLTT"
  category: scaffold
  requires:
    - tdk-recommend-automations (for prerequisite recommendation.md)
  input_format: "[path] [flags]"
  output_format: "Scaffolded SKILL.md, references/ stubs, agent.md files"
---

# tdk-scaffold-from-recommendation

Read an approved `recommendation-<project>.md` file and scaffold SKILL.md + references/ stubs (skills) and agent.md (agents) following existing TDK plugin conventions.

## When to use

- After `tdk-recommend-automations` generates a recommendation file
- User has reviewed recommendations and set `status: approved` in frontmatter
- Before manually creating skill/agent boilerplate — get a structured starting point

## Prerequisites

- A `recommendation-<project>.md` file exists in `.specify/reports/`
- File has `status: approved` in YAML frontmatter
- `.specify/plugins/tdk-scaffold/` exists (this plugin is installed)

## Args

| Flag | Notes |
|------|-------|
| `<path>` | Path to recommendation.md. Default: latest `recommendation-*.md` in `.specify/reports/` |
| `--dry-run` | Show planned output without writing files |
| `--skills-only` | Scaffold only skill recommendations, skip agents |
| `--agents-only` | Scaffold only agent recommendations, skip skills |

## Steps

### 1. Resolve input file

- If `<path>` argument provided → use it directly
- Else → find latest: `ls -t .specify/reports/recommendation-*.md | head -1`
- If no file found → error: "No recommendation file found. Run tdk-recommend-automations first."

### 2. Parse and validate

- Read the file content
- Parse YAML frontmatter: extract `status`, `architecture`, `project`, `source_docs_path`
- If `status` is not `approved`:
  - Use `AskUserQuestion` with header "Status Check":
    - "Proceed anyway (status is '{status}')" / "Abort — set status to approved first"
  - If abort → stop
- Extract `## Project Context` section content for use in generation

### 3. Extract recommendations

- Parse `## Recommended Skills` section:
  - Each `### N. <name> [<priority>]` block → extract: name, priority, purpose, why, input signals, trigger, inspired-by
- Parse `## Recommended Agents` section:
  - Each `### N. <name> [<priority>]` block → extract: name, priority, purpose, why, model, tools
- If both sections empty → error: "No recommendations found in file."
- If `--skills-only` → discard agent recommendations
- If `--agents-only` → discard skill recommendations

### 4. Read structural exemplars

Read these files for structural patterns (first 50 lines each — content comes from recommendation, not exemplars):

- Skill pattern: find any SKILL.md in the same plugin or `tdk-core/skills/` → note frontmatter fields and section ordering
- Agent pattern: find any agent .md in `tdk-utils/agents/` → note frontmatter fields and section ordering

Load: `references/skill-output-pattern.md` for skill generation rules
Load: `references/agent-output-pattern.md` for agent generation rules

### 5. Scaffold skills

Skip if `--agents-only`.

For each skill recommendation:

1. Target dir: `.specify/plugins/tdk-scaffold/skills/<name>/`
2. If dir already exists → `AskUserQuestion`: "Overwrite existing `<name>`?" / "Skip"
3. If `--dry-run` → print planned path and skip write

4. Generate `SKILL.md`:
   ```yaml
   ---
   name: <name>
   description: "<purpose from recommendation>"
   user-invocable: true
   argument-hint: ""
   metadata:
     version: "0.1.0"
     author: "VinhLTT"
     category: "<architecture type from recommendation>"
   ---
   ```

   Sections to generate:
   - **When to use**: Derived from recommendation's "Why" field
   - **Prerequisites**: Derived from "Input signals" (what must exist for this skill to run)
   - **Steps**: 3-5 placeholder steps derived from purpose + trigger condition
   - **Error UX**: Table with 2-3 common error patterns
   - **Notes**: Architecture context, limitations

5. Create `references/` directory
6. If recommendation has "Input signals" describing specific data patterns → generate a stub reference file: `references/<topic-from-input-signals>.md` with section headers only

### 6. Scaffold agents

Skip if `--skills-only`.

For each agent recommendation:

1. Target: `.specify/plugins/tdk-scaffold/agents/<name>.md`
2. If file exists → `AskUserQuestion`: "Overwrite existing `<name>`?" / "Skip"
3. If `--dry-run` → print planned path and skip write

4. Generate `agents/<name>.md`:
   ```yaml
   ---
   name: <name>
   tools: Read, Grep, Glob
   description: "<purpose from recommendation>"
   model: <model from recommendation, default: sonnet>
   metadata:
     version: "0.1.0"
   ---
   ```

   Sections to generate:
   - **Role description**: From "Purpose" + "Why" fields
   - **Behavioral checklist**: 3-5 items derived from purpose
   - **Input/Output contract**: What caller provides, what agent returns

### 7. Summary

Print:
- Architecture type from recommendation
- Files created: list each path
- Count: N skills + M agents scaffolded
- Suggest: "Review generated files, then run `tdk-bump` to update plugin version and manifest"

If `--dry-run` was used → print "Dry run complete. No files written."

## Error UX

| Condition | Message |
|-----------|---------|
| No recommendation file found | "No recommendation file found. Run tdk-recommend-automations first." |
| status != approved | AskUserQuestion: proceed or abort |
| Skill/agent dir already exists | AskUserQuestion: overwrite or skip |
| Empty recommendations | "No recommendations found in file." |
| Exemplar file missing | Warn "Exemplar not found, using default patterns." Continue. |

## Notes

- Output is a starting point — generated SKILL.md files need manual refinement
- Skill generates into the same plugin (`tdk-scaffold`) by default; move to target plugin manually if needed
- No template engine — LLM generates content using reference patterns + recommendation context
- Project-level only; sub-workspace iteration is out of scope
