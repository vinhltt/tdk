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
bun src/index.ts install "$CONSUMER_ROOT" --harness claude --plugins tdk-epic --dry-run
bun src/index.ts install "$CONSUMER_ROOT" --harness claude --all-plugins --dry-run
bun src/index.ts install "$CONSUMER_ROOT" --harness claude --all-plugins --prefix sample --yes
```

Install preconverted Codex artifacts:

```bash
bun src/index.ts install "$CONSUMER_ROOT" --harness codex --plugins tdk-core --dry-run
bun src/index.ts install "$CONSUMER_ROOT" --harness codex --plugins tdk-core --yes
bun src/index.ts install "$CONSUMER_ROOT" --harness codex --plugins tdk-epic --dry-run
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

Every selection resolves the coupled base `tdk-core`, `tdk-inception`,
`tdk-memory`, and `tdk-utils`. `--plugins` therefore requests optional workflows;
`--plugins tdk-core` is accepted as base-only compatibility syntax, while
`--plugins tdk-epic` installs the base plus the parent-epic workflow.

In a TTY, omit `--plugins` and `--all-plugins` to select optional plugins with
Space and Enter; an empty selection installs only the base. In non-TTY runs,
provide either `--plugins <name[,name]>` or `--all-plugins` explicitly. Dry-run
output distinguishes `Requested optional plugins` from the complete
`Resolved plugins` set.

If `.specify/` was distributed with `bash distribute.sh <consumer-root> --prefix sample`, use the same `--prefix sample` here. `distribute.sh --prefix` brands safe `.specify/` payload text; `tdk-setup install --prefix` brands installed `.claude/`, `.codex/`, and `.agents/skills/` harness artifacts.

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

`.specify/install-settings.json` stores the most recently requested optional
set globally. Each harness ownership manifest under
`.specify/state/harness-install/` independently records the resolved plugins
actually installed for that harness, so a later Claude run does not rewrite
Codex ownership state (or vice versa).

Consumers installed before the `tdk-inception` ownership split have no saved
selection migration. Back up the consumer, refresh the distributed payload,
then explicitly run `--all-plugins --dry-run` and `--all-plugins --yes` for each
installed harness. Review conflicts instead of deleting or overwriting
user-modified targets; never use `distribute.sh --yes-delete` on a real consumer
as a migration shortcut.

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
