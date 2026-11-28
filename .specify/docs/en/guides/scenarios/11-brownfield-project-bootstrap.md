# Scenario: Brownfield Project Bootstrap

> **When to use**: An existing repository has no TDK project knowledge yet,
> and right after installing TDK you want onboarding, architecture recovery,
> workspace layout, config, memory domains, constitution, sub-workspace docs,
> and a root `AGENTS.md` from one command, then review the result afterwards.

This scenario covers the one-command path:

```text
install TDK
-> /tdk-project-bootstrap
-> review project-bootstrap-report.md
-> commit
-> /tdk-specify
-> /tdk-plan
```

`/tdk-project-bootstrap` runs this chain for you and skips every step whose
output already exists:

```text
/tdk-brownfield-start --full
-> /tdk-architecture-advisor --recover-existing
-> /tdk-workspace-layout-propose --from-existing
-> config gate, the only question
-> /tdk-memory-init with inferred domains
-> /tdk-constitution --init --auto
-> /tdk-sub-workspace-bootstrap, or /tdk-sub-workspace-docs without tdk-scaffold
-> root AGENTS.md and CLAUDE.md bridge
```

Running the command is the consent to create every missing artifact it covers.
It never modifies, overwrites, or deletes existing bytes itself; the only
exceptions are the config apply you confirm at the gate and rewriting its own
report. Child skills keep their own write rules. When a child skill would ask a
question, the command takes the branch that writes nothing and lists the item
under `## Needs your review` in the report.

