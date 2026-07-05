---
name: tdk-scaffold-from-recommendation
description: "Read approved automation recommendation markdown and scaffold SKILL.md, references stubs, agent.md files, and reviewable routing proposal artifacts."
user-invocable: true
argument-hint: "[<path-to-automation-recommendation.md>] [--dry-run] [--skills-only] [--agents-only]"
metadata:
  version: "2.1.0"
  author: "VinhLTT"
  category: scaffold
  requires:
    - tdk-sub-workspace-automation-recommend
  input_format: "[path] [flags]"
  output_format: "Scaffolded SKILL.md, references/ stubs, agent.md files, optional plan-skill-routing-proposal.json"
---

# tdk-scaffold-from-recommendation

Read approved recommendations and scaffold skill/agent starting points following existing TDK plugin conventions.

## When To Use

- After `/tdk-sub-workspace-automation-recommend --sub-workspace <name>` writes a recommendation.
- The user has reviewed recommendations and set `status: approved` in frontmatter.
- The user wants initial files for recommended skills or agents, plus a reviewable route proposal when the recommendation includes routing suggestions.

## Prerequisites

- A recommendation file exists in one of the supported paths.
- The file has `status: approved`, or the user explicitly approves proceeding anyway.
- The recommendation contains reviewed recommendations under `## Recommended Skills`, `## Recommended Agents`, or `## Routing Suggestions`.

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
- Parse optional `## Routing Suggestions`.
- Stop if skills, agents, and routing suggestions are all empty.
- Respect `--skills-only` and `--agents-only`.

## Read Structural Exemplars

Read nearby existing files for style only:

- Skill pattern: an existing `SKILL.md` in `.specify/plugins/tdk-scaffold/skills/` or `.specify/plugins/tdk-core/skills/`.
- Agent pattern: an existing agent file in `.specify/plugins/**/agents/`.
- `references/skill-output-pattern.md`
- `references/agent-output-pattern.md`
- `references/plan-skill-routing-proposal-format.md`

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

## Scaffold routing proposal

When the approved recommendation includes route-worthy `## Routing Suggestions`:

1. Target: write `plan-skill-routing-proposal.json` beside the approved recommendation file.
2. Shape the proposal with `version`, `sourceRecommendation`, and `entries[]` from `references/plan-skill-routing-proposal-format.md`.
3. If `--dry-run`, print the recommendation-adjacent proposal path and do not write.
4. If the target exists, ask whether to overwrite or skip.
5. Never mutate `plan-skill-routing.md` directly. Registration is separate through `/tdk-plan-skill-routing diff`, `/tdk-plan-skill-routing register --yes`, and `/tdk-plan-skill-routing verify`.

## Summary

Print:

- Source recommendation path.
- `sub_workspace` when present.
- Files created.
- Routing proposal path when written or planned.
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
- Scaffold routing proposal is a separate phase; it is reviewable and non-mutating until `/tdk-plan-skill-routing register --yes`.
- Do not mark generated files complete just because the recommendation exists; scaffolding is only as good as the approved evidence.
