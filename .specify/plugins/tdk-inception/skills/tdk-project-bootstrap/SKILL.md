---
name: tdk-project-bootstrap
description: "This skill should be used when the user asks to \"bootstrap the project\", \"set up TDK for this repo\", \"onboard this repository to TDK\", \"initialize the whole project\", or wants \"one command to start\" a new or existing repository after installing TDK. Runs onboarding or inception, architecture, layout, one config confirmation, inferred memory domains, constitution, sub-workspaces, and a root AGENTS.md, then writes a review report. For sub-workspaces only, use /tdk-sub-workspace-bootstrap."
user-invocable: true
argument-hint: "[brief|file] [--brownfield|--greenfield] [--quick]"
metadata:
  version: "1.2.0"
  author: "VinhLTT"
  category: architecture-workflow
  requires:
    - tdk-brownfield-start
    - tdk-greenfield-start
    - tdk-architecture-advisor
    - tdk-workspace-layout-propose
    - tdk-memory-query
    - tdk-memory-init
    - tdk-constitution
    - tdk-sub-workspace-docs
---

# tdk-project-bootstrap

Take a repository from no TDK project knowledge to a configured project in one run: onboarding or inception, architecture, workspace layout, config, memory domains, constitution, sub-workspaces, and a root `AGENTS.md`.
Review happens afterwards, from the report, not through questions during the run.

## Principle

1. Running this command is the consent to create every missing artifact it covers.
2. A step runs only when its output is missing and its input is ready. This command never modifies, overwrites, or deletes existing bytes itself; the only exceptions are the config apply that the gate confirms and rewriting this command's own report. Child skills keep their own write rules.
3. When a child skill would ask a question, take its non-writing branch (keep, exclude, abort, or skip), add it to `Needs your review`, and continue. The config gate is the only question this command asks (asked once more only when the config changes between preview and apply); `/tdk-greenfield-start` keeps its own interview, and a memory root outside the repository may add tdk-memory's own one-time consent.
4. Update the report after every step.

The project root is the session working directory; when a child skill would ask for it, pass that directory instead of asking.
This command seeds a minimal `.specify/.specify.json` when no config exists (§1); `/tdk-workflow-config-apply` still never creates one.
A failed step is recorded with its fix and never stops later steps that do not depend on it. Rerunning resumes: every step skips when its output exists, and an edited file is used as is. To regenerate a file, delete it and every later file in its chain: the onboarding or inception report, then the recovery or decision, then the proposal JSON and md.
**Halt** means: skip every remaining step of §2–§7, then run §8 and §9.

## Args

| Arg | Notes |
|---|---|
| `[brief\|file]` | Greenfield input: an inline brief or a markdown file inside the workspace. Brownfield ignores it and the report says so. |
| `--brownfield`, `--greenfield` | Override the detected mode. Passing both stops and lists them. |
| `--quick` | Passed to `/tdk-greenfield-start` only; brownfield ignores it and the report says so. |

Any other flag stops and lists the valid ones.

## Paths

- Report: `.specify/configurations/inception/project-bootstrap-report.md`.
- Onboarding: `.specify/configurations/inception/brownfield-onboarding.md`. Inception: `.specify/configurations/inception/project-inception.md`.
- Architecture: `.specify/configurations/architecture/architecture-recovery.md` (brownfield) or `architecture-decision.md` (greenfield).
- Layout proposal: `.specify/configurations/workspace-layout/workspace-layout-proposal.json` and `.md`.

## 1. Preflight

Ask nothing. Run the read-only checks before any write:

1. **Mode.** A mode flag wins; else reuse the mode recorded in an existing report; else brownfield when code or a package manifest exists outside `.specify/`, `.claude/`, `.codex/`, `.agents/`, `.omp/`, `.cursor/`, `.github/`, `.git/`, `node_modules/`, and `docs/`, otherwise greenfield. Greenfield without a brief stops here with the usage line and writes nothing, unless the inception report already exists and is not `not-ready`.
2. **Install.** `.specify/` must be installed and `bun` on `PATH`; otherwise stop with the install hint.
3. **Config seed.** When neither `.specify/.specify.json` nor `.specify/.specify.yaml` exists, write `.specify/.specify.json` with exactly these keys:

   ```json
   {
     "$schema": "./schemas/specify.schema.json",
     "version": "1.0",
     "name": "<repository folder name>",
     "git": { "mainBranch": "<main branch>", "prefixList": "feat" },
     "specs": { "defaultFolder": "feature", "ticketFormat": "^([a-zA-Z]+/)?([a-zA-Z]+)-([0-9]+)$" }
   }
   ```

   `git.mainBranch` is the branch name from `git symbolic-ref refs/remotes/origin/HEAD` without the `refs/remotes/origin/` prefix, else the current branch, else `master`. Never seed `architecture` or `subWorkspaces`, and do not copy `.specify.json.example`: it carries sample sub-workspaces. Rollback of a seeded file is deleting it.
   When only `.specify/.specify.yaml` exists, do not seed: the CLI reads JSON first, so a new JSON would silently shadow the YAML. Skip the config gate and §6, add the YAML-to-JSON migration to the report, and continue.
