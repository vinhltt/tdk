---
name: tdk-scaffold-from-recommendation
description: "Read approved automation recommendation markdown and scaffold SKILL.md, references stubs, agent.md files, and reviewable routing proposal artifacts."
user-invocable: true
argument-hint: "[<path-to-automation-recommendation.md>] [--dry-run] [--skills-only] [--agents-only]"
metadata:
  version: "3.0.0"
  author: "VinhLTT"
  category: scaffold
  requires:
    - tdk-sub-workspace-automation-recommend
  input_format: "[path] [flags]"
  output_format: "Scaffolded SKILL.md, references/ stubs, agent.md files, optional delegate-routing-proposal.json"
---

# tdk-scaffold-from-recommendation

Read approved recommendations and scaffold skill/agent starting points following existing TDK plugin conventions.

## When To Use

- After `/tdk-sub-workspace-automation-recommend --sub-workspace <name>` writes a recommendation.
- The user has reviewed recommendations and set `status: approved` in frontmatter.
- The user wants initial files for recommended skills or agents, plus a reviewable route proposal and the next step for getting the new skills into the route file.

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
- `references/delegate-routing-proposal-format.md`

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

## Routing handoff

Runs on every scaffold, not only when the recommendation has `## Routing Suggestions`. A scaffolded skill or agent that never reaches the route file is invisible to `/tdk-plan` and silently ignored by `/tdk-implement`.

### 1. Resolve and read the route file

Resolve `docs.path` from `.specify/.specify.json` (default `.specify/configurations`), then read this exact path with the Read tool:

```text
ROUTING_FILE = {docs.path}/custom-workflow/delegate-routing.md
```

Do not use Search, Grep, or Glob to prove the file is absent — they can return zero results for a file that exists. A missing file is a normal outcome, not an error: set `ROUTE_FILE_PRESENT = false` and continue.

If `.specify.json` is missing or unparsable, set `ROUTE_STATE_UNKNOWN = true`, skip parsing, and continue. A handoff step must never abort a scaffold that already succeeded.

Parse into `EXISTING_ROUTES[section][domain] = [delegates]` with these rules. The reason is part of each rule — keep both columns:

| # | Rule | Why |
|---|---|---|
| a | Skip lines whose first non-whitespace characters are `<!--` | The template ships commented examples such as `<!-- - implement: /your-backend-skill -->`. Reading them raw unions in delegates that do not exist. |
| b | Skip placeholder tokens: empty, `none`, `n/a`, or containing both `default` and `no delegate` — plus the pre-rename text containing both `default` and `no special skill` | The template ships `- implement: (default - no delegate)`, and `implement` is the fallback domain — without this rule the proposal fails `normalizeDelegate` on the most common path. |
| c | Prefix a skill token with `/` when it has none; keep an `@`-prefixed agent token verbatim | Matches the script's normalization; skipping it makes `diff` report differences that are not real, and rewriting `@agent` to `/agent` silently turns an executor into a toolset. |
| d | Match `##` section names and domain names case-insensitive, first match wins | `register` overwrites the first matching line, so unioning into a later duplicate throws the result away. |

A freshly seeded route file also carries `- test: /your-consumer-unit-test-skill`, which is a real token by rule (b) and will be unioned forward. Call it out at review instead of registering it silently.

### 2. Build the proposal

Run only when at least one skill or agent was scaffolded. Nothing scaffolded → write no proposal, print a status line instead.

- **From `## Routing Suggestions`:** one entry per suggestion, `reason` taken from `**Why**` and flattened to one line.
- **Derived entries:** one for every scaffolded skill or agent that no suggestion covers — including when the recommendation has no `## Routing Suggestions` section at all. "Covers" means the delegate name, normalized to `/<name>` for a skill or `@<name>` for an agent, appears in the `delegates` array of any suggestion, regardless of which `subWorkspace` or `domain` that suggestion targets.
  - `subWorkspace` = frontmatter `sub_workspace`, or `global` when absent.
  - `domain` inferred from `**Purpose**` and `**Trigger**` using the keyword table in `references/delegate-routing-proposal-format.md`.
  - `delegates` = the scaffolded skill written as `/<skill-name>`, or the scaffolded agent written as `@<agent-name>`.
  - `reason` = `Derived by scaffold from purpose; domain inferred from <keyword> keywords - verify before register.`

