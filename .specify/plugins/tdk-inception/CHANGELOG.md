# Changelog

All notable changes to this plugin will be documented in this file.

Format: [Keep a Changelog](https://keepachangelog.com/en/1.1.0/), Semver.

## [1.0.3] - 2026-08-08

### Changed
- tdk-workspace-dependency-policy output contract updated to reference delegate-routing.md
- tdk-workspace-layout-propose output contract, taxonomy, and template updated to reference delegate-routing.md

## [1.0.2] - 2026-07-29

### Changed
- tdk-docs-writer treats a missing or unreadable scoutReport as a degradation rather than a hard stop — generates from the pack alone and reports that it did, so a degraded run stays distinguishable from a full one
- tdk-sub-workspace-docs checks scout's exit status, warns and continues to the next target on failure, and surfaces per-target scout availability in the run summary

## [1.0.1] - 2026-07-20

### Changed
- tdk-constitution: add explicit --init/--update/no-flag mode resolution and stop on invalid combinations

## [1.0.0] - 2026-07-14

### Added
- Add the tdk-inception plugin interface and synchronized Claude, Codex, and Cursor manifests
- Project inception suite: consolidate 15 project-inception and workspace-foundation skills under dedicated ownership
- tdk-docs-writer: add the sub-workspace documentation agent under inception ownership