4. **Report.** Create it when missing. On a rerun keep the lines and review items of every step that skips; rewrite only the lines of steps that run. Then add the warnings: `repomix` missing on `PATH`, and an ignored brief or `--quick`.

## 2. Pipeline

Brownfield:

1. `/tdk-brownfield-start --full`. Skip when an onboarding report from `--full` exists and its `Readiness Status` is not `not-ready`. A `not-ready` report is run again; that skill regenerates its own report, so its review item says to resolve gaps in the repository or README, not in the report. Still `not-ready`: list the missing items and halt. Each question it would ask (evidence conflicts, missing safe context, low-confidence decisions) becomes an unresolved question with confidence Low.
2. `/tdk-architecture-advisor --recover-existing <onboarding>`. Skip when the recovery exists. Never write `architecture-decision.md`.
3. `/tdk-workspace-layout-propose --from-existing <recovery>`. Skip when the proposal JSON exists. A desired-state change that needs acceptance stays in the proposal md, never in the JSON; list it in the report.

Greenfield:

1. `/tdk-greenfield-start <brief>`, plus `--quick` when given, with its interview. Same readiness skip and halt rule as brownfield. When it cannot ask (headless or subagent), every unanswered question becomes a missing item and its readiness status decides.
2. `/tdk-architecture-advisor <inception>`. Skip when `architecture-decision.md` exists.
3. `/tdk-workspace-layout-propose <decision>`. Skip when the proposal JSON exists.

Run the advisor and layout steps in a subagent when the harness supports it. Give it the project root, the exact command, and: ask nothing, take each non-writing branch, return every skipped question.

## 3. Config gate

Call the CLI directly instead of `/tdk-workflow-config-apply`, so this command keeps its single question. Run from `.specify/scripts/ts` with a workspace-relative or absolute proposal path.

1. No proposal JSON, a YAML-only config, or an empty `subWorkspaces[]` in the proposal: skip config and the sub-workspace step without calling the CLI. For an empty array, list the proposal's `architecture.type` as not applied, with `/tdk-workflow-config-apply` to apply it by hand.
2. `bun src/index.ts config topology apply --dry-run --topology <proposal-json>`, then parse the JSON on stdout. A non-zero exit or non-JSON stdout: skip config and the sub-workspace step, record the error line, continue.
3. The last line of `diff` is exactly ` no changes`: already applied, continue without asking.
4. `applyEligible` is not `true`: skip config and §6, and record why.
5. Otherwise ask exactly one `AskUserQuestion`: each sub-workspace with name, path, and confidence (from the proposal md), and every `confirmationFindings` and `warnings` item. Options: `Apply` and `Stop to edit the proposal`. With findings, the only apply option is `Apply including overwrites`, which adds `--accept-overwrites`. Any other answer is Stop.
6. Apply with `--yes --expect-hash <planHash>`. Exit 2 (stale plan): repeat steps 2–5 once; a second exit 2 is Stop. Exit 1 or 3 (validation, lock, or backup failure): record the stderr line, including any lock path to clear, then Stop.
7. Stop, or no way to ask (headless or subagent): write the step 5 summary and its options into the report, list the proposal JSON and md with the onboarding and recovery (or inception and decision) files, add the regeneration rule (delete a file and every later file in its chain; an edited file is used as is), then halt.

The applied config is `.specify/.specify.json` after this gate applied it or reported ` no changes`; every other outcome skips §6.
When config is skipped for any reason other than an empty `subWorkspaces[]`, add to `Needs your review` that the `AGENTS.md` and constitution this run creates leave out the sub-workspaces: after applying the config, delete that `AGENTS.md` and rerun, and update the constitution with `/tdk-constitution`.

## 4. Memory

Run in the main session; when this command itself runs in a subagent, skip §4 and §5 and list them as manual steps. `tdk-memory-query` missing from the skill catalog: skip §4 and §5 and record the install hint.

