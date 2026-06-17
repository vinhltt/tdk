# Changelog

All notable changes to this plugin will be documented in this file.

Format: [Keep a Changelog](https://keepachangelog.com/en/1.1.0/), Semver.

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
