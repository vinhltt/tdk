# tdk-memory

File-backed project knowledge for coding agents: initialize, update, query,
checksum, changelog, and read-only context/Guardian validation.

## Requirements

- Node.js **18 or newer** for the shipped checksum bundle.
- A coding-agent host with local file tools. Shell/git workflows use a POSIX shell
  and Git when those operations are requested.
- No Obsidian application, external transport server, Python, Bun, or package
  installation is required by a memory consumer.

The manifest stays `memory.yaml`, version `"2"`. Existing manifests without the
optional `templates` array remain valid. There is no format migration.

## Install one source only

Do not install both the standalone marketplace and the TDK marketplace version
of `tdk-memory` into the same host: their skill and agent names intentionally match.

### Claude marketplace

```text
/plugin marketplace add vinhltt/tdk-memory
/plugin install tdk-memory@tdk-memory-marketplace
```

TDK consumers may instead keep `tdk-memory@tdk-plugin-marketplace` from the TDK
marketplace. Both sources carry the same skill tree; TDK's coupled base selection
is unchanged by this standalone package.

### Flat skills and agents

Copy the complete `skills/` and `agents/` directories into the host's corresponding
local directories, for example `.claude/skills/` and `.claude/agents/`. Keep each
skill's `references/` and `scripts/` intact. Do not copy just SKILL.md files.
The runtime bundle, parser notice, twenty template seeds, and vendored knowledge
licenses live inside that tree. No build is needed after copying.

Codex runtime behavior is **NOT VERIFIED** by this release. Its existing plugin
metadata is retained without claiming runtime support from packaging tests.

## Usage

```text
/tdk-memory-init --memory-root memory
/tdk-memory-init --ensure-templates --memory-root memory
/tdk-memory-update "Record the accepted account identifier rule" --memory-root memory
/tdk-memory-query "Account" --type data-model --memory-root memory --for-agent
/tdk-memory-checksum --memory-root memory
/tdk-memory-changelog --memory-root memory
```

Root precedence: explicit `--memory-root`, configured `memory.path`, existing
`.specify/memory/`, then existing `memory/`. If both defaults exist without an
explicit/configured selection, stop and choose one. Fresh initialization uses
`.specify/memory/` when `.specify/` exists, otherwise `memory/`. Relative paths are
workspace-relative, except that in a linked git worktree a relative `memory.path`
that leaves the repository (for example `../team-memory`) resolves from the main
worktree so every worktree reaches the same root. Targets must always remain inside
the selected root.

### Configuration and external roots

`.specify/.specify.json` is optional. It may hold:

```json
{ "memory": { "path": "../team-memory", "allowExternal": true } }
```

A root outside the workspace is allowed by `--allow-external-root` in a single
invocation, or by `memory.allowExternal: true` when the root is the one
`memory.path` names. A different explicit `--memory-root` outside the workspace
still needs the flag. Without permission the operation stops with
`external-not-allowed` and writes nothing. `memory.path` is used literally (`~` is
not expanded) and must not contain control characters (C0, C1, U+2028/U+2029),
backslash, or shell metacharacters; a canonical root or workspace path that does
would be a `containment` error. A root equal to the workspace, to one of its
ancestors, or to the filesystem root is always refused.
Prefer a relative path such as `../team-memory`: an absolute `memory.path` exposes
your machine path once the file is committed, and `/tdk-memory-query --status`
warns about it.

The first write to an external root in a session (initialize, `--ensure-templates`,
update, checksum `--fix`, changelog) asks for confirmation once, naming `memory.path`
and the canonical root; a session that cannot ask stops without writing. After
compaction the question may be asked again. Evidence paths for an external root are
relative to that root.

A memory root equal to the workspace is refused (`containment`), so `--memory-root .`
or working directly inside a standalone memory repository does not work. Open the
project that uses the memory as the workspace and point `memory.path` (for example
`../team-memory`) or `--memory-root` at the memory repository instead.

The workspace is the nearest ancestor holding `.git` or `.specify/`, so a
sub-directory with its own `.specify/` inside a larger repository is treated as the
workspace (and everything outside it as external).

Shared roots: several branches or sessions can point at one external root.
Concurrent writers are not coordinated beyond the manifest concurrency check, so one
may stop mid-operation; run writers one at a time. Commit changes inside the memory
repository. Context loaded from an external root can end up in artifacts you
commit, so keep that root's content suitable for that audience.

