# Changelog

All notable changes to this plugin will be documented in this file.

Format: [Keep a Changelog](https://keepachangelog.com/en/1.1.0/), Semver.

## [Unreleased]

### Changed
- Vendored Obsidian Markdown and JSON Canvas references with the upstream MIT notice; removed the runtime dependency on `tdk-utils`.
- **BREAKING** Memory operations are file-only. Removed external transport discovery, transport-specific flows, and availability fallback.
- **BREAKING** Agent invocations require a leading caller-owned control header instead of payload-scanned mode flags.
- Bundled a Node.js >=18 checksum runtime and its YAML parser/license. Consumers need no Python, Bun, or dependency installation; `memory.yaml` remains version `"2"`.
- Moved all twenty templates into the initialization skill; materialize-only initialization tracks additive `templates[]` receipts and preserves edited templates unless refresh is explicitly requested.
- Added explicit root resolution, two containment boundaries, malformed-manifest preflight, approval-gated repair, and deterministic free-text ranking without truncating highest-rank ties.
- Added a standalone marketplace, MIT license, reproducible maintainer build, and Node-only local tests; TDK synchronization uses a one-way subtree with commit-derived drift checks.
- TDK release packaging excludes runtime `.logs/`, maintainer dependencies, and plugin-local tests; directory-glob exclusions are now honored by release inventory generation.
- Kept the maintainer package and lock beside the TypeScript source, not at plugin root, so marketplace installation does not auto-install build dependencies.

## [3.0.3] - 2026-08-17

### Added
- `Binding coverage: {n} of {N} typed files` summary line plus a per-file `Binding` column in the `memory-index.md` template

### Changed
- guardian `CONFLICT` now requires a resolvable `Evidence: <memory-path>#<anchor>` citation to a typed `binding: true` file, and the agent must not read application source to raise one — source-only claims become `NOT CHECKED` and defer to `/tdk-consistency-check --deep` Pass K
- index regeneration writes the `Binding` column and recomputes `Binding coverage:` without inferring a default; fresh init computes both counts from the files it actually wrote

## [3.0.2] - 2026-07-27

### Changed
- tdk-memory-agent model upgraded from sonnet to opus

## [3.0.1] - 2026-07-20

### Changed
- tdk-memory-query: add deterministic, bounded data-model resolution across file and MCP transports with canonical result envelopes and reversible marker escaping
- tdk-memory-agent: use one entity-result cache, preserve resolver outcomes, and require binding evidence before reporting conflicts
- tdk-memory-init/tdk-memory-update/tdk-memory-changelog: align guidance with Memory v3 paths and binding frontmatter

## [3.0.0] - 2026-06-28

### Changed
- Memory: Upgraded memory agent and skills to support v3 memory claim extraction, binding checks, and schema layout.
- Configurations: Updated existing templates with v3 metadata fields.

## [2.1.0] - 2026-06-28

### Added
- Added obsidian-mcp-action-contract.md defining the new Obsidian MCP action contract.

### Changed
- Update tool discovery and availability checks to target the Obsidian vault action contract.
- Update update and patch flows to use the Obsidian vault/edit contract.
- Align tdk-memory-agent.md instructions with the Obsidian action contract.

## [2.0.0] - 2026-06-17

### Added
- Added new tdk-memory-agent agent to handle unified memory validation and loading

### Changed
- Updated tdk-memory-update requirements to remove the deleted preload skill

### Removed
- Removed legacy memory components: memory-guardian agent (was 0.1.2) and tdk-memory-preload skill (was 0.0.8)

## [1.0.0] - 2026-06-15

### Added
- Add .claude-plugin/interface.json interface definition

### Removed
- Move .codex-plugin/plugin.json to codex-plugins registry

## [0.3.3] - 2026-06-07

### Changed
- tdk-memory-changelog: replaced hardcoded plugin script path with ${CLAUDE_PLUGIN_ROOT}
- tdk-memory-checksum: replaced hardcoded skill script path with ${CLAUDE_SKILL_DIR}
- tdk-memory-init: replaced hardcoded plugin script path with ${CLAUDE_PLUGIN_ROOT} in SKILL.md and fresh-init-flow reference
- tdk-memory-update: replaced hardcoded plugin script path with ${CLAUDE_PLUGIN_ROOT} in SKILL.md and flow-update reference files

## [0.3.2] - 2026-05-29

### Changed
- tdk-memory-init: correct checksum helper command paths for installed plugins directory
- tdk-memory-update: correct checksum helper command paths for installed plugins directory

## [0.3.1] - 2026-05-21

### Changed
- tdk-memory-init: update memory-index template to reference renamed .md.tpl template files
- tdk-memory-update: update routing tables and template read paths to reference renamed .md.tpl template files (both normal and MCP flows)
