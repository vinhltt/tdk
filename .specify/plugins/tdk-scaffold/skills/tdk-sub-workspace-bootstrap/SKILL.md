---
name: tdk-sub-workspace-bootstrap
description: "This skill should be used when the user asks to \"bootstrap sub-workspaces\", \"set up skills and agents for every sub-workspace\", or wants \"one command after config apply\". Runs docs, recommendation, scaffold, and route registration for every configured sub-workspace without questions, creates only missing artifacts, and writes a bootstrap report to review afterwards."
user-invocable: true
argument-hint: "[--sub-workspace <name>]"
metadata:
  version: "3.2.0"
  author: "VinhLTT"
  category: scaffold
  requires:
    - tdk-sub-workspace-docs
    - tdk-sub-workspace-automation-recommend
    - tdk-scaffold-from-recommendation
    - tdk-delegate-routing
---

# tdk-sub-workspace-bootstrap

Bring every configured sub-workspace from config to a routed set of docs, skills, and agents in one unattended run.
Review happens afterwards, from the report, not through questions during the run.

## Principle

1. Running this command is the consent to create every missing artifact it covers.
2. A step runs only when its output is missing and its input is ready. Never modify, overwrite, or delete existing bytes; the only exceptions are appending a new section to the route file, scaffold recording its own `scaffold-outcome.json` again, and rewriting this command's own report.
3. When a child skill would ask a question, take its non-writing branch (keep, exclude, abort, or skip), add it to `Needs your review`, and continue.
4. Update the report after every step of every sub-workspace.

A failure in one sub-workspace is recorded in its section and never stops the others.

## Args

| Flag | Notes |
|---|---|
| `--sub-workspace <name>` | Limit the run to one configured sub-workspace. Unknown name: stop and list the configured names. |

## Paths

- `<root>`: the absolute consumer project root resolved from the active session.
- `<docsPath>`: `docs.path` from `.specify/.specify.json`, default `.specify/configurations`.
- Docs: `<docsPath>/sub-workspaces/<name>/`. Required files: `README.md`, `architecture.md`, `interfaces.md`, `engineering.md` (`data-flow.md` is optional).
- Recommendation: `.specify/configurations/automation-recommendations/sub-workspaces/<name>/automation-recommendation.md`. Beside it: `scaffold-outcome.json` and `delegate-routing-proposal.json`.
- Route file: `<docsPath>/custom-workflow/delegate-routing.md`.
- Report: `.specify/configurations/automation-recommendations/bootstrap-report.md`.

## 1. Preflight

Ask nothing.

- `.specify/.specify.json` must exist with a non-empty `subWorkspaces[]`; otherwise stop and print `Run /tdk-workflow-config-apply first.`
- `bun` and `repomix` must be on `PATH`; otherwise stop and print the install command (`npm install -g repomix` for repomix).
- Classify each selected sub-workspace in config order, reading only the contents of its configured path:
  - path missing → `skipped (missing path)`, with the fix: correct `subWorkspaces[].path` in `.specify/.specify.json` or create the folder;
  - no source file and no package manifest (for example only `.gitkeep`) → `deferred`: rerun once code or a manifest exists;
  - anything else → full run.
- Create the report when it does not exist; an existing report is kept and updated only as § 4 describes.
- Print the plan: N sub-workspaces, and that each full run costs a repomix pack, a scout pass, a docs writer, official-docs research, and a scaffold. Do not wait for an answer.

## 2. Docs

For each full-run sub-workspace, sequentially in the main context (the docs writer is a subagent), count the five docs files in its docs folder:

- none → run `/tdk-sub-workspace-docs --sub-workspace <name>`, one sub-workspace per call;
- all four required present → skip;
- otherwise → skip, and add the manual command `/tdk-sub-workspace-docs --sub-workspace <name>` to its review items.

A `BLOCKED` writer or any docs error is recorded, and the run moves on.

## 3. Each sub-workspace, in config order

Process sub-workspaces one at a time, so a later one can reuse artifacts an earlier one created.
Recommend and scaffold should run in a subagent when the harness supports it, given `<root>` and the exact command; otherwise run them in the main context.

1. **Recommend.** Requires the four required docs; without them, record `stopped: docs incomplete` and go to the next sub-workspace.
   No recommendation file → run `/tdk-sub-workspace-automation-recommend --sub-workspace <name> --auto --no-community-search`.
   Then read its frontmatter: `status: approved` (written by `--auto` or by a person) continues.
   Any other status stops this sub-workspace with `approve by hand, or delete the recommendation to regenerate it`.
