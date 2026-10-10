---
name: tdk-sub-workspace-automation-recommend
description: "Recommend skills and agents for one selected sub-workspace from arc42-lite docs, dependency policy, official docs, local installed skill catalog, and direct community skill lookup."
user-invocable: true
argument-hint: "--sub-workspace <name> [--no-community-search]"
metadata:
  version: "3.0.2"
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
- `<docsPath>/sub-workspaces/<name>/data-flow.md` (optional — present only on docs generated after the five-file docs set)
- `<docsPath>/sub-workspaces/<name>/engineering.md`
- `.specify/configurations/workspace-dependency-policy/workspace-dependency-policy.md`
- `{docs.path}/custom-workflow/delegate-routing.md`, resolving `docs.path` from `.specify/.specify.json` (default `.specify/configurations`), read-only.
- Existing local installed skill catalog from the current session, `.claude/skills/*/SKILL.md`, and `.specify/plugins/**/skills/*/SKILL.md`.
- Existing agents from `.claude/agents/*.md` (canonical consumer source), `.omp/agents/*.md` (runtime bindings), and `.specify/plugins/**/agents/*.md` (TDK-shipped).
- Official docs and primary sources for the detected tech stack.
- Direct community skill lookup using `npx skills find` and skills.sh when community search is enabled.

Do not use `ck:find-skills`. Use direct CLI/site lookup only, and summarize results as design inspiration.

## Steps

1. Validate args.
   - Require `--sub-workspace <name>`.
   - Error if `--all` is requested or implied.
   - Resolve the selected sub-workspace from `.specify/.specify.json`.

2. Read scoped docs.
   - Read `README.md`, `architecture.md`, `interfaces.md`, and `engineering.md` from the selected sub-workspace docs folder. Also read `data-flow.md` when present — it is optional and its absence never blocks the run.
   - Read `workspace-dependency-policy.md` when present.
   - If any of the four required docs (`README.md`, `architecture.md`, `interfaces.md`, `engineering.md`) are missing, stop with: `Run /tdk-sub-workspace-docs --sub-workspace <name> first.`
   - Read the route file at its resolved exact path. Under `## Evidence Inputs`, record that path and state `missing`, `unreadable`, or `present`; for unreadable evidence, include the error under Risks and leave affected current routes unverified. Never treat unreadable as missing or empty.

3. Research official docs and primary sources.
   - Derive search terms from the detected language, framework, runtime, build tool, test stack, auth/data/integration libraries, and deployment surface.
   - Prefer official docs, standards, package docs, framework docs, and source repositories.
   - Log every source used in `## Official Docs And Primary Source Log`.

4. Inspect local automation inventory.
   - Combine the current session's local installed skill catalog with `.claude/skills/*/SKILL.md` and `.specify/plugins/**/skills/*/SKILL.md`.
   - Scan `.claude/agents/*.md`, `.omp/agents/*.md`, and `.specify/plugins/**/agents/*.md`. Read frontmatter `name` and the role/input/output contract of likely matches; do not equate a guide skill with an executor or infer agent identity from filenames.
   - Record agents under `## Local Installed Skills Considered` alongside skills, with exact paths and tags: `canonical` for `.claude` consumer agents (record any same-name OMP binding), `runtime-only` for an `.omp` agent with no same-name `.claude` source, and `tdk-shipped` for plugin agents. Keep distinct same-name definitions visible; do not claim inventory alone proves the winning dispatch binding or runtime readiness.
   - Prefer reuse or a justified patch when a local artifact already covers the need. Preserve runtime-only agents: allow `reuse @name` as routing intent, but set their artifact action to `none` and note `runtime-only; promote to .claude/agents manually to manage`.
   - Evaluate each considered domain using the executor rubric below, always including `implement` and `test`. Determine toolset skills separately from the executor; allow agent-only routes and one executor serving both domains when its contract owns both gates.

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
   - Fill `## Executor Decisions` first; derive both agent recommendations and routing suggestions from these decisions, not keyword matching alone.
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


## Executor Decisions

