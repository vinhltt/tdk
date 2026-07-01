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
-> /tdk-sub-workspace-docs --all
-> /tdk-sub-workspace-automation-recommend --sub-workspace <name>
```

The chain has two different artifact classes:

- **Project-level artifacts**: inception, constitution/memory, architecture,
  workspace layout, dependency policy, sub-workspace docs, and automation recommendations.
- **Feature/epic artifacts**: discovery, `spec.md`, requirements checklist, and
  clarifications.

Important gate: `/tdk-workflow-config-apply` previews first and asks before it
writes config. On a fresh project, approve the guarded apply before
`/tdk-sub-workspace-docs --all`; otherwise docs generation only works when
`.specify/.specify.json` already has configured `subWorkspaces[]`.

## Prerequisites

- TDK is installed in the consumer project under `.specify/`.
- The project has a JSON `.specify/.specify.json`; workflow config apply does not create
  first-time config from scratch.
- `bun` is available.
- `repomix` is installed before `/tdk-sub-workspace-docs --all`:
  `npm install -g repomix`.

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
/tdk-sub-workspace-docs --all
/tdk-sub-workspace-automation-recommend --sub-workspace <name>
```

If you intentionally want policy guidance before runtime config apply, run
`/tdk-workflow-config-apply --dry-run` first, then
`/tdk-workspace-dependency-policy`, but treat the result as advisory against a
proposed layout.

## Output Map

| Step | Command | Primary output | Writes runtime config? |
|---|---|---|---|
| 1 | `/tdk-greenfield-start --full` | `.specify/configurations/inception/project-inception.md` | No |
| 2 | `/tdk-constitution --init` | `.specify/memory/constitution.md`, memory index/config, Arc42 summaries, typed memory files when evidence exists | No `.specify/.specify.json` mutation |
| 3 | `/tdk-discovery <id> <brief>` | `<feature-dir>/discovery/problem.md`, `personas.md`, `mvp-scope.md`, `index.md` | No |
| 4 | `/tdk-specify <id> <description>` | `<feature-dir>/spec.md`, `<feature-dir>/checklists/requirements.md` | No |
| 5 | `/tdk-clarify <id>` | Updates `<feature-dir>/spec.md` and `## Clarifications` | No |
| 6 | `/tdk-architecture-advisor` | `.specify/configurations/architecture/architecture-options.md`, `architecture-decision.md` | No |
| 7 | `/tdk-workspace-layout-propose` | `.specify/configurations/workspace-layout/workspace-layout-proposal.md`, `workspace-layout-proposal.json` | No |
| 8 | `/tdk-workflow-config-apply` | Diff/warnings review, then updated `.specify/.specify.json`, apply report, backup when approved | Yes, after confirmation |
| 9 | `/tdk-workspace-dependency-policy` | `.specify/configurations/workspace-dependency-policy/workspace-dependency-policy.md`, optional `enforcement-snippets.md` | No |
| 10 | `/tdk-sub-workspace-docs --all` | Arc42-lite docs per configured sub-workspace under `<docsPath>/sub-workspaces/<name>/` | No runtime config mutation |
| 11 | `/tdk-sub-workspace-automation-recommend --sub-workspace <name>` | `.specify/configurations/automation-recommendations/sub-workspaces/<name>/automation-recommendation.md` | No |

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

- `.specify/memory/constitution.md`
- `.specify/memory/memory-index.md`
- `.specify/memory/memory.yaml`
- `.specify/memory/arc42/README.md`
- `.specify/memory/arc42/01-introduction-and-goals.md` through
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
- `<feature-dir>/discovery/index.md`

Discovery does not create `UR-*`, `FR-*`, or `SC-*`; only `/tdk-specify` owns
requirement IDs.

### 4. Specify

```text
/tdk-specify feat-001 "Feature or epic requirement description"
```

Output:

- `<feature-dir>/spec.md`
- `<feature-dir>/checklists/requirements.md`

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
limited to `architecture.type`, `subWorkspaces[]`, docs/test mapping, and
`modules[]`. Fields such as `boundaryType`, `owner`, `contracts`,
`allowedDependencies`, and `routing` are report-only unless a future schema
expansion promotes them.

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

### 10. Sub-workspace docs

```text
/tdk-sub-workspace-docs --all
```

This requires configured `subWorkspaces[]` in `.specify/.specify.json` and real
paths on disk. For each target, it writes or refreshes:

- `<docsPath>/sub-workspaces/<name>/README.md`
- `<docsPath>/sub-workspaces/<name>/architecture.md`
- `<docsPath>/sub-workspaces/<name>/interfaces.md`
- `<docsPath>/sub-workspaces/<name>/engineering.md`

The skill runs the resolver, packs code with repomix, runs scout, then delegates
writing to the `tdk-docs-writer` agent. It generates arc42-lite docs only;
it does not create PRDs, roadmap docs, or runtime config.

### 11. Sub-workspace automation recommendation

```text
/tdk-sub-workspace-automation-recommend --sub-workspace <name>
```

Run this per sub-workspace after docs exist. The recommendation reads the
selected sub-workspace docs, workspace dependency policy, official docs, primary
sources, local installed skills, and optional direct community lookup through
`npx skills find` or skills.sh. It does not use `ck:find-skills` and does not
support `--all`.

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
| Topology apply says missing JSON config | `.specify/.specify.json` does not exist or only YAML config exists | Create/migrate JSON config first; first-time creation is deferred |
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
