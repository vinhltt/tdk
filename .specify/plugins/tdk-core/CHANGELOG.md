# Changelog

All notable changes to this plugin will be documented in this file.

Format: [Keep a Changelog](https://keepachangelog.com/en/1.1.0/), Semver.

## [3.4.2] - 2026-05-31

### Changed
- tdk-plan: merge plan output layout and output standards into `plan-output-contract.md`
- tdk-plan: hard-gate plan artifact writes until the merged output contract is loaded

## [3.4.1] - 2026-05-31

### Changed
- tdk-implement: rename primary plan implementation skill from tdk-implement-from-plan and update routed workflow references
- tdk-status: remove legacy tasks.md fallback recommendations and point ready/in-progress plans at /tdk-implement
- tdk-plan and UT shims: update implementation next-step guidance to /tdk-implement

## [3.4.0] - 2026-05-31

### Changed
- tdk-plan: UT planning now delegates to `/tdk-ut-backfill-plan`; generated UT phase files receive consumer test skills through `plan-skill-routing.md`
- tdk-implement-from-plan: executes explicit `## Delegate Skills` before generic implementation and stops UT phases that lack a routed test delegate
- tdk-ut-backfill-plan: reads the shared skill-routing contract and injects matched `test` skills into `ut/phases/*.md`

### Deprecated
- tdk-ut-backfill-auto: replaced by `/tdk-plan` + `/tdk-implement-from-plan` routed workflow
- tdk-ut-backfill-impl: replaced by consumer test skills mapped in `plan-skill-routing.md`

## [3.3.2] - 2026-05-31

### Changed
- tdk-implement-from-plan: add read-only Status Preflight (decision table by feature_status); convert F3 stale in_progress abort into interactive recovery gate (retry/mark done/skip/cancel); renumber steps
- tdk-status: add Shared JSON Contract section — status collector is the read-only preflight contract for other skills
- tdk-sub-workspace-docs: write docs under sub-workspaces/<name>/ (was <wsPath>/)

## [3.3.1] - 2026-05-30

### Changed
- Updated handle-existing-plan.md reference to include status vocabulary validation step (Step 8b) using new plan-status-validator CLI tool

## [3.3.0] - 2026-05-24

### Added
- tdk-specify: --fast flag for single-recommendation mode (replaces removed tdk-specify-fast skill)
- tdk-specify: new references/spec-writing-principles.md and references/spec-quality-guidelines.md extracted from inline SKILL.md
- tdk-specify: two new eval cases (id 5 + 6) covering --fast mode in English and Vietnamese

### Changed
- tdk-specify: SKILL.md restructured (3.0.0 -> 3.3.0); description documents default vs --fast modes; principles moved to references
- tdk-constitution: spec-template reference wrapping/reformatting (9-section list reflow)

### Removed
- tdk-specify-fast: skill removed; functionality merged into tdk-specify via --fast flag

## [3.2.0] - 2026-05-24

### Added
- hook-gateway.cjs — single entry point that checks .specify.json hooks.disabled[] before delegating to the actual hook
- __tests__/hook-gateway.test.cjs — covers disabled-list skip, fail-open on non-array, and delegation behavior

### Changed
- hooks.json — UserPromptSubmit and PreToolUse commands route through hook-gateway.cjs
- dev-context-injector.cjs and path-rule-injector.cjs — main() accepts pre-read stdinData from gateway, falls back to direct stdin read when standalone
- speckit-config-reader.cjs — defaults extended with hooks.disabled=[]; JSDoc added across exported helpers

## [3.1.0] - 2026-05-24

### Added
- Hook path-rule-injector.cjs — PreToolUse on Read|Edit|Write injects path-matched rules from .specify/rules/*.md
- Lib modules rule-loader.cjs, rule-matcher.cjs and vendored minimatch/yaml for hook-time rule resolution
- Sample rules under .specify/rules/: always-apply-project-guidelines, api-reference-guide, typescript-conventions
- Tests for rule-loader, rule-matcher, and path-rule-injector integration

### Changed
- hooks.json — new PreToolUse matcher and description update for path-rule-injector
- speckit-config-reader.cjs — getRulesPath renamed to getSubWorkspaceRulesPath; defaults extended with rules.path
- context-builder.cjs — call site updated to getSubWorkspaceRulesPath

## [3.0.0] - 2026-05-24

### Changed
- tdk-constitution: drop reference to removed tasks-template.md.tpl
- tdk-implement-from-plan: remove legacy tasks.md advisory check
- tdk-specify: drop /tdk-tasks from next-step guidance
- tdk-specify-fast: drop /tdk-tasks from next-step guidance
- tdk-ut-backfill-auto: drop /tdk-implement-task caller references

### Removed
- tdk-implement-task: remove deprecated skill (replaced by tdk-implement-from-plan with plan.md ## Phases as SoT)
- tdk-tasks: remove deprecated skill (replaced by /tdk-plan ## Phases table)

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
