# Scenario: Greenfield Full Start, Architecture, And Workspace Layout

> **When to use**: Starting a new project and you need project inception,
> constitution, epic/spec context, architecture reports, workspace layout
> proposal, dependency policy guidance, and sub-workspace docs before implementation.

This scenario covers the full project-start chain:

```text
/tdk-greenfield-start --full
-> /tdk-constitution --init
-> /tdk-discovery
-> /tdk-specify
-> /tdk-clarify
-> /tdk-architecture-advisor
-> /tdk-workspace-layout-propose
-> /tdk-workflow-config-apply
-> /tdk-workspace-dependency-policy
-> /tdk-sub-workspace-bootstrap
```

`/tdk-sub-workspace-bootstrap` runs docs, recommendation, scaffold, and route
registration for every configured sub-workspace without asking questions. The
manual chain remains the alternative when you want to review each
recommendation before anything is scaffolded, or when `tdk-scaffold` is not
installed:

```text
/tdk-sub-workspace-docs --all
-> /tdk-sub-workspace-automation-recommend --sub-workspace <name>
-> review the recommendation, set status: approved
-> /tdk-scaffold-from-recommendation <recommendation-path>
-> /tdk-delegate-routing diff, then register
```

The chain has two different artifact classes:

- **Project-level artifacts**: inception, constitution/memory, architecture,
  workspace layout, dependency policy, sub-workspace docs, automation
  recommendations, and the skills, agents, and routes scaffolded from them.
- **Feature/epic artifacts**: discovery, `spec.md` with embedded quality gate,
  and clarifications.

Important gate: `/tdk-workflow-config-apply` previews first and asks before it
writes config. On a fresh project, approve the guarded apply before
`/tdk-sub-workspace-bootstrap` or `/tdk-sub-workspace-docs --all`; both only
work when `.specify/.specify.json` already has configured `subWorkspaces[]`.

## One-Command Path

`/tdk-project-bootstrap` runs most of this chain in one command, with one config
question:

```text
/tdk-project-bootstrap "Project brief..."
```

It runs `/tdk-greenfield-start` with its interview, then
`/tdk-architecture-advisor`, `/tdk-workspace-layout-propose`, a config gate that
runs the same guarded CLI apply that `/tdk-workflow-config-apply` wraps, memory
with inferred domains, `/tdk-constitution --init --auto`, the sub-workspace step,
and a root `AGENTS.md`. It seeds a minimal `.specify/.specify.json` when neither
a JSON nor a YAML config exists. The brief, or a markdown file inside the
workspace, is required unless `project-inception.md` already exists and is not
`not-ready`, so after a halt at that point pass the brief again: the last line
is then `Next: fix the listed items, then rerun /tdk-project-bootstrap <brief>`.

It does not run `/tdk-discovery`, `/tdk-specify`, `/tdk-clarify`, or
`/tdk-workspace-dependency-policy`; run those yourself afterwards. Review
`.specify/configurations/inception/project-bootstrap-report.md`, starting with
`## Needs your review`. The gate, report, reruns, commit, and rollback work as
in [Brownfield Project Bootstrap](11-brownfield-project-bootstrap.md). Use the
step-by-step chain below when you want to review each step before the next one
runs.

## Prerequisites

- TDK is installed in the consumer project under `.specify/`.
- The harness install resolved the coupled base `tdk-core`, `tdk-inception`,
  `tdk-memory`, and `tdk-utils`. The project/workspace foundation commands
  through `/tdk-sub-workspace-docs` are packaged under `tdk-inception`; the
  follow-on `/tdk-sub-workspace-automation-recommend` command belongs to
  `tdk-scaffold`. Their names and artifact paths are unchanged.
- `/tdk-sub-workspace-bootstrap` also belongs to `tdk-scaffold`. Without that
  plugin, use the manual chain starting at `/tdk-sub-workspace-docs --all`; its
  later steps need `tdk-scaffold` as well.
- The project has a JSON `.specify/.specify.json`; workflow config apply does not create
  first-time config from scratch. The one-command path seeds a minimal one.
- `bun` is available.
- `repomix` is installed before `/tdk-sub-workspace-bootstrap` or
  `/tdk-sub-workspace-docs --all`. See the
  Prerequisites section of `.specify/docs/en/guides/setup/setup-guide.md`.

## Recommended Command Sequence

Use explicit arguments; the short chain above is only the shape.

```text
/tdk-greenfield-start "Project brief..." --full
/tdk-constitution --init .specify/configurations/inception/project-inception.md
/tdk-discovery feat-001 "Epic brief..."
/tdk-specify feat-001 "Feature or epic requirement description"
/tdk-clarify feat-001
/tdk-architecture-advisor .specify/configurations/inception/project-inception.md
/tdk-workspace-layout-propose .specify/configurations/architecture/architecture-decision.md
/tdk-workflow-config-apply
```

