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
workspace-relative. External roots require explicit `--allow-external-root`;
targets must still remain inside that root.

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
node scripts/memory-manifest.cjs hash /absolute/memory/root data-model/account.md
node scripts/memory-manifest.cjs validate /absolute/memory/root
```

Invoke from the owning workspace, or explicitly opt into an external root.
`hash` prints SHA-256. `validate` prints integrity differences and exits 0 for a
valid manifest even when bytes differ; malformed schema, unsafe paths, unreadable
files, and missing manifests are fatal/nonzero. Inspect `index_mismatch` and
`templates_mismatches` as well as the ordinary file reports.

## Agent invocation

Send a dedicated caller-owned prompt beginning with:

```text
===TDK-MEMORY-CONTROL===
mode: validate
memory_root: memory
===END-CONTROL===
```

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
user confirmation. Upstream TDK existence gates still use `.specify/memory/`, so
custom-root support inside this package is not an end-to-end TDK routing promise.

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