For a new repository without code, the same command takes a brief; see the
one-command path in
[Greenfield Full Start](10-greenfield-full-start-architecture-topology.md#one-command-path).

## Prerequisites

- The harness install resolved the coupled base `tdk-core`, `tdk-inception`,
  `tdk-memory`, and `tdk-utils`. `/tdk-project-bootstrap` belongs to
  `tdk-inception`.
- `tdk-scaffold` is recommended. With it, the sub-workspace step runs
  `/tdk-sub-workspace-bootstrap`; without it, the step only writes sub-workspace
  docs with `/tdk-sub-workspace-docs`.
- `bun` is on `PATH`. Without it the command stops with the install hint before
  writing anything.
- `repomix` is on `PATH` for the sub-workspace step. When it is missing, the
  report warns, the sub-workspace step is skipped, and the report gives
  `npm install -g repomix` and the rerun command. See the Prerequisites section
  of the [Setup Guide](../setup/setup-guide.md).
- Optional: run `/tdk-scout --scope <repo-root> --task-hint "brownfield onboarding"`
  first. The command does not run scout; onboarding reads a recent scout report
  as one evidence source.

## Recommended Command Sequence

```text
/tdk-project-bootstrap
```

Answer the config question if it appears, then read
`.specify/configurations/inception/project-bootstrap-report.md`, starting with
`## Needs your review`. Commit, then start the first feature:

```text
/tdk-specify feat-001 "Feature description"
/tdk-plan feat-001
```

## Output Map

| Step | Runs when | Primary output | Asks? |
|---|---|---|---|
| Preflight | Every run | `.specify/.specify.json` seeded only when neither `.specify/.specify.json` nor `.specify/.specify.yaml` exists; the report | No |
| `/tdk-brownfield-start --full` | No `--full` onboarding report, or its `Readiness Status` is `not-ready` | `.specify/configurations/inception/brownfield-onboarding.md` | No; its questions become unresolved questions with confidence Low |
| `/tdk-architecture-advisor --recover-existing` | No recovery report | `.specify/configurations/architecture/architecture-recovery.md`; never `architecture-decision.md` | No |
| `/tdk-workspace-layout-propose --from-existing` | No proposal JSON | `.specify/configurations/workspace-layout/workspace-layout-proposal.json` and `.md` | No |
| Config gate | A proposal with sub-workspaces exists; asks only when the dry-run diff is not ` no changes` and the plan is apply-eligible | Updated `.specify/.specify.json`, `topology-apply-report.md`, backup | Yes |
| `/tdk-memory-init` | The memory Status Block lists no domains; skipped when the domain table is `unknown` or the status is an error, which also skips the constitution | Memory root with the inferred domains | No; a memory root outside the repository may add tdk-memory's own one-time consent |
| `/tdk-constitution --init --auto` | The Status Block does not say `constitution: present` | `<memory root>/constitution.md`, `arc42/README.md`, the 12 arc42 summaries, typed memory files when evidence exists | No |
| Sub-workspaces | The applied config has a non-empty `subWorkspaces[]` and at least one of their paths exists | `/tdk-sub-workspace-bootstrap` artifacts and its `bootstrap-report.md`, or docs only without `tdk-scaffold` | No |
| `AGENTS.md` | The run did not halt; `AGENTS.md` is written only when the root has none | `AGENTS.md`; `CLAUDE.md` containing `@AGENTS.md` when `AGENTS.md` exists and neither `CLAUDE.md` nor `.claude/CLAUDE.md` does | No |
| Report | Every run | `.specify/configurations/inception/project-bootstrap-report.md` | No |

## Step-By-Step Gates

### 1. Install

Install TDK in three steps: copy the `.specify/` payload into the repository
with `distribute.sh` from a TDK source checkout, run `bash .specify/setup.sh`
in the repository, then run the harness install. The
[Setup Guide](../setup/setup-guide.md) covers the last two steps. For the
harness install, add `tdk-scaffold` to the optional plugins:

```bash
# from packages/tdk-setup in the TDK source checkout
CONSUMER_ROOT=/path/to/sample
bun src/index.ts install "$CONSUMER_ROOT" --harness claude --plugins tdk-scaffold --dry-run
bun src/index.ts install "$CONSUMER_ROOT" --harness claude --plugins tdk-scaffold --yes
```

Continue only if Claude Code, opened at the repository root, lists
`/tdk-project-bootstrap`.

When setup reports that no `.specify/.specify.json` was found, do not copy
`.specify/.specify.json.example`: it carries sample sub-workspaces. The command
seeds a minimal config when neither a JSON nor a YAML config exists.

### 2. Run the command

```text
/tdk-project-bootstrap
```

The mode is brownfield when code or a package manifest exists outside the TDK,
tool, and docs folders, such as `.specify/`, `.claude/`, `.git/`,
`node_modules/`, and `docs/`. Pass `--brownfield` or `--greenfield` to
override it; a rerun reuses the mode recorded in the report.
Brownfield ignores a brief and `--quick`, and the report says so.

A step that fails is recorded with its fix and does not stop later steps that
do not depend on it. When onboarding ends `not-ready`, the command lists the
missing items and halts, and the next run runs onboarding again. Resolve those
gaps in the repository or README, not in the onboarding report: onboarding
regenerates its own report.

**Halt** means every remaining step up to and including `AGENTS.md` is
skipped, so a `not-ready` onboarding also stops the architecture, layout, and
config steps; the report is still written, and the command prints:

```text
Next: fix the listed items, then rerun /tdk-project-bootstrap
```

### 3. Config gate

The command previews the config change with the topology dry-run. This gate is
the only question the command asks. The question lists each proposed
sub-workspace with name, path, and confidence, plus every confirmation finding.
The options are:

- `Apply`
- `Stop to edit the proposal`

When there are confirmation findings, such as same-name overwrites, an
architecture type change, or normalized path collisions, the only apply option
is `Apply including overwrites`. Any other answer counts as Stop. If the config
changed between preview and apply, the command previews and asks once more; a
second stale plan counts as Stop.

There is no question when:

- the last line of the dry-run diff is exactly ` no changes`: the config is
  already applied, and the run continues;
- there is no proposal JSON, only `.specify/.specify.yaml` exists, or the
  proposal has an empty `subWorkspaces[]`: config and the sub-workspace step are
  skipped, and the run continues. With an empty array, the report lists the proposal's
  `architecture.type` as not applied and gives `/tdk-workflow-config-apply` to
  apply it by hand; with YAML only, the report lists the YAML-to-JSON migration;
- the dry-run fails or the proposal is not apply-eligible: config and the
  sub-workspace step are skipped, the report records why, and the run
  continues.

Whenever config is skipped for a reason other than an empty `subWorkspaces[]`,
the `AGENTS.md` and constitution of that run leave out the sub-workspaces. The
report then says to delete that `AGENTS.md` and rerun after applying the config,
and to update the constitution with `/tdk-constitution`.

Only Stop, a failed apply (validation, lock, or backup error), or a run where
the command cannot ask (headless or subagent runs) halts at the gate. The command writes the gate summary and its options into the
report, lists the proposal and its evidence files, and halts. Edit the
proposal, then rerun the command.

### 4. Read the report and fix things afterwards

Open `.specify/configurations/inception/project-bootstrap-report.md`:

- `## Needs your review` comes first.
- Then the mode, and one line per step with outcome, paths, and an ISO-8601
  timestamp.
- `## How to add a sub-workspace later`.
- `## Rollback`.

An item leaves `## Needs your review` when you delete it or a rerun finds it no
longer applies. Work through the items:

- **Gate decision and recovery confidence.** Check the confidence and
  unresolved questions of `architecture-recovery.md`, and any desired-state
  change that the proposal markdown keeps out of the JSON.
- **Inferred memory domains.** The command infers business domains from the
  onboarding report, README, and docs, and passes them to `/tdk-memory-init`
  with `provenance: inferred`. A business domain is a business concept the
  sources name, such as orders or billing; what the code does technically is
  not one, so a purely technical library or tool gets no domain. Package,
  folder, and sub-workspace names are never used as domain names. Correct a domain by editing its overview under the
  `memory_path` that `/tdk-memory-query --status` prints, or with
  `/tdk-memory-update`. Domain blocks that failed the checks are listed instead
  of being passed; when no domain was left, the report gives `/tdk-memory-init`
  as the manual step.
- **Constitution.** `/tdk-constitution --init --auto` asks nothing. It keeps
  constitution and memory authority over README conflicts and lists each
  conflict with its source, lists template changes as pending without editing
  `.specify/templates/`, and writes `TODO(RATIFICATION_DATE)` when the adoption
  date is unknown. Update it later with `/tdk-constitution`.
- **`AGENTS.md`.** Created only when the root has none; an existing file is
  never touched, and the report says `kept`. It describes the project, not TDK
  workflow: purpose and shape, a sub-workspace table, build, test, lint, and run
  commands read from a package manifest or CI config with High confidence,
  observed conventions with their source, and `## Where knowledge lives`. The
  report marks it `thin` when it has neither a command line nor a sub-workspace
  row. Edit it freely; a rerun keeps it.
- **`CLAUDE.md` bridge.** When `AGENTS.md` exists, created or kept, and neither
  `CLAUDE.md` nor `.claude/CLAUDE.md` exists, the command creates `CLAUDE.md` with exactly one line, `@AGENTS.md`,
  so Claude Code loads `AGENTS.md`. It never uses a symlink. An existing file is
  left unchanged; if it has no `@AGENTS.md` line, the report suggests adding
  that import line.
- **OMP item.** When `.omp/` exists and this run created `CLAUDE.md`, the report
  lists this command to run with the setup CLI of a TDK source checkout:

  ```text
  bun "<resolved-source-cli>" convert-flat "<consumer-root>" --harness omp --parts context --yes
  ```

  Without a source checkout, or without `tdk-scaffold`, the report prints the
  prerequisite instead. `.omp/AGENTS.md` is generated only when the root has
  `CLAUDE.md` and the `context` part is selected.
- **Sub-workspaces.** With `tdk-scaffold`, the report links the
  `## Needs your review` section of
  `.specify/configurations/automation-recommendations/bootstrap-report.md`. A
  configured path that does not exist yet is listed as `deferred`. When no
  configured path exists yet, as after a fresh greenfield layout, the step does
  not run, and the report gives `/tdk-sub-workspace-bootstrap` to run once a
  folder holds code.
- **Failed or halted steps.** Each one has its fix.

Rerunning resumes: every step skips when its output exists, and an edited file
is used as is. A rerun does not regenerate later files by itself: to regenerate
a file, delete it and every later file in its chain (onboarding, then
`architecture-recovery.md`, then the proposal JSON and md).

### 5. Commit

The command has no commit step. Review `git status` and commit the files it
created: the seeded or applied `.specify/.specify.json`, the reports under
`.specify/configurations/`, `AGENTS.md`, `CLAUDE.md`, memory files inside the
repository, and whatever the sub-workspace step wrote.

```bash
git status
git add <reviewed paths>
git commit
```

When `/tdk-memory-query --status` reports `external: true`, the memory lives in
another repository: commit it there with `git -C "<memoryRoot>"`.

### 6. Continue with a feature

The command ends with:

```text
Next: review "Needs your review", then /tdk-plan
```

`/tdk-plan` needs a spec, so the first feature starts with `/tdk-specify`:

```text
/tdk-specify feat-001 "Feature description"
/tdk-plan feat-001
```

See [Child Feature Implementation](01-child-feature-implementation.md) for the
rest of the feature loop.

### 7. Add a sub-workspace later

A rerun does not detect new sub-workspaces. Propose, apply, and bootstrap the
new layout yourself:

```text
/tdk-workspace-layout-propose --from-existing .specify/configurations/architecture/architecture-recovery.md
/tdk-workflow-config-apply
/tdk-sub-workspace-bootstrap
```

In greenfield mode, propose from
`.specify/configurations/architecture/architecture-decision.md` without
`--from-existing`. Without `tdk-scaffold`, replace the last command with
`/tdk-sub-workspace-docs --sub-workspace <name>`. The report's
`## How to add a sub-workspace later` section repeats this route.

### 8. Rollback

Follow the report's `## Rollback` section:

- a seeded `.specify/.specify.json`: delete it;
- an applied config: use the `backupPath` and `manualRevert` lines in
  `.specify/configurations/workspace-layout/topology-apply-report.md`;
- repository files: use git;
- memory outside the repository: use that repository's history;
- the sub-workspace step: follow the rollback in its own report.

## Common Failure Modes

| Symptom | Cause | Fix |
|---|---|---|
| The command stops with an install hint | `.specify/` is not installed or `bun` is not on `PATH` | Finish the [Setup Guide](../setup/setup-guide.md), then rerun |
| The run halts after onboarding | Onboarding is still `not-ready` | Resolve the listed gaps in the repository or README, then rerun |
| The run halts at the config gate | You chose Stop, or the run could not ask | Edit the proposal, then rerun in an interactive session |
| Config and sub-workspace steps are skipped | Only `.specify/.specify.yaml` exists | Migrate the YAML config to JSON, as the report lists, then rerun |
| The sub-workspace step is skipped | `repomix` or `bun` is not on `PATH` | `npm install -g repomix`, then rerun |
| Config apply fails | Validation, lock, or backup failure | Read the error line in the report, clear any lock path it names, then rerun |
| A new sub-workspace is not picked up | Reruns do not detect new sub-workspaces | Follow step 7 |

## Next Commands

| Goal | Next command |
|---|---|
| Start the first feature spec | `/tdk-specify feat-001 "Feature description"` |
| Build an implementation plan after the spec | `/tdk-plan feat-001` |
| Apply layout changes by hand | `/tdk-workflow-config-apply` |
| Update project authority | `/tdk-constitution` |

Command syntax and the cost profile live in the
[skills guide](../skills-guide.md#project-inception-commands). The command
contract is
[`tdk-project-bootstrap/SKILL.md`](../../../../plugins/tdk-inception/skills/tdk-project-bootstrap/SKILL.md).