Review the diff/warnings shown by the skill. If the patch is approved, the skill
applies the parsed `planHash` internally. Then continue:

```text
/tdk-workspace-dependency-policy .specify/configurations/workspace-layout/workspace-layout-proposal.json
/tdk-sub-workspace-bootstrap
```

When bootstrap finishes, review
`.specify/configurations/automation-recommendations/bootstrap-report.md`,
starting with `## Needs your review`, before `/tdk-plan`. For the manual chain,
see step 10 below.

If you intentionally want policy guidance before runtime config apply, run
`/tdk-workflow-config-apply --dry-run` first, then
`/tdk-workspace-dependency-policy`, but treat the result as advisory against a
proposed layout.

## Output Map

| Step | Command | Primary output | Writes runtime config? |
|---|---|---|---|
| 1 | `/tdk-greenfield-start --full` | `.specify/configurations/inception/project-inception.md` | No |
| 2 | `/tdk-constitution --init` | `<memory root>/constitution.md`, memory index/config, Arc42 summaries, typed memory files when evidence exists | No `.specify/.specify.json` mutation |
| 3 | `/tdk-discovery <id> <brief>` | `<feature-dir>/discovery.md`, `discovery/problem.md`, `discovery/personas.md`, `discovery/mvp-scope.md` | No |
| 4 | `/tdk-specify <id> <description>` | `<feature-dir>/spec.md` with `## Specification Quality Gate` | No |
| 5 | `/tdk-clarify <id>` | Updates `<feature-dir>/spec.md` and `## Clarifications` | No |
| 6 | `/tdk-architecture-advisor` | `.specify/configurations/architecture/architecture-options.md`, `architecture-decision.md` | No |
| 7 | `/tdk-workspace-layout-propose` | `.specify/configurations/workspace-layout/workspace-layout-proposal.md`, `workspace-layout-proposal.json` | No |
| 8 | `/tdk-workflow-config-apply` | Diff/warnings review, then updated `.specify/.specify.json`, apply report, backup when approved | Yes, after confirmation |
| 9 | `/tdk-workspace-dependency-policy` | `.specify/configurations/workspace-dependency-policy/workspace-dependency-policy.md`, optional `enforcement-snippets.md` | No |
| 10 | `/tdk-sub-workspace-bootstrap` | Per configured sub-workspace: arc42-lite docs under `<docsPath>/sub-workspaces/<name>/`, `.specify/configurations/automation-recommendations/sub-workspaces/<name>/automation-recommendation.md`, missing skills and agents under `.claude/`, and a new `## <name>` section in `delegate-routing.md`; plus `.specify/configurations/automation-recommendations/bootstrap-report.md` | No `.specify/.specify.json` mutation; creates only missing artifacts |

`<feature-dir>` is resolved from project config and task ID. In a default setup,
it is usually under `.specify/specs/<id>/`.

## Step-By-Step Gates

### 1. Greenfield inception

```text
/tdk-greenfield-start "Project brief..." --full
```

Read `.specify/configurations/inception/project-inception.md` before continuing.
Check:

- readiness is `ready` or `ready-with-assumptions`;
- project shape classification is plausible;
- unresolved questions do not block constitution, discovery, or architecture
  work;
- recommended next route matches the project goal.

This command is intake/routing only. It does not create specs, layout files,
plans, source code, tracker issues, or `.specify/.specify.json`.

### 2. Constitution and memory authority

```text
/tdk-constitution --init .specify/configurations/inception/project-inception.md
```

This creates or updates project authority:

- `<memory root>/constitution.md`
- `<memory root>/memory-index.md`
- `<memory root>/memory.yaml`
- `<memory root>/arc42/README.md`
- `<memory root>/arc42/01-introduction-and-goals.md` through
  `12-glossary.md`
- typed memory files under `decisions/`, `risks-and-debt/`,
  `quality-requirements/`, `integrations/`, `operations/`, and `glossary/`
  when evidence exists

README and human docs are context only. Constitution and memory are stronger
authority for later commands.

### 3. Discovery

```text
/tdk-discovery feat-001 "Epic brief..."
```

Discovery is optional for small, clear feature work. Use it when the work is
broad enough that problem, personas, MVP cutline, or product-level signals need
separate context.

Output:

- `<feature-dir>/discovery/problem.md`
- `<feature-dir>/discovery/personas.md`
- `<feature-dir>/discovery/mvp-scope.md`
- `<feature-dir>/discovery.md`

Discovery does not create `UR-*`, `FR-*`, or `SC-*`; only `/tdk-specify` owns
requirement IDs.