`reason` must be a single line with no newline; the validator rejects `[\r\n]`.

**Union `delegates` per `<subWorkspace>/<domain>`** in this order: routes already in `EXISTING_ROUTES`, then entries from suggestions, then derived delegates. Deduplicate, preserve order. Union is not optional — `register` replaces the whole line instead of appending to it, so any existing delegate missing from `delegates` is deleted from the route file, and the fallback domain `implement` is usually the busiest route.

When `ROUTE_STATE_UNKNOWN`, `EXISTING_ROUTES` is empty and the union protects nothing. Still write the proposal, which is non-mutating, and attach the unknown-state warning from step 3.

Every entry uses `operation: "register"`: `add` throws when the route already exists, which is exactly the union case, while `register` passes for both new and existing routes.

Then write the artifact:

1. Target: write `delegate-routing-proposal.json` beside the approved recommendation file.
2. Shape the proposal with `version`, `sourceRecommendation`, and `entries[]` from `references/delegate-routing-proposal-format.md`.
3. If `--dry-run`, print the recommendation-adjacent proposal path and do not write.
4. If the target exists, ask whether to overwrite or skip.
5. Never mutate `delegate-routing.md` directly. Registration is separate through `/tdk-delegate-routing diff`, `/tdk-delegate-routing register --yes`, and `/tdk-delegate-routing verify`.

### 3. Print the next step

Runs under the same condition as step 2: at least one skill or agent was scaffolded. When nothing was scaffolded, no proposal exists — skip this step.

Print the resolved path, never the `{docs.path}` placeholder.

**Route file present** — print in this order:

```bash
bun src/index.ts routing delegate diff --project-root <root> --proposal <proposal>
```

Review the operations, every `reason`, and all warnings, then:

```bash
bun src/index.ts routing delegate register --project-root <root> --proposal <proposal> --yes
bun src/index.ts routing delegate verify --project-root <root> --proposal <proposal>
```

**Route file missing** — print:

> The route file must exist at `<resolved ROUTING_FILE>` before `register` can apply anything; `register` never creates it. Seed it by copying `.specify/templates/plan/delegate-routing-template.tpl` to the resolved path, creating the parent directory too. There is no `init` action — creating the route file is a deliberate prompt step. Then continue with `diff` → review → `register --yes` → `verify`.
>
> If `diff` reports `status: "missing"`, that is this same condition: create the file, then re-run.

**`.specify.json` missing** — print both the present and missing branches above, plus this warning: the route file state could not be determined, and `.specify/.specify.json` has to be created before any of those commands will run. Every `routing delegate` subcommand resolves `docs.path` through that file and throws `Missing config: <path>` without it; no flag supplies `docs.path` on the command line. Do not abort the scaffold.

**Route file already in conflict** — if it holds two lines for the same `<section>/<domain>` with different delegate lists, `diff` fails before `register` is ever reached and the duplicate must be cleaned up by hand first. The union above can produce this state: registering rewrites the first line, after which a pre-existing duplicate line disagrees with it.

With `--dry-run`, print exactly the same next step, then `Dry run complete. No files written.`

### 4. Route scaffolded agents

Agents travel the same proposal → `diff` → `register --yes` path as skills. `normalizeDelegate` keeps an `@`-prefixed token verbatim and validates it against `^@[A-Za-z0-9][A-Za-z0-9._:-]*$`, so `@backend-agent` is a first-class delegate in `validateRoutingProposal`.

Emit each scaffolded agent into the proposal as `@<agent-name>`, using the same `subWorkspace`, domain inference, union, and `operation: "register"` rules that step 2 applies to skills. Do not hand-edit an agent into the route file to work around the proposal path.

## Summary

Print:

- Source recommendation path.
- `sub_workspace` when present.
- Files created.
- Routing proposal path when written or planned.
- Routing handoff next step — always printed when at least one skill or agent was scaffolded.
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
- Routing handoff is a separate phase; it is reviewable and non-mutating until `/tdk-delegate-routing register --yes`.
- Do not mark generated files complete just because the recommendation exists; scaffolding is only as good as the approved evidence.