1. `/tdk-memory-query --status`. Skip when the block lists domains. On `domains: unknown`, skip §4 and record it. On a `status: error` other than `root-missing`, or no status block, skip §4 and §5 and record the error line.
2. Infer business domains from the onboarding or inception report, README, and docs; the applied config and the proposal md (not the recovery) only locate where each domain lives. A business domain is a business concept the sources name, such as orders or billing; what the code does technically, such as parsing, formatting, or logging, is not one, so a purely technical library or tool has no domain. Never use a package, sub-workspace, or folder name as a domain name, and drop names that are exactly `infra`, `utils`, `common`, `shared`, `base`, `core`, or `helpers`.
3. Pass every block in one `/tdk-memory-init` call, with the opening marker as the first non-blank line:

   ```text
   ===TDK-MEMORY-DOMAIN===
   domain: <kebab-case name>
   provenance: inferred
   sourceFiles:
   - <workspace-relative path>
   evidence: <one line from the source>
   ===END-DOMAIN===
   ```

   Check every block against the tdk-memory-init detection rules first: unindented lines, both markers, a kebab-case name, `provenance: inferred`, at least one workspace-relative path without `..`, a non-empty one-line evidence, no other key or line, and no domain twice. Move a failing block to `Needs your review` instead of passing it, because one near-miss block sends the whole input to the interview.
4. No domain left: do not call it; the report gives `/tdk-memory-init` as the manual step.
5. Copy its `Result:` lines into the report. No `Result:` line at all: record the memory step as failed with the rerun command, and claim no domain. `Result: error: external-root-consent-required`: skip §5 too, so the consent is not asked twice.

## 5. Constitution

Run in the main session. Skip when the status block says `constitution: present`. Otherwise run `/tdk-constitution --init --auto <brief>` with one input:

- brownfield: an inline brief of about 40 lines at most, with the repository purpose and conventions from the onboarding, boundaries from the recovery, sub-workspaces from the applied config, and the paths of those three sources at the end;
- greenfield: the path of the inception report.

Copy its `Needs review` items, including README conflicts with their source and pending templates, into the report.

## 6. Sub-workspaces

Run when the applied config has a non-empty `subWorkspaces[]` and at least one of their paths exists. A sub-workspace whose path does not exist yet is listed as `deferred`. When none of the paths exists, as after a fresh greenfield layout, skip this step, call no child command, and give `/tdk-sub-workspace-bootstrap` in the report as the step to run once a folder holds code.

- With `tdk-scaffold` installed: check `bun` and `repomix` on `PATH` first. Either missing: skip, and record the missing binary, `npm install -g repomix`, and the rerun command, because the `/tdk-sub-workspace-bootstrap` preflight stops before writing its report. Otherwise run `/tdk-sub-workspace-bootstrap` and link the `Needs your review` section of its report.
- Without `tdk-scaffold`: `repomix` missing skips this step the same way. For each existing path, count the docs files under `<docsPath>/sub-workspaces/<name>/` (`docs.path`, default `.specify/configurations`): none → run `/tdk-sub-workspace-docs --sub-workspace <name>`; otherwise skip, and add that command to `Needs your review` when any of `README.md`, `architecture.md`, `interfaces.md`, or `engineering.md` is missing.

## 7. AGENTS.md

Follow `references/agents-md-contract.md`.

## 8. Report

1. `## Needs your review`, first: the gate decision; confidence and unresolved questions of the recovery or inception; inferred domains and how to correct them (edit the domain overview under the status block's `memory_path`, or rerun `/tdk-memory-update`); blocks moved out of the memory call; README conflicts; pending templates; the `AGENTS.md` and `CLAUDE.md` outcome; OMP items; each failed or halted step with its fix. An item leaves when the user deletes it or a rerun finds it no longer applies.
2. The mode, then one line per step: outcome, paths, and an ISO-8601 timestamp.

Write every path in the report workspace-relative, except a memory root outside the repository; in copied error lines, replace the workspace root with `.`.
3. `## How to add a sub-workspace later`: this command does not detect new sub-workspaces on rerun. Run `/tdk-workspace-layout-propose --from-existing <architecture-recovery.md>` (greenfield: `/tdk-workspace-layout-propose <architecture-decision.md>`), then `/tdk-workflow-config-apply`, then `/tdk-sub-workspace-bootstrap` (without tdk-scaffold: `/tdk-sub-workspace-docs --sub-workspace <name>`).
4. `## Rollback`: a seeded config is deleted; an applied config uses the backup and revert command in `.specify/configurations/workspace-layout/topology-apply-report.md`; repository files use git; memory outside the repository uses its own repository history; the sub-workspace step follows the rollback in its own report.

## 9. Finish

Print the report path, then the next line. After a halt:

```text
Next: fix the listed items, then rerun /tdk-project-bootstrap
```

In greenfield mode, while the inception report is missing or `not-ready`, end that line with ` <brief>`.

Otherwise:

```text
Next: review "Needs your review", then /tdk-plan
```
