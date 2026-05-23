# Changelog

All notable changes to this plugin will be documented in this file.

Format: [Keep a Changelog](https://keepachangelog.com/en/1.1.0/), Semver.

## [2.1.0] - 2026-05-23

### Added
- **[Skills]** tdk-specify-fast evals: evals.json + multi-sw/.specify.json fixture
- **[Skills]** tdk-specify evals: multi-sw/.specify.json fixture

### Changed
- **[Skills]** tdk-specify (→ 2.1.0): 9-section spec format with Impact Surface detection
- **[Skills]** tdk-specify-fast (→ 2.1.0): direct YAGNI/KISS variant, no embedded brainstorm
- **[Skills]** tdk-analyze (→ 2.1.0): Passes H (Scope Boundary) + I (Impact Surface), legacy-format detection
- **[Skills]** tdk-clarify (→ 2.1.0): new taxonomy (Problem Clarity, Scope Boundary, Impact Surface, Risks)
- **[Skills]** tdk-checklist (→ 2.1.0): success-criteria & risks coverage, [sw/module] tag checks
- **[Skills]** tdk-constitution, tdk-implement-task, tdk-plan, tdk-ut-backfill-plan: format-alignment touch-ups

## [2.0.0] - 2026-05-22

### Changed
- tdk-ut-backfill-auto: replace check/create-rules orchestration with consumer UT skill resolution from .claude/skills/
- tdk-ut-backfill-plan: drop rule cascade merge; read UT conventions from consumer skill instead of ut-rule.md
- tdk-ut-backfill-impl: drop rule cascade merge and check-rules gate; read UT conventions from consumer skill
- tdk-config-diff: update example paths away from ut-rule.md to generic naming rule
- tdk-config-index: drop ut-rule.md from auto-generated system documents list
- tdk-config-sync: update example paths away from ut-rule.md to generic naming rule
- tdk-plan: UT phase detection now checks for consumer UT skill in .claude/skills/ instead of ut-rule.md

### Removed
- tdk-ut-backfill-check-rules: remove skill (UT conventions now sourced from consumer .claude/skills/)
- tdk-ut-backfill-create-rules: remove skill (consumer owns UT skill creation)

## [1.11.1] - 2026-05-21

### Changed
- tdk-checklist: update template reference to checklist-template.md.tpl after template rename
- tdk-constitution: update template references (plan/spec/tasks) to .md.tpl after template rename
- tdk-specify: update spec-template reference to spec-template.md.tpl after template rename
- tdk-specify-fast: update spec-template reference to spec-template.md.tpl after template rename
- tdk-tasks: update tasks-template reference to tasks-template.md.tpl after template rename
- tdk-ut-backfill-plan: update ut-plan-template and ut-phase-template references to .md.tpl after template rename

## [1.11.0] - 2026-05-21

### Added
- tdk-plan v1.11.0: skill-routing reference + Step 0.1b that loads SKILL_ROUTING from {docs.path}/custom-workflow/plan-skill-routing.md; opt-in via AskUserQuestion, never auto-create
- tdk-plan v1.11.0: inline '## Delegate Skills' injection during design phase — sub-workspace + domain matching with global fallback, idempotent replace, pre-injection re-read to defeat context drift, EC-11 advisory for unrouted sub-workspaces

### Changed
- tdk-plan v1.11.0: red-team and validate workflows load SKILL_ROUTING inline so reviewers/validators can assess skill-assignment quality per phase; modes.md adds Step 0.1b row; plan-organization.md documents '## Delegate Skills' section between Key Insights and Requirements in phase template
- tdk-constitution: fix typo in shared brainstorm reference path (-brainstorm.md → brainstorm.md)

## [1.10.2] - 2026-05-19

### Changed
- tdk-analyze: replace direct `parsePhasesTable` import with CLI wrapper (`parse-phases-table.ts --json`)
- tdk-implement-from-plan: migrate from TS module imports to CLI wrappers for parse-phases-table, update-phase-frontmatter-status, update-phase-status; enforce phase-file-first update order on every status transition
- tdk-plan: unify status vocab to `todo | in_progress | done | skipped | blocked | cancelled`, bump schema_version to 3; deprecate header-block in phase files in favor of YAML frontmatter; document CLI update flow for plan.md table
- tdk-ut-backfill-auto: replace `parsePhasesTable` import with `parse-phases-table.ts --json` CLI call in caller integration docs

## [1.10.1] - 2026-05-13

### Changed
- tdk-plan: update handle-existing-plan.md reference with improved prose validation guidance
