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

Materialize and install Codex artifacts in the consumer context:

```bash
cd "$CONSUMER_ROOT"

# Generate ignored Codex packages from the consumer's distributed source plugins.
bun /path/to/tdk/packages/tdk-setup/src/index.ts convert --all-plugins

# Write and verify the consumer-local source and Codex package manifests.
bun /path/to/tdk/.specify/scripts/ts/src/commands/manifest/compute.ts --project-root "$CONSUMER_ROOT" --write
bun /path/to/tdk/.specify/scripts/ts/src/commands/manifest/compute.ts --project-root "$CONSUMER_ROOT" --check

# This freshness check requires materialized output.
bun /path/to/tdk/packages/tdk-setup/src/index.ts convert --all-plugins --check

bun /path/to/tdk/packages/tdk-setup/src/index.ts install "$CONSUMER_ROOT" --harness codex --plugins tdk-core --dry-run
bun /path/to/tdk/packages/tdk-setup/src/index.ts install "$CONSUMER_ROOT" --harness codex --plugins tdk-core --yes
bun /path/to/tdk/packages/tdk-setup/src/index.ts install "$CONSUMER_ROOT" --harness codex --plugins tdk-epic --dry-run
bun /path/to/tdk/packages/tdk-setup/src/index.ts install "$CONSUMER_ROOT" --harness codex --all-plugins --dry-run
```

Migrate an existing flat `.claude/` tree to an explicit target harness:

```bash
bun src/index.ts convert-flat "$CONSUMER_ROOT" --harness codex --dry-run
bun src/index.ts convert-flat "$CONSUMER_ROOT" --harness codex --yes
bun src/index.ts convert-flat "$CONSUMER_ROOT" --harness omp --parts agents,rules,settings,hooks,skills,context --dry-run
bun src/index.ts convert-flat "$CONSUMER_ROOT" --harness omp --parts agents,rules,settings,hooks,skills,context --yes
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
| `install [root]` | Install selected TDK plugin artifacts into `.claude/` or materialized `.codex/` + `.agents/skills/` targets. |
| `convert` | Maintainer-only command that emits generated Codex packages under `.specify/codex-plugins/<plugin>/`. |
| `convert-flat [root] --harness <codex|omp>` | Convert an existing flat `.claude/` tree into harness-native artifacts. Codex is all-at-once; OMP supports additive/explicit-removal conversion for `agents`, `rules`, `settings`, `hooks`, `skills`, and `context`. |

## Install Notes

`install --harness codex` reads materialized packages from the consumer project's `.specify/codex-plugins/` directory and verifies them against the consumer-local `.specify/codex-plugins/manifest.json`. Both must exist before installation.

Codex install writes skills to `.agents/skills/`, hooks and lib files to `.codex/`, generates `.codex/agents/*.toml` and `.codex/config.toml` at install time from plugin source agents, merges `.codex/hooks.json`, and writes ownership state to `.specify/state/harness-install/codex.json`.

Claude install writes managed artifacts to `.claude/`, copies `.specify/claude-rules/*.md` to `.claude/rules/` with the same prefix transform, merges hook runtime entries into `.claude/settings.json`, and writes ownership state to `.specify/state/harness-install/claude.json`.

Runtime asset references are resolved against the selected plugin inventory before
installation. Skill directory references ending in `/` (for example, template
directories) resolve only when shipped files exist beneath them, including under
a custom skill prefix. Missing directories, traversal, and file paths used as
directories are rejected rather than guessed from the source filesystem.

Memory install regressions exercise the installed Node CJS `hash` and YAML
`validate` commands after removing source plugins and unsetting Claude root
variables, for both default and custom prefixes. Run this package's `bun test`
and `bun run typecheck` separately from the `.specify/scripts/ts` suite.

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

`convert` is source-tree and maintainer-only. Run it in the consumer context to materialize ignored Codex packages at `.specify/codex-plugins/<plugin>/` from distributed source plugins, following the official Codex plugin layout:

```text
.codex-plugin/plugin.json
skills/
hooks/
lib/
```

Only `.codex-plugin/plugin.json` lives under `.codex-plugin/`; skills, hooks, and lib assets live at the package root. `convert --check` re-emits in memory and fails if materialized packages drift from source, so it requires existing materialized output.

Underscore-prefixed shared skill directories such as `_shared` are copied as reference assets, but their `SKILL.md` entrypoint is not installed as a loadable Codex skill.

### Codex harness label and preflight

A generated Codex wrapper exports `TDK_HARNESS=codex` to the hook it runs, so an installed hook
reports the harness it actually ran under instead of defaulting to `claude`. Both generation paths
(`convert` and `convert-flat --harness codex`) therefore run a capability preflight **before the
first filesystem write**: they read the installed `lib/harness-payload.cjs` and refuse the whole
conversion when it has no `codex` dispatch, leaving the target tree byte-unchanged.

This is a behaviour change for consumers on an older plugin: a conversion that previously
"succeeded" now exits non-zero with `Codex harness preflight failed: …`. The refusal is deliberate —
a codex-labelled wrapper against a lib that cannot dispatch it makes `loadPayloadHarness` throw,
which `destructive-command-block` catches and answers with exit 0, i.e. **allow**. Upgrade the
installed `tdk-core` plugin and re-run; there is no bypass flag.

### Session provenance in the consumer repository

Installed hooks record one JSON provenance line per `(session, ticket)` first association in
`.specify/specs/<ticket>/sessions.jsonl`. By default that record includes the OS hostname and
username (`host`, `user`) alongside `machineId`, `harness`, `os`, and `branch`. `tdk-setup` writes
no `.gitignore` for `.specify/specs/**`, so those records are commit-eligible and can reach a
public diff.

Set `TDK_SESSION_IDENTITY=hashed` to drop the `host` and `user` keys and keep only `machineId`
(a `sha256(hostname \0 username \0 platform)` prefix). The opt-out is forward-only: it changes what
future records contain and never rewrites history that is already committed.

## Convert-Flat Notes

`convert-flat` requires `--harness codex` or `--harness omp` and leaves the source `.claude/` tree
untouched. Codex writes ownership state to `.specify/state/harness-install/codex.json`. OMP writes
state to `.specify/state/harness-install/omp.json`; its first non-TTY run requires `--parts`
with one or more available parts (`agents,rules,settings,hooks,skills,context`), later runs reuse active
manifest parts, and removal is explicit through `--remove-parts`.

`convert-flat` prints progress by default while it resolves parts, scans `.claude/`, validates and
renders targets, builds the reconcile plan, and applies changes. The final report lists every planned
install, update, skip, deletion, and conflict; `--dry-run` ends with an explicit no-mutation message.
Transient `.claude/worktrees/**` snapshots are excluded from the source inventory. Claude-generated
single-line `description` scalars containing unquoted colons are recovered without weakening
validation for other malformed YAML frontmatter.

OMP agent conversion requires explicit source `name` and `description`, maps
tool/model names to OMP frontmatter, and emits a minimal string `output` schema so delegated `yield`
calls return valid data. OMP rule conversion translates `paths`/`inject` to native rule buckets,
regenerates Claude-managed rules from manifest-owned `.specify/claude-rules/` sources, and rejects
reserved or duplicate logical names before writing. Mechanically extracted descriptions are reported
as placeholders. OMP settings conversion adopts a regular handwritten `.omp/config.yml` through a
byte-preserving sentinel merge, records a managed-region checksum, and creates a durable pre-write
backup of the existing `.omp/` tree. Unsupported or local-only settings are reported without copying
their values; scoped permissions are never broadened into global approvals.

### OMP hooks

OMP hook conversion preserves the eight supported event mappings and their existing matcher, session, and output-control contract in the [generated bridge](src/lib/harness-transform/claude-hook-bridge.ts). `Stop` runs only for terminal main-session `agent_end` events; `SubagentStart` and `SubagentStop` run only for detected child sessions. When topology metadata is unavailable, the conservative fallback runs `Stop` and skips `Subagent*`. `SessionStart` and `PreCompact` matchers degrade to match-all when OMP does not expose matcher data.

The [command classifier](src/lib/harness-transform/hook-command.ts) translates its bounded portable subset—a literal `node` invocation with a safe relative hook script, literal/project-root arguments, and optionally the exact `cd "$CLAUDE_PROJECT_DIR" &&` prefix—into a shell-free Node descriptor. The OMP runtime must have the `node` CLI on `PATH`. Other parseable commands remain POSIX-shell commands and use `/bin/sh` only for Linux or macOS; malformed commands are rejected. The native Windows compatibility claim is deliberately limited to the direct Node-descriptor lane, not an all-shell launch guarantee.

`--target-platform <win32|linux|darwin>` is available only for an OMP conversion that selects `hooks` in `--parts`. Its resolution is explicit flag > saved OMP ownership-manifest target > conversion host. Use an explicit Windows target when generating from WSL:

```bash
bun src/index.ts convert-flat "$CONSUMER_ROOT" --harness omp --parts hooks --target-platform win32 --dry-run
bun src/index.ts convert-flat "$CONSUMER_ROOT" --harness omp --parts hooks --target-platform win32 --yes
```

A `win32` target rejects shell-dependent hooks while the conversion plan is built, before any writes. The selected target is persisted in the OMP ownership manifest; later partial conversions that do not select hooks retain it, while removing hooks clears it.

Launch failures fail open with bounded, redacted diagnostics: generated bridges cap stdout and stderr independently at 1 MiB and do not log commands, argv, environment, payload, or raw stderr. Timeout and output-limit handling makes a bounded attempt to clean up the owned child tree; it does not promise cleanup for arbitrary self-daemonized processes. `PreToolUse.additionalContext` is not model-visible context in OMP and remains out of scope (#162).

OMP skill conversion copies `.claude/skills/<name>/**` byte-for-byte into `.omp/skills/`, skips
internal `_*/SKILL.md` entrypoints, validates descriptions and effective-name uniqueness before any
write, and disables only the Claude user/project skill sources. Because OMP merges project
`.claude/settings.json` after `.omp/config.yml`, top-level `skills` or `disabledProviders` settings
block skill takeover rather than producing an ineffective toggle.

OMP context conversion writes `.omp/AGENTS.md` as the exact `@../CLAUDE.md` import, keeping the root
`CLAUDE.md` authoritative instead of copying it. A missing root file produces a Layer 1 report note
without a target, and an existing unowned `.omp/AGENTS.md` remains a collision unless `--force` is used.

### OMP drift gate

After an OMP conversion has written its ownership manifest, use this read-only checksum gate in CI:

```bash
bun src/index.ts convert-flat "$CONSUMER_ROOT" --harness omp --check
```

`--check` is available only with `--harness omp` and cannot be combined with conversion options. It
exits 0 when no drift is detected and nonzero for drift or unavailable/incompatible OMP ownership
data. The command reads `.specify/state/harness-install/omp.json` and reports changed managed
sources, edited managed targets, and missing managed targets as `source-changed`,
`target-modified`, and `target-missing`. For `.omp/config.yml`, only the payload between the TDK
sentinels is checked; user-owned YAML outside that region may change without causing drift. The
check never writes, removes, backs up, or regenerates files. Run the relevant conversion part again
to refresh a changed source; review target-side edits before deciding whether to port them back to
`.claude/` or reconvert.

Use `--force` to overwrite conflicts on ordinary unowned or user-edited managed targets. A regular,
non-conflicting `.omp/config.yml` is adopted by `settings` through sentinel merge without `--force`;
edits inside its TDK-managed sentinel region remain fail-closed even with `--force`.
