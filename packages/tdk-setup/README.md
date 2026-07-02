# @tihon/tdk-setup

Standalone TDK harness setup CLI.

This package manages harness install, Codex package conversion, and flat `.claude/` migration. It lives outside `.specify/` because `.specify/` is the consumer payload, while this package is a TDK source-checkout tool.

## Usage

Run from the TDK source checkout:

```bash
cd packages/tdk-setup
CONSUMER_ROOT=/path/to/consumer-project
```

Install Claude harness artifacts:

```bash
bun src/index.ts install "$CONSUMER_ROOT" --harness claude --plugins tdk-core --dry-run
bun src/index.ts install "$CONSUMER_ROOT" --harness claude --plugins tdk-core --yes
bun src/index.ts install "$CONSUMER_ROOT" --harness claude --all-plugins --dry-run
bun src/index.ts install "$CONSUMER_ROOT" --harness claude --all-plugins --prefix pav --yes
```

Install preconverted Codex artifacts:

```bash
bun src/index.ts install "$CONSUMER_ROOT" --harness codex --plugins tdk-core --dry-run
bun src/index.ts install "$CONSUMER_ROOT" --harness codex --plugins tdk-core --yes
bun src/index.ts install "$CONSUMER_ROOT" --harness codex --all-plugins --dry-run
```

Regenerate generated Codex packages from TDK plugin source:

```bash
bun src/index.ts convert --dry-run
bun src/index.ts convert
bun src/index.ts convert --check
```

Migrate an existing flat `.claude/` tree to Codex artifacts:

```bash
bun src/index.ts convert-flat "$CONSUMER_ROOT" --dry-run
bun src/index.ts convert-flat "$CONSUMER_ROOT" --yes
```

Omit `--plugins` and `--all-plugins` to select plugins interactively with Space and Enter.

If `.specify/` was distributed with `bash distribute.sh <consumer-root> --prefix pav`, use the same `--prefix pav` here. `distribute.sh --prefix` brands safe `.specify/` payload text; `tdk-setup install --prefix` brands installed `.claude/`, `.codex/`, and `.agents/skills/` harness artifacts.

## Commands

| Command | Purpose |
| --- | --- |
| `install [root]` | Install selected TDK plugin artifacts into `.claude/` or preconverted `.codex/` + `.agents/skills/` targets. |
| `convert` | Maintainer-only command that emits generated Codex packages under `.specify/codex-plugins/<plugin>/`. |
| `convert-flat [root]` | Convert an existing flat `.claude/` tree into additive `.codex/` and `.agents/skills/` artifacts. |

## Install Notes

`install --harness codex` reads generated packages from the consumer project's `.specify/codex-plugins/` directory and verifies them against `.specify/codex-plugins/manifest.json`.

Codex install writes skills to `.agents/skills/`, hooks and lib files to `.codex/`, generates `.codex/agents/*.toml` and `.codex/config.toml` at install time from plugin source agents, merges `.codex/hooks.json`, and writes ownership state to `.specify/state/harness-install/codex.json`.

Claude install writes managed artifacts to `.claude/`, copies `.specify/claude-rules/*.md` to `.claude/rules/` with the same prefix transform, merges hook runtime entries into `.claude/settings.json`, and writes ownership state to `.specify/state/harness-install/claude.json`.

Existing unmanaged `.claude/` files require explicit interactive overwrite approval. `--yes` only approves clean writes, clean updates, and clean removals.

Claude and Codex harness installs are separate runs. A combined Claude+Codex install is unsupported.

## Convert Notes

`convert` is source-tree and maintainer-only. It emits generated Codex packages to `.specify/codex-plugins/<plugin>/` following the official Codex plugin layout:

```text
.codex-plugin/plugin.json
skills/
hooks/
lib/
```

Only `.codex-plugin/plugin.json` lives under `.codex-plugin/`; skills, hooks, and lib assets live at the package root. `convert --check` re-emits in memory and fails if committed packages drift from source.

Underscore-prefixed shared skill directories such as `_shared` are copied as reference assets, but their `SKILL.md` entrypoint is not installed as a loadable Codex skill.

## Convert-Flat Notes

`convert-flat` leaves the source `.claude/` tree untouched, reports unknown entries as skipped, and writes Codex ownership state to `.specify/state/harness-install/codex.json`.

Use `--force` to overwrite conflicts on unowned or user-edited `.codex/` targets.