### <domain>
- **Applicable**: <yes/no — evidence-backed reason; always include implement and test>
- **Current route**: <quote the exact matching route line(s); none (route file missing); none (no matching route); or unverified (route file unreadable)>
- **Toolset**: <ordered /skill-name list, or none for an agent-only route>
- **Executor**: <reuse @name | create @name | no agent>
- **Evidence**: <exact files read and the bounded-write-set + qualifying criterion, or failed criterion for no agent>
- **Write set**: <bounded path globs, or none>
- **Context isolation benefit**: <specific benefit, or none>
- **Gate ownership**: <who runs build, tests, and Test Quality Gate; caller retains gate approval and status transitions>
- **Caller inputs**: <phase path/number, working-root mapping, declared write boundary, ordered skill locators/load methods, gate commands and success criteria as applicable>
- **Status output**: <executor emits exactly one literal Status: DONE, Status: DONE_WITH_CONCERNS, Status: BLOCKED, or Status: NEEDS_CONTEXT; for no agent, state main-session ownership rather than inventing a child report>
- **Required tools/skills**: <effective tools and actual skills needed for this domain; record missing/unverified loading evidence, never infer readiness from frontmatter>
- **Artifacts**:

  | kind | name | source path | action | harness bindings | notes |
  |---|---|---|---|---|---|
  | <skill or agent> | <delegate name> | <exact existing path or proposed .claude/skills/<name>/SKILL.md or .claude/agents/<name>.md> | <create, reuse, patch, or none> | <Claude: exact file or missing; OMP: exact file or missing> | <evidence, patch rationale, or runtime-only preservation note> |

Repeat for every considered domain. Include one row per delegate artifact, including each toolset skill and the executor; use `none` when the decision has no artifacts. Keep `Executor: reuse @name` for an existing executor even when its canonical artifact needs an explicitly justified `patch`.
## Routing Suggestions

### 1. <domain> [<priority>]
- **Sub-workspace**:
- **Domain**:
- **Delegates**: <ordered /skills from the decision's Toolset, followed by @executor when selected; allow agent-only and multiple delegates>
- **Why**: <cite the corresponding Executor Decision; retain the derived marker when domain selection is keyword-derived>
- **Proposal notes**: <artifact actions and unresolved bindings; do not imply a proposal is dispatch-ready>
- **Register with**: `/tdk-delegate-routing diff --proposal delegate-routing-proposal.json` → review the diff and its `approvalDigest` → `/tdk-delegate-routing register --proposal delegate-routing-proposal.json --approval <approvalDigest> --yes` → `/tdk-delegate-routing verify --proposal delegate-routing-proposal.json`. If proposal or route bytes change, rerun diff and review; never register against stale approval.

## Rejected Recommendations

## Scaffold Readiness

## Confidence

## Risks

## Unresolved Questions
```

## Executor Rubric

- Separate toolset guidance from execution responsibility. Select `reuse @name` or `create @name` only when the domain has a **bounded write set** and at least one of **own gate ownership**, **context isolation benefit**, or **distinct caller/output contract**. Cite the qualifying evidence in the decision; shared main-session gates alone do not qualify as own gate ownership.
- Prefer a suitable existing executor over creating another. A single executor may serve `implement` and `test` when it owns both gates; do not require one agent per domain.
- For `no agent`, give a one-line reason naming the failed criterion: `bounded write set` or `own gate ownership/context isolation benefit/distinct caller/output contract`. Mark non-applicable domains explicitly; a docs-only workspace may legitimately need no executor.
- Derive each routing suggestion's `Domain` and `Delegates` from its decision. Emit a suggestion for each applicable domain with a non-empty delegate list; leave non-applicable or delegate-free domains without a route. Do not invent a skill to fill an agent-only route or an agent for a skill-only decision.
- Use only `research`, `implement`, `test`, `database`, and `design` unless the decision and suggestion include an explicit rationale for another domain. When keywords inform a domain, keep `derived` in the suggestion's Why/Proposal notes so scaffold preserves it in proposal `reason`.
- List create/reuse/patch/none per artifact, not per domain. Propose new managed source artifacts only under `.claude/`; OMP bindings come from conversion, never dual-write. Inventory and recommendations are read-only except for the recommendation output.

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
- Executor contracts follow the **Executor Variant** in `../tdk-scaffold-from-recommendation/references/agent-output-pattern.md`; do not apply it to guide/reviewer agents. Honor `/tdk-implement`'s `Delegate Skill Loading Requirement`: an empty toolset needs no loader; non-empty toolsets require dispatch-keyed static readiness and actual child load receipts. OMP uses `read skill://<name>`; Claude preload and inherited `Skill` are ready only in the exercised G3 cases of the loading contract. Recommendations do not grant runtime readiness.
- Routing suggestions are reviewable handoff notes for scaffold, derived from Executor Decisions. Route mutation is a separate reviewed `/tdk-delegate-routing` workflow; never create, patch, or register routes during recommendation.
- Leaving `## Routing Suggestions` empty is supported when no applicable decision has delegates. Any keyword-derived scaffold inference still carries `derived` in proposal `reason` and needs closer review at `diff`; it must not silently override an explicit executor decision.
