# Changelog

All notable changes to this plugin will be documented in this file.

Format: [Keep a Changelog](https://keepachangelog.com/en/1.1.0/), Semver.

## [5.0.1] - 2026-06-17

### Changed
- Updated core skills to integrate with the new tdk-memory-agent validation mode
- Updated tdk-specify to run memory validation and handle business-conflict resolutions
- Updated tdk-clarify to parse the Guardian Report and generate clarification questions
- Updated tdk-analyze to write Guardian Report findings to the analysis report
- Updated tdk-plan to run the new agent in Phase 0.guardian and Step 0.memory

## [5.0.0] - 2026-06-15

### Added
- Add .claude-plugin/interface.json interface definition

### Removed
- Move .codex-plugin/plugin.json to codex-plugins registry

## [4.0.1] - 2026-06-13

### Changed
- Updated tdk-sub-workspace-docs SKILL.md to clarify generated doc set behavior and simplify execution flow.

## [4.0.0] - 2026-06-13

### Added
- Added constitution.md.tpl bootstrap template for --init project initialization

### Changed
- tdk-constitution: major revamp with --init <brief|file> branch — bootstraps memory, renders project-knowledge artifacts

### Removed
- tdk-ut-backfill-auto skill
- tdk-ut-backfill-impl skill

## [3.4.12] - 2026-06-12

### Changed
- tdk-plan/handle-existing-plan.md — replace Bun eval snippet with CLI wrapper call for dependency validation; add note prohibiting bun -e/bun --eval for this check

## [3.4.11] - 2026-06-09

### Changed
- Project root resolution: 11 skills (tdk-analyze, tdk-checklist, tdk-clarify, tdk-config-diff, tdk-config-index, tdk-config-sync, tdk-implement, tdk-plan, tdk-status, tdk-sub-workspace-docs, tdk-ut-backfill-plan) replace $CLAUDE_PROJECT_DIR-based script invocation with agent-resolved-project-root / bash -lc pattern

## [3.4.10] - 2026-06-08

### Changed
- tdk-plan: Enforce exact-path reads for plan-skill-routing.md; prohibit Search/Grep/Glob for absence checks
- tdk-plan: Skip interactive missing-file flow when --red-team/--validate flags active

## [3.4.9] - 2026-06-06

### Changed
- tdk-plan: USER_CONTENT support - accepts freeform content after TASK_ID, routed as planning instruction (default/fast/hard), review focus (--red-team), or validation focus (--validate)
- tdk-plan: replaced fragile cd $CLAUDE_PROJECT_DIR pattern with portable PROJECT_DIR resolver across SKILL.md and all 6 reference files
- tdk-plan modes.md: added USER_CONTENT routing table, <TASK_ID> <content> dispatch examples, STOP cases for unknown flags with = patterns

## [3.4.8] - 2026-06-05

### Added
- Contract test tdk-implement-phase-selection-contract.test.ts asserting parse-before-validate ordering and --phase NN behaviors

### Changed
- tdk-implement skill: add --phase NN / --phase=NN single-phase selection mode; Step 0 split into parse + validate + load-context; new Resolve Target Rows step; phaseByNumber map replaces index-based blocker lookup

## [3.4.7] - 2026-06-03

### Changed
- Align existing-plan follow-up phase generation with the standard phase-file contract: replace the legacy follow-up phase template with YAML frontmatter and required phase sections.

## [3.4.6] - 2026-06-02

### Added
- Add spec-plan-drift.ts CLI entry point for structured drift finding output
- Add spec-plan-drift-model.ts with type definitions, severity/type ranks, question IDs, and action option mappings
- Add spec-plan-drift-markdown.ts with markdown parsing utilities for spec and phase file analysis
- Add spec-plan-drift.test.ts with test coverage for drift detection logic

### Changed
- validate-workflow.md: add drift preflight step, persist drift rows, reuse persisted rows on resume, update file paths to canonical phases/phase-NN-*.md
- validate-question-framework.md: document all 5 drift question types with action options, remove fixed 8-question hard cap, batch at most 4 questions per AskUserQuestion call
- tdk-plan-reference-contract.test.ts: add 4 contract assertions covering drift preflight, resume behavior, severity-driven batching, and drift-type action mapping

## [3.4.5] - 2026-06-02

### Changed
- tdk-plan: strengthen research and design guidance with project-memory checks, pattern scouting, and operability notes

## [3.4.4] - 2026-06-01

### Changed
- tdk-plan: update the planning flow to write timestamped research reports under research/ instead of a top-level research.md, including output contracts, gates, regeneration scope, and researcher orchestration

## [3.4.3] - 2026-06-01

### Changed
- Make script commands CWD-independent — resolve project root via CLAUDE_PROJECT_DIR / GITHUB_WORKSPACE / git rev-parse and run scripts in a $PROJECT_DIR/.specify/scripts/ts subshell.
- tdk-implement: add Script Command Contract section; wrap check-prerequisites, status, parse-phases-table, and phase-status update calls in the portable subshell.
- tdk-status: resolve project root portably before status-collector calls.

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