2. **Scaffold.** Read the `Artifacts` tables under `## Executor Decisions` in the approved recommendation.
   The tables exist and hold no row with action `create`, `patch`, or `reuse` → record `scaffold: nothing to scaffold` and skip scaffold and routing.
   Otherwise run `/tdk-scaffold-from-recommendation <recommendation-path> --auto` when this run wrote the recommendation, no `scaffold-outcome.json` exists beside it, or a `create` row's source path has neither a file nor a row in that sidecar (for example after a denied write).
   Without these tables, run it on the first two conditions only.
   These never trigger a rerun on their own and stay review items: a missing file that still has a row (removed after the scaffold), a `create` row whose path its report section's scaffold line lists as `kept-unresolved` for conflicting requirements or a runtime-only twin, and a sidecar that does not parse or names another recommendation.
   Copy its outcome paths (`created`, `reused`, `kept-unchanged`, `kept-unresolved` with each reason, `skipped`) onto the section's scaffold line, each created agent's `tools` and `skills:`, and every question it skipped into the section.
3. **Routing.** `delegate-routing-proposal.json` exists and the route file has no `## <name>` heading → run `/tdk-delegate-routing register --project-root <root> --proposal <absolute-proposal-path> --auto`.
   A heading counts only as an uncommented line starting with `## `, matched case-insensitively; commented `<!-- ## … -->` examples and inline mentions do not count.
   An existing `## <name>` section is never touched, even when lines were removed from it by hand.
   A proposal that this run's scaffold did not write is still registered; its review item says it was kept from an earlier run.
   Its Auto mode runs diff, register with that diff's digest, and verify; never pass a digest yourself.
   `stale_approval` or any refused operation → record it, no retry.
   A route-conflict error → skip routing for every remaining sub-workspace and record: resolve the conflicting lines in the route file by hand, then rerun this command.

## 4. Report

Each sub-workspace section holds its outcome lines and its own `Review:` list, so the report can be rebuilt from its sections.
A section, including its `updated: <ISO-8601>` line, is rewritten only when that sub-workspace's outcome changes in this run.
When nothing changed (all outputs present, still `deferred`, or still missing), or the sub-workspace is outside `--sub-workspace`, keep its section byte-for-byte.

Layout:

1. `## Needs your review`, first. After every step, rebuild it from the project items below, then the `Review:` items of every sub-workspace section in the report, including sections kept from earlier runs:
   - when `.omp/` exists at `<root>` and any section lists a created skill, created agent, or registered route: `routes registered but OMP bindings missing`, followed by the `convert-flat` commands or the TDK source checkout prerequisite, resolved by the rule in `/tdk-scaffold-from-recommendation` § Routing handoff;
   - when any section lists a registered route: `/tdk-plan <TASK_ID> --refresh-routing` for each existing plan with a `todo` phase.
2. One `## <name>` section per sub-workspace: `updated`, status, one line per step (docs, recommendation, scaffold, routing) with outcome and paths, then `Review:` with:
   - each new skill and agent, by path, and for an agent its `tools` and `skills:`;
   - `kept-unchanged` and `kept-unresolved` artifacts, and every question a child skill skipped;
   - each registered route (section, domain, delegates), marking a `derived` reason and a proposal kept from an earlier run;
   - skipped or refused routes, with the reason;
   - each artifact a scaffold rerun created while an earlier proposal or the `## <name>` route section was kept: not routed by this command, add it to that section by hand;
   - each file a scaffold rerun restored after it was removed since the last scaffold (`missing since last scaffold`);
   - `deferred`, or `thin` when the recommendation carries `evidence: thin`;
   - incomplete or blocked docs, with the manual command.

   An item leaves when the user deletes it from its section after review, or when the sub-workspace is processed again and the item no longer applies.
   Keep each section to paths and outcomes; details stay in the child skill output.
3. `## How to give feedback`:
   - edit any generated file directly, and delete a `Review:` item from its section once reviewed;
   - rerun a child skill by hand: `/tdk-sub-workspace-docs --sub-workspace <name>` takes correction feedback for existing docs, and `/tdk-scaffold-from-recommendation <recommendation-path>` without `--auto` reviews drift;
   - after implementing a spec, add feedback with `/tdk-retro-collect <TASK_ID>`; retro routes it to the recommendations, skills, or routes that need refining.

## 5. Finish

Print the report path, then:

```text
Next: review "Needs your review", then /tdk-plan
```