### 4. Specify

```text
/tdk-specify feat-001 "Feature or epic requirement description"
```

Output:

- `<feature-dir>/spec.md`
- `## Specification Quality Gate` inside `<feature-dir>/spec.md`

`spec.md` is the requirement authority. It should have 9 numbered sections plus
`## Clarifications`. All `UR-*`, `FR-*`, and `SC-*` IDs belong here.

### 5. Clarify

```text
/tdk-clarify feat-001
```

Clarify updates `spec.md`; it does not create a new artifact. Gate before moving
on:

- `## 9. Unresolved Questions` is exactly `None`, or remaining questions are
  explicitly accepted as deferred.
- The `## Clarifications` session records every accepted answer.
- The relevant requirement, scope, risk, entity, or success criteria sections
  were updated, not only the Q/A log.

### 6. Architecture advisor

```text
/tdk-architecture-advisor .specify/configurations/inception/project-inception.md
```

Standard mode writes:

- `.specify/configurations/architecture/architecture-options.md`
- `.specify/configurations/architecture/architecture-decision.md`

It is report-only. It does not write ADRs, topology, specs, HLD, plans, tasks,
source code, or `.specify/.specify.json`.

Review:

- selected architecture and confidence;
- at least two rejected options;
- quality attribute scenarios;
- trust boundaries and data classification;
- kill criteria and unresolved questions.

### 7. Workspace layout proposal

```text
/tdk-workspace-layout-propose .specify/configurations/architecture/architecture-decision.md
```

Output:

- `.specify/configurations/workspace-layout/workspace-layout-proposal.md`
- `.specify/configurations/workspace-layout/workspace-layout-proposal.json`

