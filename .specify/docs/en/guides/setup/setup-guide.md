# Setup Guide

Use this when TDK commands are not visible yet, dependencies are missing, or a newly cloned consumer project needs local setup.

## Prerequisites

`repomix` is required by two workflows:

- `/tdk-scout --scope`
- `/tdk-sub-workspace-docs`

It is **not** required for `/tdk-scout --from-pack`, which reads an existing pack.

Install it globally:

```bash
npm install -g repomix
```

Setup does not fail when `repomix` is missing. It reports the gap as a manual
step and continues, so the rest of the install still completes.

Setup also registers the official repomix marketplace when the `claude` CLI is
available and `--skip-plugins` was not passed. The matching `claude plugin
install` commands and `.claude/settings.json` entries are printed in the manual
steps at the end of the run — see the After Setup section below.

## Fast Path

Run from the consumer project root:

```bash
bash .specify/setup.sh
```

The script checks prerequisites, installs Bun when missing, installs TypeScript setup dependencies, creates or verifies the Python venv, checks config detection, and registers available command metadata.

## Options

```bash
bash .specify/setup.sh --help
bash .specify/setup.sh --force
bash .specify/setup.sh --skip-venv
bash .specify/setup.sh --skip-config
```

## Install Harness Plugins

After the `.specify/` payload exists, run the harness installer from the TDK
source checkout under `packages/tdk-setup`:

```bash
cd /path/to/tdk/packages/tdk-setup
CONSUMER_ROOT=/path/to/consumer-project
bun src/index.ts install "$CONSUMER_ROOT" --harness claude --plugins tdk-core --dry-run
bun src/index.ts install "$CONSUMER_ROOT" --harness claude --plugins tdk-core --yes
```

Use `--harness codex` for a separate Codex install after materializing packages
in the consumer. From the consumer root, run `convert --all-plugins`, then
manifest compute with `--write` and `--check`; the consumer-local
`.specify/codex-plugins/` packages and manifest must exist before installation.
`convert --check` also requires that materialized output. A combined Claude+Codex
install is unsupported.

Every selection resolves the coupled base `tdk-core`, `tdk-inception`,
`tdk-memory`, and `tdk-utils`. `--plugins` requests optional workflows;
`--plugins tdk-core` remains accepted as base-only compatibility syntax. Use
`--all-plugins` to request every optional plugin.

In a TTY, omit both selectors to choose optional plugins interactively; an empty
choice installs only the base. Non-TTY runs must pass
`--plugins <name[,name]>` or `--all-plugins`. The preview reports
`Requested optional plugins` separately from the complete `Resolved plugins`
set.

`.specify/install-settings.json` stores the latest requested optional set
globally. Claude and Codex ownership manifests independently record the resolved
plugins actually installed for each harness.

For consumers installed before the `tdk-inception` ownership split, back up the
consumer, refresh the distributed payload, then run `--all-plugins --dry-run`
and `--all-plugins --yes` separately for each installed harness. There is no
saved-selection migration; review conflicts instead of deleting or overwriting
user-modified targets.

## After Setup

Follow the manual steps printed by the script. At minimum:

- Install Claude Code if the script reports that it is missing.
- Enable Context7 integration when docs-seeker support is needed.
- Open Claude Code at the consumer project root.
- Verify `/tdk-` commands are visible in Claude Code chat.

For selective harness installs, choose optional plugins matching the workflow
you need: child feature, parent epic, or both. The coupled base is always
installed. After install, verify the `/tdk-` commands for that workflow are
visible in Claude Code chat.

## Troubleshooting

| Problem | What to do |
|---|---|
| Bun install failed | Re-run `bash .specify/setup.sh`; if it still fails, install Bun manually from `https://bun.sh`. |
| Python venv failed | Re-run without `--skip-venv`; make sure Python 3.8+ is available. |
| Command registration failed | Install Claude Code, then re-run setup. |
| `/tdk-` commands are not visible | Restart Claude Code from the project root after setup completes. |