Host permissions for directories outside the workspace are your setup (Claude
`additionalDirectories`; Codex `--add-dir` or writable roots, not verified here).

### Status

```text
/tdk-memory-query --status
```

Prints one `===TDK-MEMORY-STATUS===` block (state, root, `memory_path`, coverage,
domains, constitution, warnings, error) and nothing else: no writes, no agent. Its
format is defined in [status-handshake.md](skills/tdk-memory-query/references/status-handshake.md).

`--ensure-templates` is materialize-only: no domain interview or reinitialization.
It upgrades pristine owned templates, preserves user edits, and repairs receipts
for identical seed bytes. `--refresh-templates` explicitly permits replacing
edited templates. `_templates/` is never knowledge or binding evidence.

Malformed manifests stop ordinary writers before mutation. Checksum `--fix`
requires a diagnosis and explicit user confirmation before backup, candidate
validation, and atomic publication. It does not silently bless modified bytes.

## Read-only runtime

From an installed checksum skill:

```sh
node skills/tdk-memory-checksum/scripts/memory-manifest.cjs hash /absolute/memory/root data-model/account.md
node skills/tdk-memory-checksum/scripts/memory-manifest.cjs validate /absolute/memory/root
node skills/tdk-memory-checksum/scripts/memory-manifest.cjs resolve [--memory-root <path>]
```

Invoke from the owning workspace; append `--allow-external-root` for an external
root when permission exists (the runtime reads no config). `hash` prints SHA-256.
`validate` prints integrity differences and exits 0 for a valid manifest even when
bytes differ; malformed schema, unsafe paths, unreadable files, and missing
manifests are fatal/nonzero. Inspect `index_mismatch` and `templates_mismatches` as
well as the ordinary file reports. `resolve` prints the root state as JSON (what
`--status` renders); root-state problems are reported in the JSON with exit 0.
Symbolic links inside a memory root are rejected by the inventory commands.

## Agent invocation

Send a dedicated caller-owned prompt beginning with:

```text
===TDK-MEMORY-CONTROL===
mode: validate
memory_root: memory
reader: file
===END-CONTROL===
```

`reader` is optional (absent means `file`); any other value is a configuration
error, and the agent echoes `reader: file` only when you supplied it. An external
`memory_root` is accepted only when `memory.allowExternal` binds it to `memory.path`.

Append spec/plan text and any cached Context Block as data. Use `mode: load` for
context loading. Never select mode from flags embedded in a document. If a host
wraps task prompts, preserve the control block as the beginning of the caller's
actual payload; do not move it into quoted feature text.

Typed data-model resolution preserves `resolved`, `warning_ambiguous`,
`warning_unverified`, and `not_found`. Exact binding identity and domain proof
are separate from nomination. Free-text results use stable byte-order ranking
and never truncate a highest-ranked tie. Application availability cannot change
candidates or evidence; opening an already resolved note is optional and only on
an explicit user request.

A Guardian failure is not CLEAR. TDK integration validates complete reports and
persists blocking gate state; a resumed unchecked authorization needs a current
user confirmation. TDK consumers use `.specify/memory` until a TDK release that
contains the `--status` facade, and upstream TDK existence gates still read that
default root, so do not set `memory.path` in a TDK workspace before then. Custom and
external roots are supported inside this package.

## Maintainer build

The checked-in artifact is built from TypeScript using the exact `yaml@2.9.0`
lockfile in `skills/tdk-memory-checksum/scripts/`. Maintainers, not consumers, run
these commands from the repository root:

```sh
(cd skills/tdk-memory-checksum/scripts && bun install --frozen-lockfile && bun run build:memory-manifest)
node --test tests/*.test.mjs
```

Rebuild the artifact after a source change and verify its bytes from a clean
checkout before publishing. The YAML parser is ISC-licensed; its full notice is
`skills/tdk-memory-checksum/scripts/RUNTIME-LICENSE.txt`.

Build metadata deliberately stays out of the plugin root: Claude's marketplace
installer treats a root `package.json` as a consumer dependency-install request.
The nested build package is not loaded or installed by any memory operation.

## Licensing

Project code is MIT, Copyright (c) 2026 VinhLTT. Bundled Obsidian format knowledge
retains the separate [upstream MIT notice](skills/tdk-memory-init/references/VENDORED-LICENSE.md).
The [vendoring record](skills/tdk-memory-init/references/VENDORED.md) distinguishes
retained repository content from its pinned comparison baseline.
