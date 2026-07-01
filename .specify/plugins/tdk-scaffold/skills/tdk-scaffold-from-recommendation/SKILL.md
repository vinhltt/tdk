---
name: tdk-scaffold-from-recommendation
description: "Read approved automation recommendation markdown and scaffold SKILL.md plus references stubs for skills and agent.md files for agents."
user-invocable: true
argument-hint: "[<path-to-automation-recommendation.md>] [--dry-run] [--skills-only] [--agents-only]"
metadata:
  version: "2.0.0"
  author: "VinhLTT"
  category: scaffold
  requires:
    - tdk-sub-workspace-automation-recommend
  input_format: "[path] [flags]"
  output_format: "Scaffolded SKILL.md, references/ stubs, agent.md files"
---

# tdk-scaffold-from-recommendation

Read approved recommendations and scaffold skill/agent starting points following existing TDK plugin conventions.

## When To Use

- After `/tdk-sub-workspace-automation-recommend --sub-workspace <name>` writes a recommendation.
- The user has reviewed recommendations and set `status: approved` in frontmatter.
- The user wants initial files for recommended skills or agents.

## Prerequisites

- A recommendation file exists in one of the supported paths.
- The file has `status: approved`, or the user explicitly approves proceeding anyway.
- The recommendation contains reviewed recommendations under `## Recommended Skills` or `## Recommended Agents`.

## Args

| Flag | Notes |
|---|---|
| `<path>` | Optional explicit recommendation markdown path. |
| `--dry-run` | Show planned output without writing files. |
| `--skills-only` | Scaffold skills only. |
| `--agents-only` | Scaffold agents only. |

## Resolve Input File

Prefer the new per-sub-workspace output path:

```text
.specify/configurations/automation-recommendations/sub-workspaces/*/automation-recommendation.md
```

Keep old fallback paths:

```text
.specify/reports/recommendation-*.md
.specify/configurations/automation-recommendations/recommendation-*.md
```

If no file is found, error: `No recommendation file found. Run /tdk-sub-workspace-automation-recommend --sub-workspace <name> first.`

## Parse And Validate

Parse YAML frontmatter. Known fields include:

- `status`
- `architecture`
- `project`
- `source_docs_path`
- `sub_workspace`
- `sub_workspace_path`
- `dependency_policy`
- `official_docs_read`
- `skill_search_queries`

If `status` is not `approved`, ask:

- `Proceed anyway`
- `Abort - set status: approved first`

Default to abort. Scaffolding writes should happen only after reviewed recommendations.

## Extract Recommendations

- Parse `## Recommended Skills`.
- Parse `## Recommended Agents`.
- Stop if both are empty.
- Respect `--skills-only` and `--agents-only`.

## Read Structural Exemplars

Read nearby existing files for style only:

- Skill pattern: an existing `SKILL.md` in `.specify/plugins/tdk-scaffold/skills/` or `.specify/plugins/tdk-core/skills/`.
- Agent pattern: an existing agent file in `.specify/plugins/**/agents/`.
- `references/skill-output-pattern.md`
- `references/agent-output-pattern.md`

Do not copy recommendation content from exemplars. Use the approved recommendation as the content source.

## Scaffold skills

Skip when `--agents-only` is set.

For each skill recommendation:

1. Target: `.specify/plugins/tdk-scaffold/skills/<name>/SKILL.md`.
2. If target exists, ask whether to overwrite or skip.
3. If `--dry-run`, print planned paths and do not write.
4. Generate frontmatter with `name`, `description`, `user-invocable`, `argument-hint`, and `metadata`.
5. Generate sections:
   - When To Use
   - Prerequisites
   - Steps
   - Error UX
   - Notes
6. Create a `references/` directory only when the recommendation needs supporting references.

## Scaffold agents

Skip when `--skills-only` is set.

For each agent recommendation:

1. Target: `.specify/plugins/tdk-scaffold/agents/<name>.md`.
2. If target exists, ask whether to overwrite or skip.
3. If `--dry-run`, print planned paths and do not write.
4. Generate frontmatter with `name`, `tools`, `description`, `model`, and `metadata`.
5. Generate sections:
   - Role
   - Behavioral Checklist
   - Input Contract
   - Output Contract

## Summary

Print:

- Source recommendation path.
- `sub_workspace` when present.
- Files created.
- Count of scaffolded skills and agents.

If `--dry-run` was used, print: `Dry run complete. No files written.`

## Error UX

| Condition | Message |
|---|---|
| No recommendation file | `No recommendation file found. Run /tdk-sub-workspace-automation-recommend --sub-workspace <name> first.` |
| Status not approved | Ask whether to proceed or abort. |
| Empty recommendations | `No recommendations found in file.` |
| Target exists | Ask overwrite or skip. |
| Exemplar missing | Warn and continue with default pattern. |

## Notes

- Output is a starting point and still requires human review.
- Scaffold skills and Scaffold agents are separate phases in the summary so users can review them independently.
- Do not mark generated files complete just because the recommendation exists; scaffolding is only as good as the approved evidence.