The JSON is an authoring proposal, not runtime config. Runtime-backed fields are
limited to `architecture.type`, `subWorkspaces[]`, docs, and `modules[]`.
Implementation/test routing lives in `delegate-routing.md`: `/skills` supply the
toolset and optional `@agents` supply executors, reflected in `## Delegate Skills`
and `## Delegate Agents`. Backfill resolves only the test route; TDD resolves
test then domain routes. Fields such as `boundaryType`, `owner`, `contracts`,
`allowedDependencies`, and `routing` remain report-only unless a future schema
expansion promotes them. After canonical `.claude/` reconciliation and any OMP
source-checkout conversion, approve the routing diff and use
`/tdk-plan <id> --refresh-routing` for existing todo phases; route equality alone
does not prove executor readiness. See the [skills guide](../skills-guide.md#detailed-mode-notes).

### 8. Workflow config review and guarded apply

```text
/tdk-workflow-config-apply
```

The default mode runs the TypeScript CLI dry-run first, parses the JSON preview,
and shows:

- `planHash`
- `applyEligible`
- `requiresConfirmation`
- `confirmationFindings`
- `diff`
- `warnings`

You do not copy `planHash` manually. If you approve the shown patch, the skill
applies exactly that preview using the parsed hash. If you decline, it writes no
files.

Automation or debugging can still use the explicit two-step form:

```text
/tdk-workflow-config-apply --dry-run
/tdk-workflow-config-apply --yes --expect-hash <planHash>
```

Use `--accept-overwrites` only after explicitly approving same-name overwrites,
architecture type changes, or normalized path collisions. `--reconcile` is
report-only and cannot be combined with `--yes`.

### 9. Workspace dependency policy

```text
/tdk-workspace-dependency-policy .specify/configurations/workspace-layout/workspace-layout-proposal.json
```

Output:

- `.specify/configurations/workspace-dependency-policy/workspace-dependency-policy.md`
- `.specify/configurations/workspace-dependency-policy/enforcement-snippets.md`
  when snippets are requested or evidence supports them

This is policy/report only. It does not edit ESLint, Nx, Turborepo,
dependency-cruiser, package manager files, source folders, layout files, ADRs,
routing files, or `.specify/.specify.json`.

### 10. Sub-workspace bootstrap

```text
/tdk-sub-workspace-bootstrap
```

This requires configured `subWorkspaces[]` in `.specify/.specify.json`, with
`bun` and `repomix` on `PATH`. Add `--sub-workspace <name>` to limit the run to
one sub-workspace. For each configured sub-workspace, in config order, bootstrap
runs a step only when its output is missing:

- `/tdk-sub-workspace-docs --sub-workspace <name>` when none of the docs files
  exist;
- `/tdk-sub-workspace-automation-recommend --sub-workspace <name> --auto --no-community-search`
  when no recommendation exists; `--auto` writes it with `status: approved` and
  `approval: auto-init`;
- `/tdk-scaffold-from-recommendation <recommendation-path> --auto`, which creates
  missing skills and agents under `.claude/` and patches nothing;
- `/tdk-delegate-routing register --auto`, which adds a `## <name>` section to
  `delegate-routing.md` only when the route file has none.

Bootstrap never modifies, overwrites, or deletes existing files, apart from
appending a route section, scaffold recording its own `scaffold-outcome.json`
again, and rewriting its own report. When a child skill would
ask a question, bootstrap takes the branch that writes nothing and lists the item
for review. A failure in one sub-workspace does not stop the others. On a fresh
layout, a sub-workspace folder with no source file or package manifest is
reported as `deferred`; rerun bootstrap once code or a manifest exists. A
configured path that does not exist is reported as `skipped (missing path)`.

The report is
`.specify/configurations/automation-recommendations/bootstrap-report.md`. Read
`## Needs your review` first: it lists new skills and agents (with each agent's
`tools` and `skills:`), registered routes, skipped questions, and deferred or
incomplete sub-workspaces. Then continue with `/tdk-plan`.

"No questions" means the TDK skills ask nothing. Claude Code itself may still ask
permission before writing under `.claude/`, depending on your permission mode.

#### Manual alternative

Use this chain to review each recommendation before anything is scaffolded, or
when `tdk-scaffold` is not installed; without that plugin only
`/tdk-sub-workspace-docs --all` is available. Commands and artifact paths are the
same ones bootstrap uses.

```text
/tdk-sub-workspace-docs --all
/tdk-sub-workspace-automation-recommend --sub-workspace <name>
/tdk-scaffold-from-recommendation .specify/configurations/automation-recommendations/sub-workspaces/<name>/automation-recommendation.md
/tdk-delegate-routing diff --proposal <path-to-delegate-routing-proposal.json>
```

`/tdk-sub-workspace-docs --all` requires configured `subWorkspaces[]` in
`.specify/.specify.json` and real paths on disk. For each target, it writes or
refreshes:

- `<docsPath>/sub-workspaces/<name>/README.md`
- `<docsPath>/sub-workspaces/<name>/architecture.md`
- `<docsPath>/sub-workspaces/<name>/interfaces.md`
- `<docsPath>/sub-workspaces/<name>/data-flow.md`
- `<docsPath>/sub-workspaces/<name>/engineering.md`

The skill runs the resolver, packs code with repomix, runs scout, then delegates
writing to the `tdk-docs-writer` agent. It generates arc42-lite docs only;
it does not create PRDs, roadmap docs, or runtime config.

Run `/tdk-sub-workspace-automation-recommend --sub-workspace <name>` per
sub-workspace after docs exist. The recommendation reads the
selected sub-workspace docs, workspace dependency policy, official docs, primary
sources, local installed skills, and optional direct community lookup through
`npx skills find` or skills.sh. It does not use `ck:find-skills` and does not
support `--all`.

Review the recommendation and set `status: approved` in its frontmatter, then run
`/tdk-scaffold-from-recommendation`. It writes `delegate-routing-proposal.json`
beside the recommendation; review that proposal with `/tdk-delegate-routing diff`,
then register it with the diff's `approvalDigest` and `--yes`. See the
[skills guide](../skills-guide.md#project-inception-commands).

## What This Chain Does Not Produce

- No implementation `plan.md`
- No `tasks-breakdown/`
- No source code
- No tracker issues
- No HLD artifacts
- No ADR files by default
- No active dependency enforcement config
- No runtime config mutation until guarded layout apply uses
  `/tdk-workflow-config-apply`

## Common Failure Modes

| Symptom | Cause | Fix |
|---|---|---|
| Topology apply says missing JSON config | `.specify/.specify.json` does not exist or only YAML config exists | Create/migrate JSON config first, or run `/tdk-project-bootstrap`, which seeds a minimal JSON config when no JSON or YAML config exists |
| `--yes` is rejected | Missing `--expect-hash` in automation mode | Use no-flag interactive mode, or rerun dry-run and pass the parsed `planHash` |
| Sub-workspace docs says no sub-workspaces | Dry-run was reviewed but not applied | Run guarded workflow config apply, then rerun docs |
| Sub-workspace docs says missing path | Config points to a folder that does not exist | Create the intended folder or fix layout/config before docs |
| Dependency policy creates no snippets | No supported stack evidence or snippets not requested | Use `--suggest` after layout evidence is strong |

## Next Commands

After this scenario, choose the next path:

| Goal | Next command |
|---|---|
| Produce parent epic design docs from epic PRD | `/tdk-epic-hld feat-001` |
| Turn epic PRD + HLD into child spec seeds | `/tdk-task-breakdown feat-001` |
| Build implementation plan directly | `/tdk-plan feat-001` |
| Start implementing after a plan exists | `/tdk-implement feat-001` |
