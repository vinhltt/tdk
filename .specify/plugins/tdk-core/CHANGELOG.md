# Changelog

All notable changes to this plugin will be documented in this file.

Format: [Keep a Changelog](https://keepachangelog.com/en/1.1.0/), Semver.

## [1.10.2] - 2026-05-19

### Changed
- tdk-analyze: replace direct `parsePhasesTable` import with CLI wrapper (`parse-phases-table.ts --json`)
- tdk-implement-from-plan: migrate from TS module imports to CLI wrappers for parse-phases-table, update-phase-frontmatter-status, update-phase-status; enforce phase-file-first update order on every status transition
- tdk-plan: unify status vocab to `todo | in_progress | done | skipped | blocked | cancelled`, bump schema_version to 3; deprecate header-block in phase files in favor of YAML frontmatter; document CLI update flow for plan.md table
- tdk-ut-backfill-auto: replace `parsePhasesTable` import with `parse-phases-table.ts --json` CLI call in caller integration docs

## [1.10.1] - 2026-05-13

### Changed
- tdk-plan: update handle-existing-plan.md reference with improved prose validation guidance
