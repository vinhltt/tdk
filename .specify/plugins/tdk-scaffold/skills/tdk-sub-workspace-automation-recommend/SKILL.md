---
name: tdk-sub-workspace-automation-recommend
description: "Recommend skills and agents for one selected sub-workspace from arc42-lite docs, dependency policy, official docs, local installed skill catalog, and direct community skill lookup."
user-invocable: true
argument-hint: "--sub-workspace <name> [--no-community-search]"
metadata:
  version: "3.0.0"
  author: "VinhLTT"
  category: scaffold
---

# tdk-sub-workspace-automation-recommend

Recommend skills and agents for one selected sub-workspace. Do not support `--all`; recommendation needs narrow context and enough reasoning space.

Output path:

```text
.specify/configurations/automation-recommendations/sub-workspaces/<name>/automation-recommendation.md
```

## When To Use

- After `/tdk-sub-workspace-docs --sub-workspace <name>` or `--all` has generated docs.
- Before `/tdk-scaffold-from-recommendation`.
- When the user wants automation tailored to one workspace, not a project-wide average.

## Args

| Flag | Notes |
|---|---|
| `--sub-workspace <name>` | Required. Select exactly one configured sub-workspace. |
| `--no-community-search` | Skip direct community lookup through `npx skills find` or skills.sh. |

## Evidence Sources

Read only evidence for the selected sub-workspace unless a project-level artifact is explicitly listed here:

- `.specify/.specify.json` for `subWorkspaces[]`, `docs.path`, and selected sub-workspace metadata.
- `<docsPath>/sub-workspaces/<name>/README.md`
- `<docsPath>/sub-workspaces/<name>/architecture.md`
- `<docsPath>/sub-workspaces/<name>/interfaces.md`
- `<docsPath>/sub-workspaces/<name>/engineering.md`
- `.specify/configurations/workspace-dependency-policy/workspace-dependency-policy.md`
- Existing local installed skill catalog from the current session and `.specify/plugins/**/skills/*/SKILL.md`.
- Existing local agents from `.specify/plugins/**/agents/*.md`.
- Official docs and primary sources for the detected tech stack.
- Direct community skill lookup using `npx skills find` and skills.sh when community search is enabled.

Do not use `ck:find-skills`. Use direct CLI/site lookup only, and summarize results as design inspiration.

## Steps

1. Validate args.
   - Require `--sub-workspace <name>`.
   - Error if `--all` is requested or implied.
   - Resolve the selected sub-workspace from `.specify/.specify.json`.

2. Read scoped docs.
   - Read `README.md`, `architecture.md`, `interfaces.md`, and `engineering.md` from the selected sub-workspace docs folder.
   - Read `workspace-dependency-policy.md` when present.
   - If the docs are missing, stop with: `Run /tdk-sub-workspace-docs --sub-workspace <name> first.`

3. Research official docs and primary sources.
   - Derive search terms from the detected language, framework, runtime, build tool, test stack, auth/data/integration libraries, and deployment surface.
   - Prefer official docs, standards, package docs, framework docs, and source repositories.
   - Log every source used in `## Official Docs And Primary Source Log`.

4. Inspect local automation inventory.
   - Use the local installed skill catalog from current session context and `.specify/plugins/**/skills/*/SKILL.md`.
   - Read likely matching local skill and agent files before recommending similar new artifacts.
   - Prefer reuse or extension when a local skill/agent already covers the need.

5. Optional community lookup.
   - Unless `--no-community-search` is set, run focused direct searches such as:

     ```bash
     npx skills find "<tech stack> <automation need>"
     ```

   - Also inspect skills.sh search results when reachable.
   - Do not install community skills during recommendation.
   - Do not use `ck:find-skills`.

6. Generate a reviewable recommendation.
   - Create the output directory.
   - If the output file exists, ask whether to overwrite or keep it.
   - Write the markdown file with YAML frontmatter and the sections below.
   - Include routing suggestions only as reviewable proposals. Do not mutate `delegate-routing.md`.

## Output Format

```markdown
---
sub_workspace: <name>
sub_workspace_path: <path from config>
source_docs_path: <docsPath>/sub-workspaces/<name>
dependency_policy: .specify/configurations/workspace-dependency-policy/workspace-dependency-policy.md
generated: <YYYY-MM-DD>
status: draft
official_docs_read:
  - <url or local source>
skill_search_queries:
  - <query>
---

# Automation Recommendation For <name>

## Sub-Workspace Context

## Evidence Inputs

## Official Docs And Primary Source Log

## Local Installed Skills Considered

## Community Skills Discovered

## Recommended Skills

### 1. <skill-name> [<priority>]
- **Purpose**:
- **Why**:
- **Inputs**:
- **Trigger**:
- **Reuse/extend**:
- **Scaffold notes**:

## Recommended Agents

### 1. <agent-name> [<priority>]
- **Purpose**:
- **Why**:
- **Model**:
- **Tools**:
- **Caller contract**:

## Routing Suggestions

### 1. <domain> -> <skill-name> [<priority>]
- **Sub-workspace**:
- **Domain**:
- **Delegates**:
- **Why**:
- **Proposal notes**:
- **Register with**: `/tdk-delegate-routing diff --proposal delegate-routing-proposal.json`, then `/tdk-delegate-routing register --proposal delegate-routing-proposal.json --yes` after review.

## Rejected Recommendations

## Scaffold Readiness

## Confidence

## Risks

## Unresolved Questions
```

## Error UX

| Symptom | Message |
|---|---|
| Missing `--sub-workspace` | `Need --sub-workspace <name>. Recommendation is one workspace at a time.` |
| Unknown sub-workspace | Show available names from `.specify/.specify.json`. |
| `--all` requested | `Do not support --all. Pick one sub-workspace for focused recommendation.` |
| Missing docs | `Run /tdk-sub-workspace-docs --sub-workspace <name> first.` |
| Official docs unavailable | Continue, but log the source failure under Risks. |
| Community lookup unavailable | Continue with local catalog + official docs, and note the skipped lookup. |

## Notes

- Recommendations are not scaffold instructions until the user reviews them and changes frontmatter to `status: approved`.
- Skills + agents only. Do not recommend hooks, MCP servers, or plugin packaging unless the selected sub-workspace evidence makes that explicitly necessary.
- Routing suggestions are optional handoff notes for scaffold. Route mutation is a separate reviewed `/tdk-delegate-routing` workflow.
- Leaving `## Routing Suggestions` empty is supported: scaffold then infers the domain from each skill's or agent's Purpose/Trigger and marks the entry `reason` as derived, which needs closer review at `diff`.
