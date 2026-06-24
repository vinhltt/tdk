---
tags: [changelog, config]
status: active
---
# Changelog

All notable changes to the project configuration (.specify/, .claude/, .github/)
will be documented in this file.

Format: [Keep a Changelog](https://keepachangelog.com/en/1.1.0/)
Versioning: [Semantic Versioning](https://semver.org/spec/v2.0.0.html)

## [1.77.2] - 2026-06-24

### Changed
- **[Guides]** Updated several guide documents for TDK improvements.
- **[Scripts]** Transition Codex slug normalization to kebab-case and update tools
  - Modified `flat-claude-adapter.ts` and related test files.
  - Update `toCodexSlug` to use hyphens instead of underscores
  - Support rewriting legacy underscore-based prefixes in `rewriteCodexSlugPrefix` and `rewriteCodexGeneratedText`
  - Update harness, mapper, plan, and convert-flat tests to reflect kebab-case slugging

## [1.77.1] - 2026-06-21

### Changed
- **[tdk-discovery]** Add error recovery guidance and expand templates with explicit instructions
  - Introduce error recovery situations table to guide resolution of vague briefs or existing directories
  - Support depth auto-detection based on brief length
  - Clarify allowed in-section additions (MoSCoW tags, skip-justification notes) in discovery output contract
  - Expand templates (index, mvp-scope, personas, problem) with explicit cutline instructions, advisory checklist notes, and open-questions justification

## [1.77.0] - 2026-06-21

### Added
- **[Scripts]** Contract tests for HLD and tdk-specify discovery integration
  - `tdk-hld-requirement-overview-reference-contract.test.ts` — verifies requirement-overview stays reference-first
  - `tdk-specify-discovery-cleanup-contract.test.ts` — verifies discovery is optional context, not copied into spec

### Changed
- **[tdk-high-level-design]** Reframe `requirement-overview.md` as reference-first design context instead of PRD restatement; clarify HLD enriches existing spec requirements without becoming a second requirement source
- **[tdk-specify]** Add discovery-aware guidance: reference `discovery/` artifacts in §1 and §4 instead of copying prose; prevent discovery content from leaking into UR-*/FR-*/SC-* IDs
- **[tdk-constitution]** Sync codex mirror version (4.1.0 → 5.4.0)
- **[tdk-task-breakdown]** Sync codex mirror version (5.3.0 → 5.4.0); preserve downstream citation authority (HLD never becomes citation source)
- **[Templates]** Update HLD and spec templates for reference-first design context
  - `requirement-overview.md.tpl` — replace PRD restatement placeholders with source-pointer placeholders
  - `index.md.tpl` — update artifact table to "Source references, covered IDs, design implications"
  - `spec-template.md.tpl` — add altitude boundary comment and discovery-aware hints for §1/§4

## [1.76.0] - 2026-06-21

### Added
- **[tdk-core]** Add `/tdk-discovery <epic-id> <brief|file> [--force]` skill: EPIC-ONLY v1 context discovery entry point that creates `problem.md`, `personas.md`, `mvp-scope.md`, and `index.md` under `{FEATURE_DIR}/discovery/` before `/tdk-specify`. Tracker-neutral and context-only — does not mint requirement IDs.
  - Adds `references/discovery-output-contract.md` (allowed output shape, per-artifact sections, forbidden outputs, product-level signals)
  - Adds 4 discovery templates: `problem.md.tpl`, `personas.md.tpl`, `mvp-scope.md.tpl`, `index.md.tpl`
- **[Templates]** Add `product-context.md.tpl` project knowledge template with AUTO-GEN sections for market context, business model, audience/personas, competitive context, product constraints, and open questions
- **[Scripts]** Add contract test suites
  - `tdk-discovery-skill-contract.test.ts` — validates epic-only boundary, context-only guarantees, tracker-neutrality, and template existence
  - `tdk-constitution-product-context-contract.test.ts` — verifies product-context rendering as constitution-owned artifact with marker-safe template
  - `tdk-specify-discovery-first-contract.test.ts` — asserts spec.md-based duplicate guard and optional discovery/index.md context loading

### Changed
- **[tdk-core]** `tdk-constitution`: render `product-context.md` as a constitution-owned project knowledge artifact; add product-level authority separation from epic discovery (version 4.0.0 → 4.1.0)
- **[tdk-core]** `tdk-specify`: support discovery-first feature directories by reading `discovery/index.md` as optional context and guarding duplicate specs by `spec.md` existence instead of any feature directory content
- **[Guides]** Document discovery phase and product-context across guides
  - `command-reference.md`: add discovery command entry and usage tip
  - `document-flow.md`: add discovery phase to document lifecycle
  - `01-full-feature-development.md`: integrate discovery as optional epic-level step
  - `07-project-setup-constitution.md`: add `product-context.md` to knowledge artifacts list
- **[General]** `tdk-primary-workflow.md`: add discovery vs specify routing guidance and high-level-design vs plan disambiguation
- **[Scripts]** `templates-roundtrip.test.ts`: include `product-context.md.tpl` in template roundtrip coverage

## [1.75.0] - 2026-06-21

### Added
- **[tdk-core]** Add `/tdk-high-level-design <id> [--greenfield] [--force]` skill: generates six approval-level high-level design artifacts under `high-level-design/` from a clarified spec, between `/tdk-clarify` and `/tdk-task-breakdown` for greenfield features.
  - Enforces the `## 9. Unresolved Questions` gate before any write; `--force` overwrites the existing directory but never bypasses the gate.
  - Adds `references/high-level-design-output-contract.md` (six artifacts, spec-section to artifact mapping, enrich-only citation rules, design-detail-as-assumed, greenfield rules).
- **[Templates]** Add `templates/high-level-design/` with six artifact templates (`index`, `requirement-overview`, `project-and-technical-overview`, `data-flow`, `screen-flow`, `decisions-and-risks`); `data-flow` and `screen-flow` reuse the memory flow/screen-flow table shapes.

### Changed
- **[tdk-task-breakdown]** Optionally read `high-level-design/` as enrichment context when present (new Step 1.5); behavior is unchanged when absent and citations remain `UR-*`/`FR-*`/`SC-*` from the spec. Bumped to 5.2.2.
- **[Guides]** Document the high-level-design stage in `command-reference.md`, `scenarios/01-full-feature-development.md`, `document-flow.md`, and the `README.md` lifecycle/skill count; the stage is marked optional and backward-compatible.

## [1.74.0] - 2026-06-21

### Added
- **[Guides]** Added [promote-convention.md](file:///home/vinhuwsl/1_cowork/0_personal/tdk-builder/projects/tdk/.specify/docs/guides/promote-convention.md) guide specifying sizing rules and manual flow for promoting work-items to child specs
- **[Scripts]** Added test suites [spec-template-frontmatter-contract.test.ts](file:///home/vinhuwsl/1_cowork/0_personal/tdk-builder/projects/tdk/.specify/scripts/ts/tests/spec-template-frontmatter-contract.test.ts) and [setup-plan-parent-spec-link.test.ts](file:///home/vinhuwsl/1_cowork/0_personal/tdk-builder/projects/tdk/.specify/scripts/ts/tests/setup-plan-parent-spec-link.test.ts) to enforce spec YAML frontmatter schema and link integrity

### Changed
- **[tdk-specify]** Instruct agent to emit YAML frontmatter at the top of the spec including `title`, `status`, `branch`, `created`, `input`, `memory_context_loaded`, and `schema_version: 1`, and support promote link fields (`parent_spec`, `promoted_from`)
- **[tdk-task-breakdown]** Document work-item promotion and regeneration rules
  - Add guidance on promoting large work-items to child specs instead of tracking as flat tasks, and document the promoted task row status column format (`promoted -> <child-id>`)
  - Enforce preservation of promoted tasks and their markers during task-breakdown regeneration
- **[Guides]** Updated [document-flow.md](file:///home/vinhuwsl/1_cowork/0_personal/tdk-builder/projects/tdk/.specify/docs/guides/document-flow.md) to reference the new promote-convention guide for Phase 0
- **[Scripts]** Add plan-setup integrity validation and expand tests
  - Update plan setup command ([setup-plan.ts](file:///home/vinhuwsl/1_cowork/0_personal/tdk-builder/projects/tdk/.specify/scripts/ts/src/commands/util/setup-plan.ts)) to validate declared `parent_spec` link integrity and stop with a loud error if parent spec.md is missing or invalid
  - Update [tdk-task-breakdown-skill-contract.test.ts](file:///home/vinhuwsl/1_cowork/0_personal/tdk-builder/projects/tdk/.specify/scripts/ts/tests/tdk-task-breakdown-skill-contract.test.ts) to assert coverage of promoted status column, markers, and demote checklists
- **[Templates]** Migrate [spec-template.md.tpl](file:///home/vinhuwsl/1_cowork/0_personal/tdk-builder/projects/tdk/.specify/templates/spec-template.md.tpl) to use standard YAML frontmatter block for metadata instead of inline bold-header metadata lines, and add placeholder/commented fields for `parent_spec` and `promoted_from` links

## [1.73.0] - 2026-06-20

### Added
- **[General]** Added TDK primary workflow routing rules to document canonical order and routing of TDK developer workflow intent to corresponding TDK skills.

## [1.72.0] - 2026-06-17

### Added
- **[tdk-core]** Add `/tdk-task-breakdown <id>` for portable Markdown work-item generation from clarified specs.
  - Writes `tasks-breakdown/index.md` and `tasks-breakdown/task-NNN-*.md` only.
  - Strict-blocks when `spec.md ## 9. Unresolved Questions` is not `None`.
  - Keeps GitHub, GitLab, Backlog, Jira, and other tracker issue creation consumer-owned.
- **[Scripts]** Add `tdk-task-breakdown-skill-contract.test.ts` to protect the task breakdown skill contract.
- **[Guides]** Document optional task breakdown in README, command reference, document flow, and full feature scenario.

### Changed
- **[tdk-core]** Bump plugin metadata to `5.2.0` and regenerate Codex package artifacts.

## [1.71.0] - 2026-06-17

### Added
- **[Skills]** Add reference documentation for tdk-implement phase routing
  - Add `routing-preflight.md` outlining preflight delegate checks
  - Add `phase-execution.md` and `project-and-phase-contract.md` contracts
- **[Scripts]** Add `tdk-implement-skill-routing-contract.test.ts` to validate routing preflight behavior

### Changed
- **[Skills]** Refactor tdk-implement execution workflow
  - Update `SKILL.md` to run read-only routing preflight before executing phases
  - Require internal references to be resolved relative to `SKILL_BASE_DIR` and reject `<!-- DO NOT LOAD` stub files
- **[Scripts]** Align existing contract tests (CWD independence, status preflight, phase selection) with updated routing contracts

## [1.70.0] - 2026-06-17

### Added
- **[tdk-memory]** Added new `tdk-memory-agent` agent to handle unified memory validation and loading.
- **[Scripts]** Added contract tests for the new `tdk-memory-agent`.

### Changed
- **[tdk-core]** Updated core skills to integrate with the new `tdk-memory-agent` validation mode:
  - Updated `tdk-specify` to run memory validation and handle business-conflict resolutions
  - Updated `tdk-clarify` to parse the Guardian Report and generate clarification questions
  - Updated `tdk-analyze` to write Guardian Report findings to the analysis report
  - Updated `tdk-plan` to run the new agent in Phase 0.guardian and Step 0.memory
- **[tdk-memory]** Updated `tdk-memory-update` requirements to remove the deleted preload skill.
- **[Scripts]** Updated test harness for legacy tree removal and prefix transforms.

### Removed
- **[tdk-memory]** Removed legacy memory components:
  - `memory-guardian` agent (was 0.1.2)
  - `tdk-memory-preload` skill (was 0.0.8)

## [1.69.0] - 2026-06-15

### Added
- **[General]**
  - Add `.claude-plugin/interface.json` to classic plugins (`tdk-core`, `tdk-memory`, `tdk-retro`, `tdk-scaffold`, `tdk-test-api`, `tdk-utils`) to support new interface protocols
  - Distribute preconverted Codex packages under `.specify/codex-plugins/` for all plugins
- **[Scripts]**
  - Add `harness convert` command to transform classic source plugins into OpenAI Codex layout packages under `.specify/codex-plugins/`
  - Add `harness install --harness codex` to install and verify packages from `.specify/codex-plugins/` into `.agents/skills/` and `.codex/`
  - Add Codex convert-flat command to migrate flat `.claude/` trees into additive Codex targets
  - Add comprehensive end-to-end and unit test coverage for Codex conversion, installation, target mapping, and distribution
- **[Guides]** Document the maintainer `harness convert` command and consumer `harness install --harness codex` commands in `command-reference.md`

### Changed
- **[Scripts]** Extend manifest compute CLI to support scanning and writing manifests for both classic `.specify/plugins/` and Codex `.specify/codex-plugins/` roots

## [1.68.0] - 2026-06-14

### Added
- **[Scripts]**
  - Add `harness convert-flat` to migrate an existing flat `.claude/` tree into additive Codex `.codex/` and `.agents/skills/` outputs without mutating the source tree
  - Add Codex reconcile and output writer modules that generate managed targets, merge `config.toml` and `hooks.json`, and record ownership in the harness install manifest
  - Add harness tests for Codex target mapping, flat Claude inventory conversion, migration reporting, reconcile planning, and output generation

### Changed
- **[Guides]** Document `harness install` and `harness convert-flat`, including additive migration behavior, conflict handling, and `--force` semantics
- **[Scripts]**
  - Harden harness writes with atomic replacement, post-write checksum verification, and harness-specific manifest loading for Codex installs
  - Extend target path and prefix rewrite safeguards so Codex-managed paths stay bounded to `.codex/` and `.agents/skills/`, while mapped `.specify/plugins/...` references and standalone brand tokens are rewritten consistently

## [1.67.1] - 2026-06-14

### Changed
- **[General]** Refresh the plugin inventory hash for the updated scaffold skill content
- **[Embedded Skills]** Clarify the scaffold skill prerequisite wording to refer to the installed scaffold plugin rather than a literal path check
- **[Scripts]** Prefix transform now rewrites standalone brand words and placeholder plugin paths before install-time checks
  - Rewrite `tdk` and `TDK` brand tokens using the configured target prefix
  - Preserve runtime placeholders while converting trailing-slash skill and agent paths into the flat install layout
  - Extend harness coverage for brand-word rewrites, placeholder refs, and trailing-slash path handling

## [1.67.0] - 2026-06-14

### Added
- **[Scripts]** Added Codex migration and compatibility transform modules for harness and hook assets
  - New `agent-to-codex-toml.ts` exports `convertAgentToCodexToml` and `buildCodexConfigEntry`, including model/toml mapping + sandbox derivation
  - New `codex-capabilities.ts` introduces Codex event capability tables, version detection utilities, and event support metadata
  - New `codex-hook-wrapper.ts` generates deny-aware hook wrapper scripts with event-level scrub rules and JSON passthrough behavior
  - New `codex-slug.ts` provides deterministic slug generation with safe Unicode normalization and hashing fallback
  - New `command-to-codex-skill.ts` adds command-to-skill conversion helpers with metadata validation and warning reporting
  - New `config-toml-merge.ts` and `features-flag-block.ts` add Codex `config.toml` merge helpers and managed `[features]` block synthesis
  - New `hooks-json-fragment.ts` builds Codex `hooks.json` fragments with managed wrapper resolution and origin metadata
  - New `index.ts` + `model-taxonomy.ts`/`model-taxonomy.json` introduce Codex model taxonomy wiring for the migration pipeline
- **[Scripts]** Added comprehensive harness transform tests for new Codex conversion and compatibility behavior
  - `agent-to-codex-toml.test.ts`
  - `codex-capabilities.test.ts`
  - `codex-hook-wrapper.test.ts`
  - `output-writer-primitives.test.ts`
  - `purity-invariant.test.ts`

## [1.66.0] - 2026-06-14

### Added
- **[Scripts]** New `checkbox-prompt.ts` module — extracts reusable checkbox picker logic (`selectFromCheckbox`, `canUseCheckboxPrompt`) with configurable title/hint/messages, decoupled from plugin-specific copy
- **[Scripts]** `selectHarnessInteractively()` added to `prompt.ts` for interactive harness selection via checkbox picker
- **[Scripts]** New test files covering harness install CLI behavior, picker seam, prefix-transform settings signature, and prompt helpers
  - `cli-harness-select.test.ts` — omitted/codex-only/combined harness scenarios
  - `harness-select-picker.test.ts` — mock.module picker seam for checkbox-capable TTY
  - `prefix-transform-segment-rewrite.test.ts` — settings-based `transformTextContent` signature
  - `prompt.test.ts` — `selectPluginsInteractively` and `selectHarnessInteractively`

### Changed
- **[Scripts]** `install.ts` — `--harness` option made optional; TTY-capable terminals show interactive checkbox picker; codex harness emits "coming soon" notice on stderr and exits 0 without installing
- **[Scripts]** `prefix-transform.ts` — refactored to `PrefixTransformSettings`-based signature; blanket-rewrite uses lookbehind to avoid hyphen-infix token rewrites; `claudeTargetMapper` handles `.specify/plugins/...` segment conversion
- **[Scripts]** `hook-merge.ts` — added `prefixSettings: PrefixTransformSettings` parameter replacing raw rewriteMap for hook-body text transforms
- **[Scripts]** `install-plan.ts` — passes `PrefixTransformSettings` to `transformFileContent` and `buildHookMerge`; uses identity settings (equal prefixes) when hooks/text rewrite is disabled
- **[Scripts]** Tests updated for `defaultPrefixSettings` fixture, hooks rewrite on/off coverage, and prefix migration scenarios

## [1.65.0] - 2026-06-13

### Added
- **[Scripts]**
  - Added `.specify/scripts/ts/tests/commands/plan-env-parser-resolution.test.ts` to validate parser-script candidate resolution order in `plan-env.ts`
  - Added `.specify/scripts/ts/tests/skill-body-portability.test.ts` regression test to reject forbidden `/ck:` and `plans/` references in source skill/agent bodies

### Changed
- **[Scripts]** `plan-env.ts` now resolves parser scripts from source, installed default, and custom `*-test-api-plan` plugin paths (deterministic candidate order)
- **[Skills]** Updated `tdk-sub-workspace-docs` skill documentation to remove a legacy pre-check step and clarify generated artifacts and error-handling expectations
- **[General]** Regenerated `.specify/plugins/manifest.json` with updated file hashes and timestamp

## [1.64.0] - 2026-06-13

### Added
- **[tdk-core]** Added `constitution.md.tpl` bootstrap template for `/tdk-constitution --init` project initialization
- **[Templates]** New `project-docs/` template suite: `project-overview-prd.md.tpl`, `system-architecture.md.tpl`, `project-roadmap.md.tpl`, `README.md.tpl`
- **[Scripts]** New `project-init-authority-contract.test.ts` — contract test verifying tdk-docs removal and sub-workspace docs preservation

### Changed
- **[tdk-core/tdk-constitution]** Major revamp: added `--init <brief|file>` branch — bootstraps `.specify/memory/`, renders project-knowledge artifacts (PRD, roadmap, architecture) from constitution authority; updated skill description and execution flow
- **[tdk-retro]** Refactored project-root resolution across `_shared/script-command-contract.md` and `tdk-retro-collect/SKILL.md`: replaced env-var/git discovery with explicit agent-provided argument; updated `tdk-retro-apply`, `tdk-retro-propose` accordingly
- **[Scripts]** Added `memoryPath` to `ConfigResult` and `SpecifyConfigSchema`; defaults to `.specify/memory`
- **[Templates]** Updated `sub-workspace-docs/` templates: README, code-standards, codebase-summary, system-architecture
- **[Guides]** Updated `command-reference.md` with `--init` flag; updated scenario 07 for `--init` mode; minor `speckit-setup-guide.md` doc reference rename
- **[Docs]** Updated README skill count 17→16

### Removed
- **[tdk-core]** Removed `tdk-ut-backfill-auto` skill
- **[tdk-core]** Removed `tdk-ut-backfill-impl` skill

## [1.63.5] - 2026-06-12

### Changed
- **[Skills]** `tdk-plan/handle-existing-plan.md` — replace Bun eval snippet with CLI wrapper call for dependency validation; add note prohibiting `bun -e`/`bun --eval` for this check
- **[Scripts]** Added `--validate-deps` flag to `parse-phases-table` CLI
  - `parse-phases-table.ts`: expose `--validate-deps` flag running `validateDependencies` inline
  - `parse-phases-table-cli.test.ts`: two new tests for `--validate-deps` (valid plan → no errors; forward-ref → error)
  - `tdk-plan-reference-contract.test.ts`: assert reference doc uses CLI wrapper, not Bun eval, for dep validation

## [1.63.4] - 2026-06-11

### Changed
- **[Setup]** Moved Python bootstrap runtime script from docs to shipped runtime path: `.specify/scripts/bash/setup-python-venv.sh`, updated setup step and docs references.
- **[Setup]** `config-detect` now distinguishes invalid config (`.specify/.specify.json`) with the concrete validation message from `detect-config.ts`; missing config now returns `SKIP` with actionable guidance.
- **[Setup]** Canonicalized distribution to bash `distribute.sh` fallback rules and removed retired Python distributor implementation (`sync-distribute-common-files.py` + `sync-config.yaml`) from `tdk-distribute`.
- **[Setup]** Added `.specify/docs/setup/` to the distributed include set so setup guides are available on downstream setup targets.
- **[Docs / Skills]** Updated `tdk-distribute` SKILL docs (both `.claude/` and `.agents/` copies) to document the bash-distributor flow.
- **[Versioning]** Bumped marketplace metadata to `1.63.4`; existing consumers should redistribute to receive the layout and script-path fix.

## [1.63.3] - 2026-06-09

### Added
- **[Scripts]** New `target-relative-path.ts` utility module — POSIX-safe path helpers (`normalizeTargetRelativePath`, `assertSafeClaudeTargetRelativePath`, `posixTargetPath`) replacing OS-separator-dependent `path.join` calls across the harness

### Changed
- **[Scripts]** Harness path normalization refactor: 9 files (`claude-target-mapper`, `file-write-plan`, `hook-merge`, `install-plan`, `install-writer`, `legacy-hooks-json-cleanup`, `manifest-store`, `prefix-transform`, `runtime-asset-transform`) now use posix-safe path utils — eliminates Windows backslash variance; adds `.claude/` boundary enforcement on manifest load; 8 test files updated
- **[tdk-core]** Project root resolution: 11 skills (`tdk-analyze`, `tdk-checklist`, `tdk-clarify`, `tdk-config-diff`, `tdk-config-index`, `tdk-config-sync`, `tdk-implement`, `tdk-plan`, `tdk-status`, `tdk-sub-workspace-docs`, `tdk-ut-backfill-plan`) replace `$CLAUDE_PROJECT_DIR`-based script invocation with `<agent-resolved-project-root>` / `bash -lc` pattern — agent resolves project root from harness context, not a fragile env-var chain
- **[tdk-utils]** Project root resolution: `tdk-load-project-context`, `tdk-scout`, `tdk-setup-guide` skills adopt same `<agent-resolved-project-root>` pattern

## [1.63.2] - 2026-06-08

### Changed
- **[Scripts]** Fixed harness prefix-transform and install-plan bugs for custom-prefix installs
  - `prefix-transform.ts`: Protect `.specify/plugins/…` source paths from rewriting during text transforms; fix `mapTargetPath` to rewrite `.claude/scripts/` and `.claude/hooks/` directory names; include plugin name itself in rewrite name set; extract `transformUnprotectedText` helper
  - `install-plan.ts`: Fix transformation order so runtime-asset resolution runs before prefix rewriting; pass full plugin catalog (`rewritePlugins`) instead of filtered selection to `buildPrefixRewriteMap` for correct cross-plugin content rewriting
  - `install.ts`: Discover and pass `rewritePlugins` catalog to `buildClaudeInstallPlan`
  - `plugin-discovery.ts`: Add `discoverPrefixRewritePlugins` export to load full manifest plugin catalog for prefix-rewrite scope
  - `hook-merge.ts`: Fix `rewriteHookHandler` to use transformed plugin id (from `rewriteMap`) rather than original id for hook command root directory
  - `types.ts`: Add optional `rewritePlugins?: DiscoveredPlugin[]` field to `BuildPlanInput`
  - Tests: Add comprehensive coverage in `hook-merge.test.ts`, `install-plan.test.ts`, `prefix-transform.test.ts`, `runtime-asset-transform.test.ts`, and `runtime-asset-transform-regression.test.ts`

## [1.63.1] - 2026-06-08

### Changed
- **[tdk-core / tdk-plan]** Enforce exact-path reads for `plan-skill-routing.md` across skill-routing, red-team, and validate workflows
  - `skill-routing.md`: Added explicit `ROUTING_FILE` resolution steps; prohibit Search/Grep/Glob for absence checks that can return false negatives
  - `red-team-workflow.md`: Always resolve exact `ROUTING_FILE = {docs.path}/custom-workflow/plan-skill-routing.md` path before inline load
  - `validate-workflow.md`: Use exact-path resolution for skill routing load; assess phase skill assignments
  - `SKILL.md`: Skip interactive missing-file AskUserQuestion/create flow when `--red-team`/`--validate` flags active
- **[Scripts]** Added contract test asserting exact-path read requirement for `plan-skill-routing.md` in `tdk-plan-reference-contract.test.ts`

## [1.63.0] - 2026-06-07

### Added
- **[Scripts]** Runtime asset transform module and tests
  - `runtime-asset-transform.ts`: harness module that resolves `${CLAUDE_PLUGIN_ROOT}` and `${CLAUDE_SKILL_DIR}` references to absolute installed paths at install time via `buildRuntimeAssetMap` / `transformRuntimeAssetContent`
  - `runtime-asset-transform.test.ts` + `runtime-asset-transform-regression.test.ts`: unit and regression tests

### Changed
- **[Scripts]** Refactored `install-plan.ts` to delegate runtime path resolution to the new `runtime-asset-transform` module (`buildRuntimeAssetMap`, `transformRuntimeAssetContent`)
- **[tdk-memory]** Fixed skill script path references across tdk-memory-changelog, tdk-memory-checksum, tdk-memory-init, tdk-memory-update — replaced hardcoded `.specify/plugins/tdk-memory/` paths with `${CLAUDE_PLUGIN_ROOT}` in SKILL.md and reference files
- **[tdk-utils]** Fixed skill script path references in brainstorming and shard-doc — replaced hardcoded `.claude/skills/` paths with `${CLAUDE_SKILL_DIR}` in SKILL.md and reference docs

## [1.62.5] - 2026-06-07

### Added
- **[Scripts]** Harness install: 4 new modules extending the install subsystem
  - `claude-target-mapper.ts` — `HarnessTargetMapper` abstraction + `claudeTargetMapper` impl; decouples target path resolution from plugin-discovery
  - `install-settings-paths.ts` — Secure path validation: symlink ancestor detection, protected root/file guards, `validateContainedNoFollowPath`, `validateSafeSegment`
  - `install-settings.ts` — Install settings persistence (v1 schema via zod): `loadInstallSettings`, `resolveClaudeSettings`, prefix normalization, multi-harness config
  - `prefix-transform.ts` — Prefix rewrite/transform engine for skill/agent/command names in target paths, file text content, and hook declarations
- **[Scripts]** Harness install: 4 new test files
  - `cli-settings-flow.test.ts` — End-to-end CLI settings flow
  - `install-settings.test.ts` — Install settings load/save/resolve
  - `manifest-store-migration.test.ts` — Legacy → per-harness manifest migration
  - `prefix-transform.test.ts` — Prefix transform logic

### Changed
- **[Scripts]** Harness install: extended existing modules with prefix transform, install settings integration, and per-harness manifests
  - `types.ts` — `HarnessName` adds `'codex'`; new `PrefixMigrationPlan`, `TransformedPluginFile` types; extended `PlannedWrite`, `InstallPlan`, `BuildPlanInput`, `ApplyResult`
  - `install.ts` — `--prefix` / `--migrate-prefix` CLI options; interactive prefix prompt; settings saved post-apply
  - `manifest-store.ts` — Per-harness manifest path (`harness-install/{harness}.json`) with legacy fallback
  - `install-plan.ts` — Source byte verification, prefix transform pipeline, duplicate target collision detection
  - `install-writer.ts` — Writes transformed content; persists install settings; migration journal output
  - `plugin-discovery.ts` — Delegates target path resolution to `claudeTargetMapper`
  - `checksum.ts` — Added `sha256Buffer`; `hook-merge.ts` passes rewrite map + hook checksums through
  - `render.ts` — Display updates for new plan fields
  - Updated tests: `install-plan.test.ts`, `install-writer.test.ts`, `fixtures.ts`

## [1.62.4] - 2026-06-06

### Added
- **[Scripts]** Harness install: new modules extracted from `install-plan.ts` and `hook-merge.ts` for cleaner separation of concerns
  - `file-write-plan.ts` — `classifyFile` logic for file write planning (path-traversal, symlink, directory-conflict, unmanaged target, managed drift detection)
  - `hook-path-rewrite.ts` — hook handler path rewriting for all hook types (`command`, `http`, `mcp_tool`, `prompt`, `agent`); validates and rewrites `${CLAUDE_PLUGIN_ROOT}/hooks/` and `${CLAUDE_PLUGIN_ROOT}/scripts/` references in any field
  - `hook-reconcile.ts` — hook key management and add/remove operations (`managedHookKey`, `addHook`, `removeHook`, `actualHookKeys`)
  - `legacy-hooks-json-cleanup.ts` — detects and plans removal of stale `hooks.json` files left over from old plugin installations under `.claude/hooks/`

### Changed
- **[Scripts]** `hook-merge.ts`: major refactor using new hook-path-rewrite and hook-reconcile modules
  - All hook types (`command`, `http`, `mcp_tool`, `prompt`, `agent`) now supported in settings merge (previously only `command`)
  - Hook identity uses normalized full handler JSON instead of command string only
  - `buildHookMerge` now returns `settingsChanged: boolean` — callers can skip writes when settings are unchanged
  - Plugin hooks processed in sorted order for deterministic output
- **[Scripts]** `collisions.ts`: added `unmanaged-stale-hooks-json-cleanup` collision kind for legacy hooks.json detection
- **[Scripts]** `install-plan.ts`: delegates file classification to `file-write-plan.ts`; integrates legacy hooks.json cleanup planning
- **[Scripts]** Test suite expanded: multi-plugin manifest fixtures, non-command hook type coverage, path rewriting validation, install-writer scenarios
- **[Docs]** `README.md`: clarified that hook scripts are installed under plugin-scoped paths (`.claude/hooks/<plugin>/`) and `hooks.json` files are source declarations only

## [1.62.3] - 2026-06-06

### Added
- **[Scripts]** `collisions.ts` — new module with `blockingCollisions` / `isPromptableCollision` helpers to separate promptable from hard-blocking collision entries

### Changed
- **[Scripts]** Harness install: unmanaged target files now trigger an interactive overwrite prompt instead of a hard block
  - `install-plan.ts`: unmanaged target collision now produces both a `write` and a `prompt` entry (previously collision-only)
  - `install-writer.ts`: uses `blockingCollisions` helper; `--yes` no longer approves unmanaged target overwrites; renamed `approveDrift` → `approveOverwrite`
  - `install.ts`: dry-run exit code now uses `blockingCollisions`; renamed `confirmDriftOverwrite` → `confirmOverwrite`
  - `render.ts`: added separate Prompts section in plan output; Blockers section now only shows non-promptable collisions
  - `types.ts`: extended `RequiredPrompt.type` to include `'unmanaged-target-overwrite'`; renamed `approveDrift` → `approveOverwrite` in `ApplyOptions`
  - `prompt.ts`: added interactive checkbox plugin selector (raw mode, Up/Down/j/k navigation, Space toggle, `a` to select/clear all, Enter confirm, Esc cancel)
  - Tests: added coverage for interactive overwrite approval, `--yes` rejection of unmanaged targets, and dry-run prompt display

## [1.62.2] - 2026-06-06

### Added
- **[Scripts]** `agent-output.ts` utility with `writeAgentJson`, `formatAgentJson`, `writeStderrLine` for standardized compact JSON stdout
  - `src/utils/agent-output.ts` — core utility
  - `tests/utils/agent-output.test.ts` — unit tests

### Changed
- **[Scripts]** Migrated all agent-facing CLI commands from `console.log(JSON.stringify(..., null, 2))` to `writeAgentJson()` for consistent compact single-line JSON output
  - `commands/config/diff.ts`, `commands/config/index.ts`
  - `commands/detect-config.ts`, `commands/feature/status.ts`, `commands/manifest/compute.ts`
  - `commands/scout/index.ts`, `commands/sub-workspace/docs.ts`
  - `commands/test-api/codegen-env.ts`, `plan-env.ts`, `testcase-env.ts`
  - `commands/ut/backfill/auto.ts`, `impl.ts`, `plan.ts`
  - `commands/util/check-prerequisites.ts`, `parse-phases-table.ts`, `plan-prose-validator.ts`, `plan-status-validator.ts`, `scan-cross-plan-deps.ts`, `setup-plan.ts`, `spec-plan-drift.ts`, `sync-docs-helpers/sync-modes.ts`
  - `lib/auto-gen-markers-cli.ts`, `utils/index.ts`, `utils/json-field.ts`
  - Tests updated with compact JSON format assertions

## [1.62.1] - 2026-06-06

### Changed

- **[tdk-plan]** `USER_CONTENT` support and portable script invocations
  - `/tdk-plan <id> [content] [flags]` accepts freeform content after `TASK_ID`; routed as planning instruction (`default`/`--fast`/`--hard`), review focus (`--red-team`), or validation focus (`--validate`)
  - Replaced fragile `cd $CLAUDE_PROJECT_DIR/.specify/scripts/ts` pattern with portable `PROJECT_DIR` resolver (`CLAUDE_PROJECT_DIR → GITHUB_WORKSPACE → git rev-parse`) across SKILL.md and all 6 reference files
  - `modes.md`: added USER_CONTENT routing table, `<TASK_ID> <content>` dispatch examples, and STOP cases for `--foo=bar` / `--phase=02` patterns
  - `red-team-workflow.md`: `USER_CONTENT` injected as review focus in every reviewer prompt
  - `validate-workflow.md`: `USER_CONTENT` biases question selection; focus logged in Validation Log header
- **[Scripts]** Added tdk-plan CWD-independent contract tests with `expectNoFragilePlanCommand` helper and USER_CONTENT mode-routing tests
- **[Guides]** Updated `/tdk-plan` syntax from `<id>` to `<id> [content] [flags]` with per-mode routing note

## [1.62.0] - 2026-06-05

### Added
- **[Scripts]** Contract test `tdk-implement-phase-selection-contract.test.ts` asserting parse-before-validate ordering and `--phase NN` / `--phase=NN` behaviors

### Changed
- **[tdk-core]** `tdk-implement` skill: add `--phase NN` / `--phase=NN` single-phase selection mode; Step 0 split into parse (Step 0) + validate (Step 0.1) + load-context (Step 0.2); new Step 5 `Resolve Target Rows`; `phaseByNumber` map replaces index-based blocker lookup; dependency checks in selected mode do not auto-run missing blockers; downstream steps renumbered accordingly
- **[Guides]** Updated command-reference, document-flow, evolution-comparison, migration-ut-rule-to-skill, scenarios 01/02/04/05/06/11, and tdk-ut-backfill-skills-usage to reflect `--phase NN` flag, new step numbering, and Status-column wording

## [1.61.1] - 2026-06-03

### Changed
- **[tdk-core]** Align existing-plan follow-up phase generation with the standard phase-file contract
  - Replaced the legacy follow-up phase template with YAML frontmatter, context links, success criteria, risk, security, next-step, and unresolved-question sections.
  - Added tests that validate frontmatter parsing, placeholder substitution, quoted titles, required section order, and removal of the legacy bold status block.
- **[Scripts]** Extend handle-existing-plan path-convention tests to cover phase template structure and YAML validity.

## [1.61.0] - 2026-06-02

### Added
- **[Scripts]** Add `spec-plan-drift` utility suite for deterministic spec-plan drift detection
  - `spec-plan-drift.ts` — CLI entry point; reads spec.md, plan.md, and canonical phase files; outputs structured JSON drift findings
  - `spec-plan-drift-model.ts` — Type definitions, severity/type ranks, question IDs, and action option mappings
  - `spec-plan-drift-markdown.ts` — Markdown parsing utilities (parseSpec, alignPlanPhases, matchesRequirement, extractEntityTerms)
  - `spec-plan-drift.test.ts` — Test coverage for drift detection logic

### Changed
- **[tdk-plan]** Extend validation workflow and question framework with spec-plan drift preflight
  - `validate-workflow.md`: add drift preflight step (run `spec-plan-drift.ts` before questions), persist drift rows to `#### Spec-Plan Drift Preflight` table, reuse persisted rows on resume, update file paths to canonical `phases/phase-NN-*.md`
  - `validate-question-framework.md`: document all 5 drift question types with action options, remove fixed 8-question hard cap, batch at most 4 questions per AskUserQuestion call
- **[Tests]** Add 4 contract assertions in `tdk-plan-reference-contract.test.ts` covering drift preflight, resume behavior, severity-driven batching, and drift-type action mapping

## [1.60.0] - 2026-06-02

### Changed
- **[tdk-plan]** Strengthen planning research and design guidance.
  - Require project-memory checks, previous plan search, and terminology conflict review before project-knowledge research.
  - Require scouts to identify implementation patterns, test organization, config, dependencies, and verification scripts before design.
  - Add operability considerations for testability, monitoring, deployment impact, rollback, and observability when runtime behavior changes.
- **[tdk-utils]** Retarget plugin metadata from the retired planning utility toward research, scouting, and problem solving.
- **[Tests]** Assert the retired `tdk-utils/planning` skill is absent from the manifest and no longer referenced by `tdk-plan`.
- **[Docs]** Align marketplace setup and README plugin summaries with the remaining utility skills and current skill counts.

### Removed
- **[tdk-utils]** Remove retired `planning` skill (was 1.10.8) and its standalone planning reference docs after its guidance moved into `tdk-plan`.

## [1.59.0] - 2026-06-01

### Added
- **[tdk-retro]** Add a retrospective self-learning plugin with collect, propose, and apply skills.
  - Collects evidence-backed feedback from reviews, phase drift, UT results, optional Langfuse traces, and user feedback into `retro-feedback.md`.
  - Proposes up to 10 technical or memory learning deltas in `learning-delta.md` with explicit target routing and evidence.
  - Applies only user-approved technical edits and delegates memory updates through `/tdk-memory-update`.
- **[Examples]** Add the `RETRO-TEST` fixture spec with phases, review findings, sessions, and UT results for validating the retro workflow.
- **[Tests]** Cover retro skill command contracts and timestamped research report expectations.

### Changed
- **[tdk-plan]** Move planning research output from top-level `research.md` to timestamped `research/yyMMdd-HHmmss-{slug}.md` reports.
  - Update required output contracts, gates, regeneration scope locks, and research phase instructions.
  - Require parallel researcher subagents to receive explicit output paths and wait for all reports before design.
- **[tdk-utils]** Align shared planning and research guidance with the `research/` directory report model.
  - Update the `researcher` agent invocation contract, self-resolved output naming, and skill dependencies.
  - Update planning output standards and research skill path resolution to avoid `researcher-XX-{topic}.md`.
- **[Scripts]** Check `research/` as a directory prerequisite instead of `research.md`.
- **[Templates]** Document `research/` as the Phase 0 output location in the plan template.
- **[Guides]** Update command reference, document flow diagrams, and full-feature scenario docs to reference `research/` reports.
- **[Marketplace]** Register `tdk-retro` in the plugin marketplace catalog.

## [1.58.3] - 2026-06-01

### Changed
- **[Skills]** Make TDK script commands CWD-independent — resolve the project root via `CLAUDE_PROJECT_DIR` / `GITHUB_WORKSPACE` / `git rev-parse --show-toplevel` and run scripts in a `$PROJECT_DIR/.specify/scripts/ts` subshell instead of `cd $CLAUDE_PROJECT_DIR/...`.
  - tdk-implement: add a Script Command Contract section; wrap check-prerequisites, status, parse-phases-table, and phase-status update calls in the portable subshell.
  - tdk-status: resolve the project root portably before status-collector calls.
  - tdk-load-project-context: resolve the project root portably before the detect-config call.

### Added
- **[Tests]** Add `cwd-independent-skill-contract.test.ts` asserting the portable root resolver and subshell command contract across tdk-implement, tdk-status, and tdk-load-project-context.

## [1.58.2] - 2026-05-31

### Changed
- **[tdk-plan]** Merge plan output layout and output standards into `plan-output-contract.md`.
- **[tdk-plan]** Add a hard gate that stops plan artifact writes unless the merged output contract is loaded.
- **[Tests]** Add a contract test for active `tdk-plan` reference loading and hard-gate wording.

## [1.58.1] - 2026-05-31

### Changed
- **[Skills]** Rename the primary plan implementation command to `/tdk-implement`
  - tdk-core: rename `tdk-implement-from-plan` to `tdk-implement` and update analyze, plan, status, and UT routing references.
  - tdk-utils: point planning guidance, context loading, task-id validation, and red-team skepticism references at `/tdk-implement`.
- **[Guides]** Align command reference, document-flow, migration, UT workflow, and scenario docs with `/tdk-implement` as the implementation command.
- **[Scripts]** Remove legacy `tasks.md` fallback recommendations from feature status; ready and in-progress plans now recommend `/tdk-implement`.
- **[Templates]** Point the UT plan template next step at `/tdk-implement`.

## [1.58.0] - 2026-05-31

### Changed
- **[Skills]** Route unit-test implementation to consumer skills via `plan-skill-routing.md`
  - tdk-plan: UT planning delegates to `/tdk-ut-backfill-plan`; generated UT phase files receive consumer test skills through `plan-skill-routing.md`
  - tdk-implement-from-plan: executes `## Delegate Skills` before generic implementation; stops UT phases lacking a routed test delegate
  - tdk-ut-backfill-plan: reads the shared skill-routing contract and injects matched `test` skills into `ut/phases/*.md`
- **[Templates]** Align UT/routing templates with consumer-skill routing
  - plan-skill-routing-template: `test` domain points to a consumer unit-test skill
  - ut-phase-template: add `## Delegate Skills` section populated from routing
  - ut-plan-template: next-step points to `/tdk-implement-from-plan`
- **[Guides]** Update UT workflow docs for routed test implementation (command-reference, document-flow, evolution-comparison, migration-ut-rule-to-skill, tdk-ut-backfill-skills-usage, scenarios 01/04/05/06/07/13)

### Deprecated
- **[Skills]** Unit-test execution skills replaced by routed consumer workflow
  - tdk-ut-backfill-auto: replaced by `/tdk-plan` + `/tdk-implement-from-plan`
  - tdk-ut-backfill-impl: replaced by consumer test skills mapped in `plan-skill-routing.md`

## [1.57.1] - 2026-05-31

### Added
- **[Scripts]** Agent-version normalizer + contract tests
  - `normalize-agent-version.ts`: fold a stray top-level agent `version:` into `metadata.version` (line-based edit, preserves folded multi-line description blocks)
  - `normalize-agent-version.test.ts`: cover fold / create-block / idempotent / multi-line / malformed-frontmatter cases
  - `status-preflight-skill-contract.test.ts`: assert `tdk-implement-from-plan` consumes the `/tdk-status` collector JSON contract

### Changed
- **[Embedded Skills]** Status-aware implementation flow
  - `tdk-implement-from-plan`: add read-only Status Preflight step (decision table keyed on `feature_status`); convert F3 stale-`in_progress` hard abort into an interactive recovery gate (retry / mark done / skip / cancel); renumber steps 2–7
  - `tdk-status`: add Shared JSON Contract section — the status collector is the read-only preflight contract for other skills
  - `tdk-sub-workspace-docs`: write docs under `sub-workspaces/<name>/` (was `<wsPath>/`)
- **[Scripts]** Sub-workspace docs output-path alignment
  - `sub-workspace/types.ts`: update `outputDir` comment to the `<name>` path
  - `docs.test.ts`: update path expectations to `sub-workspaces/frontend`

## [1.57.0] - 2026-05-30

### Added
- **[Scripts]** Plan status validator CLI tool
  - New `plan-status-validator` command validates plan.md phase table status cells against enforced vocabulary (`todo|in_progress|done|skipped|blocked|cancelled`)
  - Test fixtures and comprehensive test suite for validator validation

### Changed
- **[tdk-plan]** Updated `handle-existing-plan.md` reference to include status vocabulary validation step (Step 8b) using new plan-status-validator CLI tool
- **[planning]** Updated status vocabulary in `output-standards.md` from legacy values (`pending|in-progress|completed|cancelled`) to enforced values (`todo|in_progress|done|skipped|blocked|cancelled`)
- **[Scripts]** Enhanced phases-table-parser test coverage for new validator integration

## [1.56.0] - 2026-05-29

### Added
- **[tdk-scaffold]** Adds `tdk-scaffold-from-recommendation` for turning approved recommendation reports into skill and agent scaffolds.
  - Generates `SKILL.md` files and reference stubs for approved skill recommendations.
  - Generates `agent.md` files for approved agent recommendations.
  - Adds reusable skill and agent output pattern references for generated files.

### Changed
- **[Marketplace]** Registers `tdk-scaffold` in the marketplace catalog with strict loading enabled.
- **[tdk-scaffold]** Updates Claude, Codex, and Cursor plugin descriptions to cover both recommendation and scaffolding workflows.

## [1.55.0] - 2026-05-29

### Added
- **[Scripts]** Claude harness installer command suite
  - Adds `tdk harness install --harness claude` command wiring.
  - Discovers selected plugins from the manifest, plans managed `.claude/` file writes, merges plugin hooks, tracks ownership, detects collisions and drift, and supports dry-run output.
  - Adds tests for CLI behavior, plugin discovery, hook merging, install planning, install writing, and consumer root resolution.
- **[tdk-memory]** Adds Codex and Cursor plugin manifest mirrors alongside the Claude plugin manifest.

### Changed
- **[Claude Skills]** Aligns marketplace path references with the installed `.specify/plugins/` directory in tdk-bump tests, tdk-distribute sync, and tdk-skill-docs-sync scanning.
- **[tdk-memory]** Corrects checksum helper command paths for installed plugin layout in init and update flows.
- **[tdk-utils]** `brainstorming`: normalizes script README guidance formatting and references the installed skill by name.

## [1.54.0] - 2026-05-24

### Added
- **[tdk-specify]** Consolidated `--fast` flag support — single-recommendation mode (no Option A/B brainstorm). Replaces removed `tdk-specify-fast` skill.
- **[tdk-specify]** New references extracted from inline SKILL.md:
  - `references/spec-writing-principles.md` (YAGNI/KISS/DRY + Planning Framework + Embedded Brainstorming)
  - `references/spec-quality-guidelines.md` (section requirements, AI rules, success criteria)
- **[tdk-specify]** Two new eval cases (id 5 + 6) covering `--fast` mode in English and Vietnamese.

### Changed
- **[tdk-specify]** SKILL.md restructured (3.0.0 → 3.3.0): description documents default vs `--fast` modes; Step 0.2 strips `--fast` token; principles moved to references.
- **[tdk-constitution]** Spec-template reference wrapping/reformatting (9-section list reflow).
- **[tdk-utils]** Skill descriptions updated to reflect tdk-specify-fast removal:
  - `tdk-load-project-context` — `tdk-specify-fast` → `tdk-specify (supports --fast mode)`
  - `tdk-validate-task-id` — same
  - `tdk-skill-guide` — dropped `/tdk-specify-fast` listing
- **[Guides]** `command-reference.md`, `evolution-comparison.md`, `scenarios/02-quick-specification.md` — replaced `specify-fast` references with `specify --fast`.
- **[Setup]** `speckit-setup-guide.md` minor cleanup.

### Removed
- **[tdk-specify-fast]** Skill removed (was in `tdk-core`); functionality merged into `tdk-specify` via `--fast` flag.
- **[Scripts]** `.specify/scripts/ts/src/commands/feature/create-new-feature.ts` — unused, removed.

## [1.53.0] - 2026-05-24

### Added
- **[Plugins]** `tdk-scaffold` plugin (v0.1.0) — initial release
  - Architecture-aware skill/agent recommendations from `.specify/.specify.json` + project docs
  - Three-format manifests: .claude-plugin / .codex-plugin / .cursor-plugin
- **[Skills]** `tdk-recommend-automations` (v0.1.0) under tdk-scaffold
  - Reads `architecture.type` + `docs.path`, maps monolith/modular-monolith → monolith preset, microservices/layered-application → distributed preset
  - Optional community skill discovery via `vercel-labs:find-skills`
  - Emits `.specify/reports/recommendation-<project>.md`
  - `references/architecture-presets.md` defining baseline recommendations per category

### Changed
- **[Manifest]** `.specify/plugins/manifest.json` regenerated to include tdk-scaffold + tdk-recommend-automations entries

## [1.52.0] - 2026-05-24

### Added
- **[Hooks]** `hook-gateway.cjs` — single entry point that checks `.specify.json` → `hooks.disabled[]` before delegating to the actual hook; reads stdin once and forwards it to the delegate so hook authors no longer need disable logic
- **[Tests]** `__tests__/hook-gateway.test.cjs` — covers no-argv pass-through, disabled-list skip, non-array `hooks.disabled` fail-open, missing-hooks-field delegation, and end-to-end delegation to `path-rule-injector`

### Changed
- **[Hooks]** tdk-core hooks routed through gateway
  - `hooks.json` — UserPromptSubmit and PreToolUse commands now invoke `hook-gateway.cjs <hook-name>` instead of calling hook scripts directly
  - `dev-context-injector.cjs` and `path-rule-injector.cjs` — `main()` accepts an optional pre-read `stdinData` parameter; falls back to reading stdin directly when run standalone (avoids double-read when invoked via gateway)
- **[Plugin Libs]** `speckit-config-reader.cjs` — defaults extended with `hooks: { disabled: [] }`; JSDoc added across exported helpers (`findSpecifyConfig`, `loadSpeckitConfig`, `detectActiveWorkspace`, `getWorkspaceRoot`, path getters)

## [1.51.0] - 2026-05-24

### Added
- **[Hooks]** path-rule-injector.cjs — PreToolUse on Read|Edit|Write injects path-matched rules from `.specify/rules/*.md` into tool input
- **[Plugin Libs]** Path-based rule system for tdk-core
  - lib/rule-loader.cjs — parses frontmatter (paths, description, inject), caches by mtime, applies soft limits (20 rules, 2KB body)
  - lib/rule-matcher.cjs — minimatch-backed glob matching with negation support
  - lib/vendored/minimatch.cjs and lib/vendored/yaml.cjs — vendored runtime deps (no npm install)
- **[Examples]** Sample rules under `.specify/examples/rules/`
  - always-apply-project-guidelines.md (paths: `**`, once-per-session dedup)
  - api-reference-guide.md (`inject: reference` mode)
  - typescript-conventions.md (glob + negation example)
- **[Tests]** Coverage for rule-loader, rule-matcher, and path-rule-injector integration

### Changed
- **[Configurations]** `.specify.json` schema gains optional `rules.path` (default `.specify/rules`); `speckit-config-reader.cjs` defaults extended accordingly
- **[Plugin Libs]** `speckit-config-reader.cjs` renames `getRulesPath` → `getSubWorkspaceRulesPath` (disambiguates from new workspace-rules path); `context-builder.cjs` call site updated
- **[Hooks]** `tdk-core` hooks.json — adds PreToolUse matcher for Read|Edit|Write wiring path-rule-injector; description updated; version 3.1.0

## [1.50.0] - 2026-05-24

### Removed
- **[Skills]** Legacy task-based workflow skills (replaced by `plan.md ## Phases` SoT)
  - tdk-implement-task (was 2.1.0)
  - tdk-tasks (was 1.11.1)
- **[Templates]** Legacy task-flow artifacts
  - task-design-template.md.tpl
  - task-requirement-template.md.tpl
  - tasks-template.md.tpl

### Changed
- **[Skills]** tdk-core skills drop legacy task references and bump to 3.0.0
  - tdk-constitution: drop reference to removed tasks-template.md.tpl
  - tdk-implement-from-plan: remove legacy tasks.md advisory check (plan.md ## Phases is sole SoT)
  - tdk-specify: drop /tdk-tasks from next-step guidance
  - tdk-specify-fast: drop /tdk-tasks from next-step guidance
  - tdk-ut-backfill-auto: drop /tdk-implement-task caller references in description and routing
- **[Skills]** tdk-utils planning/context skills drop legacy task references
  - planning (→ 1.10.2): remove /tdk-tasks and tasks.md from plan directory structure and SoT notes
  - planning output-standards: remove tasks.md from artifacts list and next-step guidance
  - tdk-load-project-context (→ 1.10.2): drop tdk-implement and tdk-tasks from caller list
  - tdk-validate-task-id (→ 1.10.2): drop tdk-implement and tdk-tasks from caller list
- **[Templates]** `plan-template.md.tpl`: drop deprecated tasks.md entry from plan directory structure
- **[Guides]** Documentation aligned to plan.md ## Phases workflow (legacy path removed)
  - command-reference.md: drop legacy cheat-sheet rows, deprecated implementation section, command count 15→13
  - document-flow.md: remove legacy mermaid edges and legacy path subgraph
  - evolution-comparison.md: command count 38→36, drop legacy upgrade rows, remove backward-compat note
  - scenarios/01-full-feature-development.md: drop legacy task-breakdown section
  - scenarios/11-resume-existing-feature.md: remove legacy resume path and associated tips
- **[General]** `manifest.json`: drop tdk-implement-task and tdk-tasks entries from tdk-core
- **[General]** tdk-utils: scaffold initial `.cursor-plugin/plugin.json` mirror

## [1.49.0] - 2026-05-23

### Added
- **[Scripts]** `read-component-version.ts` — read component versions from source-of-truth definition files (SKILL.md `metadata.version`, agent `version`, hooks.json `version`) instead of derived manifest.
- **[Scripts]** Test fixture `read-component-version.test.ts` covering skills/agents/commands/hooks version extraction including null-fallback edge cases.
- **[Skills]** tdk-core eval fixtures for multi-subworkspace scenarios
  - tdk-specify-fast: `evals/evals.json` + `evals/fixtures/multi-sw/.specify.json`
  - tdk-specify: `evals/fixtures/multi-sw/.specify.json`

### Changed
- **[Templates]** `spec-template.md.tpl` migrated to **9-section v2 format**: Problem Statement, Scope Boundary, Impact Surface, Evaluated Approaches, User Requirements & Testing (with `[sw/module]` tags), Functional Requirements, Success Criteria, Risks & Mitigations, Unresolved Questions.
- **[Skills]** tdk-core skills aligned to spec format v2
  - tdk-specify (→ 2.1.0): produce 9-section spec with Impact Surface detection
  - tdk-specify-fast (→ 2.1.0): fast variant using direct YAGNI/KISS (no embedded brainstorm)
  - tdk-analyze (→ 2.1.0): new Passes H (Scope Boundary) + I (Impact Surface Coverage), legacy-format detection
  - tdk-clarify (→ 2.1.0): new taxonomy categories (Problem Clarity, Scope Boundary, Impact Surface, Risks)
  - tdk-checklist (→ 2.1.0): success-criteria & risks coverage, `[sw/module]` tag checks
  - tdk-constitution, tdk-implement-task, tdk-plan, tdk-ut-backfill-plan: format-alignment touch-ups
- **[Scripts]** changelog/manifest pipeline upgraded for multi-format manifest enforcement
  - `check-plugin-versions.ts` verifies every existing manifest format (`.claude-plugin/`, `.codex-plugin/`, `.cursor-plugin/`) against `manifest.json`; failure hints suggest `plugin-bump --target=plugins/<plugin>` resync
  - `manifest/compute.ts` reads component versions from source-of-truth files via `read-component-version.ts` (precedence: definition file → existing manifest entry → `--seed` → default `0.1.0`)
  - `fs-helpers.ts` adds `MANIFEST_FORMATS` registry and `resolveAllPluginJson()` for multi-format discovery
  - Test fixture builder supports optional `codexPluginJsonVersion` / `cursorPluginJsonVersion`; `verify.test.ts` adds S3b/S3c/S3d cases for per-format stale detection
- **[Claude Skills]** `tdk-bump` (→ 1.3.0): delegates per-plugin cascade to `plugin-bump`, new Step 11 (delegation) + Step 12 (workspace finalization) + Step 14 (verify.ts gate). DoD requires `verify.ts` exit 0.

## [1.48.0] - 2026-05-22

### Added
- **[Guides]** `migration-ut-rule-to-skill.md` — migration guide from `ut-rule.md` cascade to consumer-owned UT skill in `.claude/skills/`

### Changed
- **[tdk-core]** Migrate UT workflow from workspace `ut-rule.md` cascade to consumer `.claude/skills/` UT skill resolution (tdk-core plugin bumped to v2.0.0)
  - tdk-ut-backfill-auto: replace check/create-rules orchestration with UT skill resolution from `.claude/skills/`
  - tdk-ut-backfill-plan: drop rule cascade merge; read UT conventions from consumer skill
  - tdk-ut-backfill-impl: drop rule cascade merge and check-rules gate; read UT conventions from consumer skill
  - tdk-plan: UT phase detection now checks for consumer UT skill instead of `ut-rule.md`
  - tdk-config-diff / tdk-config-index / tdk-config-sync: update example paths and drop `ut-rule.md` from auto-generated system documents list
- **[Scripts]** CLI surface aligned to new UT skill flow
  - `ut/backfill/auto.ts`, `plan.ts`, `impl.ts`: drop rule-cascade dependencies and `utRulesFiles[]` payload
  - `cli-error-handler.ts`, `utils/config.ts`, `utils/index.ts`, `ut/index.ts`: remove rules-related branches
  - `tests/cli/ut-scripts.test.ts`: update fixtures and assertions to reflect new payload shape
- **[Templates]** `ut-plan-template.md.tpl`, `ut-phase-template.md.tpl`, `plan-skill-routing-template.tpl`: rewrite references from `ut-rule.md` to consumer UT skill
- **[Guides]** Refresh UT-related scenarios and references (4 unit-testing scenarios, multi-sub-workspace monorepo, constitution setup, command-reference, document-flow, evolution-comparison, tdk-ut-backfill-skills-usage)

### Removed
- **[tdk-core]** Two skills retired — UT conventions are now consumer-owned
  - tdk-ut-backfill-check-rules: validate `ut-rule.md` existence (no longer needed)
  - tdk-ut-backfill-create-rules: scaffold workspace `ut-rule.md` (replaced by consumer-defined skill)
- **[Scripts]** Rule-cascade infrastructure
  - `ut/check-rules.ts`, `ut/create-rules.ts`: CLI commands matching deleted skills
  - `utils/rules.ts`: cascade-merge utility for `ut-rule.md` files
  - `tests/utils/rules.test.ts`, `tests/utils/rules-cascade-snapshot.test.ts`, `tests/smoke/cli-cascade-smoke.test.ts`, `tests/fixtures/rules-cascade/*`
- **[Templates]** `ut-rule-template.md.tpl` — workspace UT-rule template
- **[Guides]** `rule-cascade-merge-contract.md`, `ut-rule-canonical-headings.md`, `ut-rule-merge-self-check.md` — cascade contract docs

## [1.47.0] - 2026-05-21

### Changed
- **[Templates]** Rename all template files from `.md` to `.md.tpl` (29 files) to distinguish source-of-truth templates from generated/rendered Markdown
  - root: spec, plan, tasks, agent-file, checklist, data-model, state-transitions, page-design, requirement-change, task-design, task-requirement, ut-rule
  - docs/: source-code-structure, technical-context
  - memory/: business-rules, data-model, flow, screen-flow, screen, services
  - output/: api-design, ba-requirement, batch-design, test-design, ui-design
  - test/api-test/: api-test-plan, api-testcases
  - ut/: ut-phase, ut-plan
- **[tdk-core]** Update skill template references to .md.tpl (1.11.0 → 1.11.1)
  - tdk-checklist, tdk-constitution, tdk-specify, tdk-specify-fast, tdk-tasks, tdk-ut-backfill-plan
- **[tdk-memory]** Update skill template references to .md.tpl (0.3.0 → 0.3.1)
  - tdk-memory-init, tdk-memory-update
- **[tdk-test-api]** Update skill template references to .md.tpl (1.1.0 → 1.1.1)
  - tdk-test-api-plan, tdk-test-api-generate-testcase
- **[Scripts]** Update template lookup paths to .md.tpl extension
  - create-new-feature, setup-plan, testcase-env, ut/create-rules (also loads env via loadFeatureEnv for specsRoot resolution)
- **[Guides]** Update document-flow.md Mermaid diagrams to reflect renamed templates
- **[tdk-distribute]** Update file-tree example to show spec-template.md.tpl

### Added
- **[tdk-memory]** Add CHANGELOG.md for plugin

## [1.46.0] - 2026-05-21

### Added
- **[tdk-plan]** Skill-routing capability
  - `references/skill-routing.md` defines per-project skill assignments per sub-workspace/domain
  - Step 0.1b loads `SKILL_ROUTING` from `{docs.path}/custom-workflow/plan-skill-routing.md` (opt-in via AskUserQuestion, never auto-creates routing file)
  - Inline `## Delegate Skills` injection during design phase — sub-workspace + domain matching with global fallback, idempotent replace, pre-injection re-read to defeat context drift, EC-11 advisory for unrouted sub-workspaces
- **[Templates]** `plan-skill-routing-template.tpl` — starter template users copy to `{docs.path}/custom-workflow/plan-skill-routing.md`

### Changed
- **[tdk-plan]** Red-team and validate workflows load `SKILL_ROUTING` inline so reviewers/validators can assess skill-assignment quality per phase
- **[tdk-plan]** `modes.md` adds Step 0.1b row; `plan-organization.md` documents `## Delegate Skills` section between Key Insights and Requirements in phase template
- **[tdk-constitution]** Fix typo in shared brainstorm reference path (`-brainstorm.md` → `brainstorm.md`)

## [1.45.0] - 2026-05-19

### Added
- **[Scripts]** New CLI utilities for phase status management
  - `parse-phases-table.ts` — CLI wrapper to parse `## Phases` table from plan.md; supports `--json` flag; exits 1 on parse errors
  - `phase-frontmatter.ts` — Module for surgically updating `status:` in phase file YAML frontmatter without YAML round-trip (preserves comments and key order)
  - `update-phase-frontmatter-status.ts` — CLI for `phase-frontmatter` module with status validation
  - `update-phase-status.ts` — CLI to update phase row status in plan.md table; rejects legacy status vocabulary before writing
  - Test fixtures and tests for all new utilities (`phase-frontmatter.test.ts`, `parse-phases-table-cli.test.ts`, `update-phase-status-cli.test.ts`, `sync-phase-status.integration.test.ts`)

### Changed
- **[Scripts]** `phases-table-parser.ts` — Added `cancelled` to `PhaseStatus` type; exported `VALID_STATUSES`; added legacy alias map (`pending`→`todo`, `in-progress`→`in_progress`, `completed`→`done`) for backward compat with pre-schema_version-3 plans; updated tests
- **[tdk-core]** Four skills refactored from TypeScript direct imports to CLI wrappers
  - `tdk-analyze` (1.1.1→1.10.2): uses `parse-phases-table.ts` CLI instead of `parsePhasesTable()` import
  - `tdk-implement-from-plan` (0.2.3→1.10.2): uses `update-phase-frontmatter-status.ts` + `update-phase-status.ts` CLIs at every status transition; phase file frontmatter MUST be updated before plan.md table
  - `tdk-ut-backfill-auto` (1.2.1→1.10.2): uses `parse-phases-table.ts` CLI instead of TypeScript import
  - `tdk-plan` (1.10.1→1.10.2): `output-standards.md` updates status vocab (`todo/in_progress/done/skipped/blocked/cancelled`) and bumps `schema_version` to 3; `plan-organization.md` documents CLI-based status update tools and deprecates header-block frontmatter

## [1.44.1] - 2026-05-18

### Changed
- **[Scripts]** Setup command improvements
  - Use `Bun.argv` instead of `process.argv` for native Bun argument parsing
  - Skip claude availability check when `--skipPlugins` is set
  - Add error handling for `main()` with stderr output and `process.exit(1)` on failure
  - Plugin registration failures now return `fail` status instead of silently passing
  - Updated test to assert `fail` status and exit code in error message
- **[General]** setup.sh: Windows users get manual install instructions for jq/yq; prioritize `--frozen-lockfile` over `--no-save` for bun install

## [1.44.0] - 2026-05-18

### Added
- **[Scripts]** TypeScript setup command suite replacing bash-based setup orchestration
  - `setup.ts` — entry point: detects OS/arch, resolves project root, orchestrates all setup steps
  - `setup-cli.ts` — step orchestrator with `parseSetupArgs` / `runSetupSteps` functions
  - `types.ts` — shared `StepResult`, `SetupOptions`, `SetupContext`, `CommandRunner` interfaces
  - `steps/python-venv.ts`, `steps/ts-deps.ts`, `steps/config-detect.ts`, `steps/config-migrate.ts`, `steps/python-imports.ts`, `steps/plugin-register.ts` — modular step implementations
  - `utils/default-command-runner.ts`, `utils/output-helpers.ts` — CLI output and command execution utilities
  - Tests: `common-env-parity.test.ts` + 8 setup step/integration tests

### Changed
- **[Setup]** `speckit-setup-guide.md`: updated description to reflect new bash→TS delegation architecture
- **[General]** `setup.sh` refactored from 482-line monolith to 71-line thin bootstrap that installs prerequisites (git, jq, yq, bun) then delegates all setup logic to `setup.ts`

### Removed
- **[Scripts]** `common-env.sh` — 346-line bash environment loader (`load_feature_env`, `validate_prefix`, `parse_ticket_id`) replaced by TypeScript setup command

## [1.43.3] - 2026-05-17

### Changed
- **[Scripts]** `run-migration-tests.sh`: removed `.specify/scripts/python/` exclusion from T15 commercehub reference check

### Removed
- **[Scripts]** Deleted Python utility scripts
  - `generate_data_model.py`: generated data-model.md and ER diagrams from spec.md entities
  - `sync_requirements.py`: synced REQ-0xx/REQ-1xx blocks from requirements files into spec.md
  - `tasks_to_issues.py`: created GitHub Issues from tasks.md TODO items

## [1.43.2] - 2026-05-17

### Removed
- **[Scripts]** Delete `common.sh` — fully migrated to TypeScript `common.ts`; no bash callers remain

### Changed
- **[Setup]** Update `speckit-setup-guide.md` references from bash scripts to TypeScript equivalents
  - `detect-config.sh` → `detect-config.ts`, `common.sh` references removed
  - Troubleshooting section updated for Bun-based workflow
- **[Claude Skills]** Update `tdk-distribute/SKILL.md` — remove `common.sh` from distribution file list
- **[Scripts]** Clean up `common.ts` comments — remove stale `common.sh` migration references

## [1.43.1] - 2026-05-17

### Changed
- **[Scripts]** `common-env.sh`: Migrated config detection from bash `detect-config.sh` to TypeScript `detect-config.ts`; added `bun` availability guard; updated JSON field references from SCREAMING_SNAKE_CASE to camelCase (`configFound`, `workspaceRoot`, `workspaceName`, `targetSubWorkspace`, etc.)
- **[Setup]** `setup.sh`: Switched config detection from bash+Python to bun+jq; added `bun` availability check before running detection; updated JSON field references to camelCase

### Removed
- **[Scripts]** `detect-config.sh` deleted — config detection logic migrated to TypeScript (`detect-config.ts`)

## [1.43.0] - 2026-05-17

### Added
- **[Scripts]** New TypeScript environment scripts for test-api skills, replacing Bash run.sh
  - `codegen-env.ts` — env validation for tdk-test-api-gen-code-playwright-ts
  - `plan-env.ts` — env validation for tdk-test-api-plan
  - `testcase-env.ts` — env validation for tdk-test-api-generate-testcase
  - `test-api-shared-setup.ts` — shared utilities for all 3 scripts
- **[tdk-test-api]** `CHANGELOG.md`

### Changed
- **[Skills]** tdk-test-api skills migrated from bash run.sh to bun TypeScript env scripts
  - `tdk-test-api-gen-code-playwright-ts`: Step 0 now calls `codegen-env.ts`; bumped to 1.1.0
  - `tdk-test-api-generate-testcase`: Step 0 now calls `testcase-env.ts`; bumped to 1.1.0
  - `tdk-test-api-plan`: Step 0 now calls `plan-env.ts`; bumped to 1.1.0
- **[tdk-utils]** Plugin version bumped to 1.10.1

### Removed
- **[Skills]** Bash `run.sh` scripts removed from all 3 tdk-test-api skills (replaced by TypeScript equivalents)

## [1.42.4] - 2026-05-17

### Added
- **[Agents]** `tdk-utils/CHANGELOG.md` — plugin-level changelog file

### Changed
- **[Agents]** `researcher` (tdk-utils) — replaced generic "document-skills" reference with specific office document skills: xlsx, docx, pptx, pdf

## [1.42.3] - 2026-05-17

### Changed
- **[Scripts]** Simplified migration test runner and updated compatibility references
  - Slimmed `run-migration-tests.sh` from 7 tests (T01/T04/T05/T10/T11/T14/T15) to 2 (T14/T15), removing setup code that depended on the deleted compat shim
  - Updated `common.ts` comment to remove stale reference to `common-compat.sh`

### Removed
- **[Scripts]** Removed `common-compat.sh` — bash compat shim bridging legacy calling conventions to `common.sh`; functionality now handled directly via `common.sh` or TypeScript equivalents in `common.ts`

## [1.42.2] - 2026-05-13

### Added
- **[Scripts]** `plan-prose-validator.ts` — validates guarded sections (`## Phases`, `## Decisions Made`, `## Success Metrics`) in `plan.md` for prose injection
  - `plan-prose-validator.test.ts` — 12 test cases: happy paths, prose detection, edge cases
- **[Skills]** `tdk-core/CHANGELOG.md` — per-plugin changelog file

### Changed
- **[Skills]** `tdk-plan` — integrated prose validation in Append Phase flow
  - `handle-existing-plan.md`: added Step 8 validator (snapshot + rollback on violation); renumbered old Step 8→9; prohibited prose injection in `plan.md`

## [1.42.1] - 2026-05-11

### Fixed
- **[Scripts]** Fix `resolveTargets` in sub-workspace `docs` command to use sub-workspace `name` (not `path`) for output directory

## [1.42.0] - 2026-05-10

### Added
- **[tdk-core]** New sub-workspace docs generator (replaces `/ck:docs init` for sub-workspaces)
  - skill: `tdk-sub-workspace-docs` (v1.0.0) — smart init/update/force flow per sub-workspace; pipes repomix pack + tdk-scout report into per-target subagent; writes 4 files under `<docsPath>/sub-workspaces/<wsPath>/` (codebase-summary, code-standards, system-architecture, README)
  - agent: `tdk-docs-writer` (v1.0.0) — haiku-model per-target writer; consumes repomix pack + scout report, renders templates or splices AUTO-GEN marker bodies, enforces code-first / no-stale-TODO / honest-fallback rules
- **[Scripts]** New `tdk sub-workspace docs` subcommand + supporting library
  - command module: `commands/sub-workspace/{docs,repomix-pack,types}.ts`
  - AUTO-GEN marker engine: `lib/auto-gen-markers.ts` (pure parse/splice, EOL-preserving) + `lib/auto-gen-markers-cli.ts` (CLI wrapper for agent invocation)
  - tests: `tests/lib/{auto-gen-markers,auto-gen-markers-cli,templates-roundtrip}.test.ts`, `tests/sub-workspace/docs.test.ts`
- **[Templates]** New `sub-workspace-docs/` template set with AUTO-GEN markers
  - `README.md.tpl`, `code-standards.md.tpl`, `codebase-summary.md.tpl`, `system-architecture.md.tpl`

### Changed
- **[Scripts]** Register `sub-workspace docs` subcommand in TS CLI entrypoint (`src/index.ts`)
- **[tdk-core]** Plugin bumped `1.9.0 → 1.10.0` to register sub-workspace docs skill + agent

## [1.41.0] - 2026-05-10

### Added
- **[tdk-utils]** New codebase navigation components (S4 hierarchical 2-tier)
  - skill: `tdk-scout` — orchestrates Tier 1 deterministic TS resolver + dispatches Tier 2 agent; emits markdown navigation report (relevant files + descriptions + unresolved questions)
  - agent: `tdk-scout-runner` — haiku-model Tier 2 specialist; scores files via in-degree + path heuristics + task-hint, samples within budget, writes report
- **[Scripts]** New `tdk scout` subcommand + module under `commands/scout/`
  - core: `index.ts`, `extract.ts`, `args-validator.ts`, `cache-resolver.ts`, `pack-splitter.ts`, `repomix-runner.ts`, `tokens.ts`, `tree-builder.ts`, `types.ts`
  - language parsers: `language-parsers/{index,go,python,ts-js}.ts` (regex-based symbol/import extraction)
  - tests: full suite under `tests/scout/` (unit per parser + module, integration for `extract` and `run-scout`, fixtures `sample-pack-{ts,mixed}.md`)

### Changed
- **[Scripts]** Register `scout` subcommand in TS CLI entrypoint (`src/index.ts`)
- **[tdk-utils]** Plugin bumped `1.9.0 → 1.10.0` to register scout skill + agent

## [1.40.1] - 2026-05-10

### Added
- **[code-review]** Report-driven review workflow with new reference docs
  - `references/output-path-resolution.md`: deterministic rules for `{base_path}/reviews/{YYYYMMDD-HHmm}-{slug}.md` (user path > auto-detected `.specify/specs/{task-id}/` from branch > cwd) with slug derivation + collision handling
  - `references/review-report-template.md`: canonical report structure with P0/P1/P2 buckets, Simplification Opportunities, Plan Additions paste-ready block, Verification Performed, Open Questions

### Changed
- **[code-review]** SKILL.md: repositioned as report-writing audit complementary to `/simplify` (read-only, persists findings); added Relationship to /simplify table, Review Output Protocol section, updated decision tree and Integration with Workflows; version 1.0.0 → 1.1.0
- **[code-review]** `references/requesting-code-review.md`: subagent contract now requires `REPORT_PATH` + `TEMPLATE_PATH`; deliverable is the populated report file; example updated with realistic branch/SHA flow

## [1.40.0] - 2026-05-09

### Added
- **[Scripts]** TypeScript implementation of doc sync (`util/sync-docs.ts`)
  - `sync-docs-helpers/sync-modes.ts`: `--all`, `--from-sub-workspace`, `--to-sub-workspace` mode handlers
  - `sync-docs-helpers/sync-file.ts`: per-file sync with dry-run + force flags
  - `sync-docs-helpers/walk-files.ts`: recursive markdown discovery
- **[Scripts]** Snapshot test suite for sync-docs (`tests/sync-docs/`)
  - `snapshot.test.ts`, `capture-snapshots.ts`, `fixture-setup.ts`, `normalize-paths.ts`
  - Six baseline snapshots covering dry-run + real runs across all three modes
  - `README.md` documenting fixture layout and snapshot regeneration

### Changed
- **[tdk-core]** `tdk-config-sync` skill now invokes `bun .../sync-docs.ts` instead of `bash .../sync-docs.sh`
- **[Guides]** `command-reference.md`: dropped "Bash Fallback Commands" section (no remaining bash fallbacks)

### Removed
- **[Scripts]** `bash/sync-docs.sh` (superseded by TypeScript implementation)

## [1.39.1] - 2026-05-08

### Added
- **[General]** Session tracking support for `tdk-core`
  - `lib/session-tracker.cjs`: records session IDs to `sessions.txt` per task folder with file-lock concurrency control
  - `__tests__/session-tracker.test.cjs`: unit tests covering skip conditions, idempotency, lock cleanup, and lock-contention

### Changed
- **[Hooks]** `dev-context-injector`: integrated session tracking — extracts ticket-id from branch and records current session ID on each prompt submit

## [1.39.0] - 2026-05-08

### Removed
- **[tdk-core]** Page-design pipeline retired — consolidated into `/tdk-ui-design` + `/tdk-specify`/`/tdk-plan`
  - `tdk-specify-pages` skill (was 1.0.9)
  - `specify-pages.sh` bash script
  - `clone-template.sh` bash script (generic template cloner, no longer used)
  - Migration test cases T02/T03 (specify-pages list/create) from `run-migration-tests.sh`

### Changed
- **[tdk-memory]** `tdk-memory-preload`: removed `/tdk-specify-pages` from auto-invocation list in description
- **[tdk-utils]** Dropped `tdk-specify-pages` from "Called by" lists in skill descriptions
  - `tdk-load-project-context`
  - `tdk-validate-task-id`
- **[Guides]** Removed `/tdk-specify-pages` references across documentation
  - `command-reference.md`: page-design section, troubleshooting entry, command-order quick reference
  - `document-flow.md`: arrows in Mermaid flow diagrams and document-flow tables
  - `evolution-comparison.md`: row in upgraded-commands table

## [1.38.2] - 2026-05-06

### Changed
- **[tdk-plan]** MCP availability handling in Phase 0.guardian and --fast mode
  - gates.md: added --no-mcp flag, STATUS: MCP_UNAVAILABLE handling, auto-respawn in --fast
  - modes.md: corrected Phase 0.guardian to run in --fast mode; clarified MCP_UNAVAILABLE auto-handling
  - red-team-workflow.md: replaced Vietnamese example reply with English
- **[memory-guardian]** Added Tool Priority section, Phase 0 MCP Availability Check, and claim-type tool-selection table
- **[brainstorming]** Translated scripts/README.md from Vietnamese to English
- **[planning]** Translated project-knowledge.md intro from Vietnamese to English

## [1.38.1] - 2026-05-06

### Changed
- **[Scripts]** Removed `bin.tdk` entry (pointing to `./bin/tdk.sh`) from `package.json`
- **[Setup]** Updated `speckit-setup-guide.md` references from bash scripts to TypeScript equivalents

### Removed
- **[Scripts]** Deleted 7 bash scripts migrated to TypeScript
  - `check-prerequisites.sh`
  - `config/diff.sh`, `config/index.sh`
  - `create-new-feature.sh`, `feature/status.sh`
  - `setup-plan.sh`, `sync-commands.sh`

## [1.38.0] - 2026-05-03

### Changed
- **[Scripts]** Reorganized UT TypeScript commands into `ut/backfill/` subfolder; added `ut/index.ts` and `ut/backfill/index.ts` as CLI entry points; updated `cli-error-handler.ts`, `check-rules.ts`, `create-rules.ts`, `feature/status.ts`, `config.ts`, `types.ts`, and root `src/index.ts`
- **[Skills/tdk-ut-backfill-auto]** Renamed from `tdk-ut-auto`; updated workflow overview and CLI usage for backfill command group
- **[Skills/tdk-ut-backfill-plan]** Renamed from `tdk-ut-plan`
- **[Skills/tdk-ut-backfill-impl]** Renamed from `tdk-ut-generate`
- **[Skills/tdk-ut-backfill-check-rules]** Renamed from `tdk-ut-check-rules`
- **[Skills/tdk-ut-backfill-create-rules]** Renamed from `tdk-ut-create-rules`
- **[Skills/tdk-config-index]** Updated system doc reference from `/tdk-ut-create-rules` → `/tdk-ut-backfill-create-rules`
- **[Skills/tdk-implement-from-plan]** Updated all UT delegation options to backfill variants
- **[Skills/tdk-implement-task]** Updated UT phase detection and delegation targets to backfill variants
- **[Skills/tdk-plan]** Updated UT planning delegation ref to `/tdk-ut-backfill-plan`
- **[Guides]** Renamed `tdk-ut-skills-usage.md` → `tdk-ut-backfill-skills-usage.md`; updated `command-reference.md`, `ut-rule-merge-self-check.md`, scenario guides (01, 04, 05, 06, 07, 13), `document-flow.md`, `evolution-comparison.md` with backfill skill names
- **[Templates]** Restructured `ut-phase-template.md` to module-based format; updated `ut-plan-template.md`

### Removed
- **[Scripts]** Deleted legacy bash UT scripts: `ut/auto.sh`, `ut/check-rules.sh`, `ut/create-rules.sh`, `ut/generate.sh`, `ut/plan.sh`

## [1.37.0] - 2026-05-02

### Changed
- **[Skills / tdk-core]** Removed references to deleted skills
  - `tdk-implement-from-plan`: removed `/tdk-review-code` from post-implementation next steps
  - `tdk-specify-pages`: removed `/tdk-update-page-design` from Related section
- **[Skills / tdk-utils]** Updated callers list to remove deleted skills
  - `tdk-load-project-context`: removed `tdk-change-requirement`, `tdk-review-code`, `tdk-show-progress` from callers list
  - `tdk-validate-task-id`: removed same three skills from callers list
- **[Guides]** Updated docs to reflect reduced command set (19→15 commands)
  - `command-reference.md`: reduced command count, removed entries and diagrams for deleted skills, simplified Page Design section
  - `document-flow.md`: removed Phase 3 code-review/design-update diagram and change-management flowchart nodes
  - `evolution-comparison.md`: removed comparison rows for the four deleted skills
- **[Setup]** `speckit-setup-guide.md`: removed `/tdk-review-code` and `/tdk-show-progress` from key commands list

### Removed
- **[Skills / tdk-core]** Deleted four skills
  - `tdk-change-requirement` (was v1.0.6)
  - `tdk-review-code` (was v1.0.5)
  - `tdk-show-progress` (was v1.0.5)
  - `tdk-update-page-design` (was v1.0.3)
- **[Scripts]** Deleted bash scripts: `change-requirement.sh`, `review-code.sh`, `show-progress.sh`, `update-page-design.sh`
- **[Guides]** Removed scenario docs: `12-page-design-full-pipeline.md`, `14-requirement-change-workflow.md`

## [1.36.0] - 2026-05-02

### Changed
- **[tdk-core]** Removed references to deleted skills from commands
  - `tdk-change-requirement`: simplified apply workflow from 5 phases to 3 (spec → page designs → implementation; removed test-spec + E2E phases)
  - `tdk-review-code`: removed `tdk-fix-review-feedback` next-step guidance
  - `tdk-show-progress`: removed related links to `tdk-fix-review-feedback`, `tdk-run-e2e-test`, `tdk-fix-bug`
  - `tdk-specify-pages`: removed related link to `tdk-generate-test-spec`
  - `tdk-update-page-design`: removed related link to `tdk-generate-test-spec`
- **[tdk-utils]** Removed deleted-skill references from shared utilities
  - `tdk-load-project-context`: removed `tdk-fix-bug`, `tdk-fix-review-feedback`, `tdk-generate-aws-architecture`, `tdk-generate-test-spec` from caller list
  - `tdk-validate-task-id`: same caller list cleanup
- **[Scripts]** Updated bash scripts to reflect simplified workflows
  - `change-requirement.sh`: simplified analyze/apply output from 5-step to 3-step guidance
  - `run-migration-tests.sh`: reduced from 15 tests to 9 (T01-T05, T10, T11, T14, T15); removed tests for deleted commands
- **[Templates]** `requirement-change-template.md`: removed test-specifications checklist item and test-related action items
- **[Guides]** Documentation updated to reflect command set reduction
  - `command-reference.md`: reduced command count 25→19; removed Testing & Bugs, fix-review-feedback, and Infrastructure sections; updated diagrams and troubleshooting table
  - `document-flow.md`: removed phases 4-5 from flowchart (test spec generation, E2E test, bug management)
  - `README.md`: renumbered scenarios 13-15 to 12-14; removed AWS infrastructure scenario entry
  - `evolution-comparison.md`: updated upgraded command count 19→13; removed deleted commands from upgrade table
- **[Claude Skills]** `tdk-skill-docs-sync/docs-structure-map.md`: removed Testing & Bugs and Infrastructure skill categories

### Removed
- **[tdk-core]** Deleted 6 deprecated skills
  - `tdk-fix-bug` (was 1.0.4) — bug fix after E2E test failures
  - `tdk-fix-review-feedback` (was 1.0.4) — auto-fix from code review reports
  - `tdk-generate-aws-architecture` (was 1.0.4) — AWS architecture doc generation
  - `tdk-generate-aws-cfn` (was 1.0.2) — CloudFormation nested stack generation
  - `tdk-generate-test-spec` (was 1.0.4) — E2E test specification generation
  - `tdk-run-e2e-test` (was 1.0.2) — Playwright E2E test execution
- **[Scripts]** Deleted 6 bash scripts: `fix-bug.sh`, `fix-review-feedback.sh`, `generate-aws-architecture.sh`, `generate-aws-cfn.sh`, `generate-test-spec.sh`, `run-e2e-test.sh`
- **[Templates]** `test-spec-template.md` removed
- **[Guides]** Scenario `12-aws-infrastructure-end-to-end.md` removed

## [1.35.0] - 2026-05-02

### Changed
- **[General]** Removed `document-skills@tdk-plugin-marketplace` from enabled plugins in `.claude/settings.json`
- **[Setup]** Removed `document-skills` from plugin registry documentation and setup instructions

### Removed
- **[Skills]** `document-skills` plugin (v1.0.4) removed
  - `docx` (was 1.0.2) — Word document processing with OOXML schemas and Python scripting utilities
  - `pdf` (was 1.0.2) — PDF form field extraction, filling, and bounding box validation scripts
  - `pptx` (was 1.0.2) — PowerPoint processing with HTML-to-PPTX converter and OOXML schema support
  - `xlsx` (was 1.0.2) — Excel file recalculation utility

## [1.34.0] - 2026-05-01

### Added
- **[Scripts]** New `json-field.ts` CLI utility for reading and writing JSON fields using dot-notation paths

### Changed
- **[General]** Added `effortLevel: "high"` to Claude Code settings; removed `specify-devtools` from enabled plugins
- **[Setup]** Removed `specify-devtools` references from plugin marketplace setup documentation
- **[Scripts]** Updated changelog verify test fixtures from decommissioned `specify-devtools` to `tdk-utils`/`brainstorming`; cleaned up legacy comment in `seed-versions.ts`

### Removed
- **[specify-devtools]** Decommissioned plugin — removed from marketplace manifest, settings, and setup docs; skills migrated to root-level `.claude/skills/` (tdk-skill-docs-sync, tdk-bump, tdk-distribute)

## [1.33.2] - 2026-04-29

### Added
- **[Scripts]** New test (`handle-existing-plan-paths.test.ts`) asserting `handle-existing-plan.md` enforces `phases/` path conventions

### Changed
- **[Skills]** `tdk-plan` reference docs updated to `phases/` subdirectory convention
  - `handle-existing-plan.md`: Updated path prompts, dirty-guard regex, collision check, and Phases table links to `phases/phase-NN-*.md`
  - `plan-organization.md`: Updated directory tree, Phases section description, table examples, and file-naming rule
- **[Scripts]** Parser and tests updated for `phases/` path support
  - `phases-table-parser.ts`: `isValidPath()` now accepts `phases/` prefix; updated error message example to `phases/phase-02-x.md`
  - `phases-table-parser.test.ts`: Updated expected error message to match new example

## [1.33.1] - 2026-04-29

### Removed
- **[General]** `compute-manifest.py` — Python manifest computation script removed; replaced by Bun TypeScript port

### Added
- **[Scripts]** TypeScript port of manifest computation (`bun run manifest`)
  - `compare.ts` — file/component comparison; fixes Python bug where `changed_components` was always `[]`
  - `compute.ts` — CLI entry point
  - `find-project-root.ts` — git + upward `.specify/` root detection
  - `identify-components.ts` — component discovery by directory structure
  - `io.ts` — atomic manifest JSON load/write
  - `scan-files.ts` — recursive file scanner + SHA-256 hasher
  - `seed-versions.ts` — version seeding from `plugin.json` for migration
  - `types.ts` — shared TypeScript type definitions
- **[Scripts]** Unit tests for manifest modules
  - `compare.test.ts` — 10 test cases for `compareComponents`
  - `identify-components.test.ts` — tests for `identifyComponents`

### Changed
- **[Scripts]**
  - `package.json` — added `manifest` npm script
  - `check-cross-consistency.ts` — 3 fix hints updated to `bun run manifest`
- **[Skills]** tdk-bump and tdk-distribute updated to reference `bun run manifest`
  - `tdk-bump/SKILL.md` — Step 6/11 commands updated; `removed_components` added to output schema; DoD #4 refined; Phase 1 migration notice removed
  - `tdk-distribute/SKILL.md` — troubleshooting references updated

## [1.33.0] - 2026-04-27

### Added
- **[Templates]** New documentation templates for project-wide source code layout and technical context
  - `source-code-structure-template.md` — template for `source-code-structure.md` (SOT for plan.md `### Source Code` section)
  - `technical-context-template.md` — template for `technical-context.md` (SOT for plan.md `## Technical Context` section)

### Changed
- **[Skills]** tdk-plan reference files updated with SOT pre-load steps
  - `design-phase.md` — added "Project Source Layout SOT Pre-load": read `source-code-structure.md` before filling `### Source Code`; falls back to boilerplate if missing
  - `research-phase.md` — added "Project Tech Baseline SOT Pre-load": read `technical-context.md` before filling `## Technical Context`; falls back to codebase scan if missing

## [1.32.0] - 2026-04-26

### Added
- **[tdk-core]** Comprehensive documentation for tdk-plan skill
  - Cross-plan dependencies detection guide
  - Design phase workflow documentation
  - Plan organization and structure reference
  - Red team workflow procedures (reliability, security, skeptic)
  - Research phase guidelines
  - Scope challenge resolution framework
  - Validation question framework and workflows
  - Modes and gates reference documentation
  - Output standards and handle-existing-plan guides

- **[tdk-utils]** Three new red-team agents for critical analysis
  - tdk-red-team-reliability: Analyzes implementation reliability and robustness
  - tdk-red-team-security: Evaluates security considerations and threat models
  - tdk-red-team-skeptic: Challenges assumptions and explores alternative approaches

- **[Guides]** New tdk-ut-skills-usage guide documenting unit test skill workflows

- **[Scripts]** New TypeScript utilities for cross-plan operations
  - cross-plan-deps-detectors.ts: Detect dependencies across plan files
  - parse-plan-frontmatter.ts: Parse plan file frontmatter metadata
  - scan-cross-plan-deps.ts: Scan and analyze cross-plan dependencies

### Changed
- **[tdk-core]** Major refactoring of tdk-plan skill documentation
  - Extracted inline documentation into focused reference files
  - Reorganized skill definition for clarity and maintainability
  - Updated tdk-ut-plan skill with enhanced documentation

- **[tdk-utils]** Documentation improvements
  - Enhanced brainstorming skill scripts documentation
  - Updated planning skill references for codebase understanding and project knowledge
  - Improved common environment setup documentation

- **[General]** Configuration and template updates
  - Updated .gitignore for new build artifacts and codebase tools
  - Enhanced plan, task, and test specification templates
  - Aligned documentation standards across guides

### Deprecated
- Plan template references deprecated in favor of phase-based documentation structure

## [1.31.0] - 2026-04-22

### Added
- **[tdk-core]** Mirror test strategy support and validation
  - tdk-ut-auto: Support `testMapping.strategy = 'mirror'` for test directory selection
  - tdk-ut-check-rules: New Step 0.5 for handling config parse errors with migration guidance
  - tdk-ut-check-rules: New Step 2 for mirror structure validation with orphan test detection and handling
  - tdk-ut-create-rules: Mirror strategy documentation
  - tdk-ut-generate: Mirror strategy documentation
  - tdk-ut-plan: Mirror strategy documentation

### Changed
- **[Scripts]** Enhanced CLI error handling and validation utilities
  - Added mirror-validator utility for detecting and validating mirror test structure
  - Updated config parser to emit `mirrorValidation` for mirror strategy workspaces
  - Enhanced error handling in check-rules and cli-error-handler
  - Updated test detection and validation logic

## [1.30.0] - 2026-04-22

### Added
- **[tdk-core]** Test fixture `expected-decisions.md` for tdk-ut-auto skill validation
- **[Scripts]** New utility `phases-table-parser.ts` — TypeScript parser for extracting and validating dependency tables from plan markdown files; includes 14 comprehensive test fixtures covering canonical, edge cases, and invalid scenarios

### Changed
- **[Guides]** Comprehensive documentation updates across 12 guide files — enhanced scenarios (full feature development, quick specification, quality review, unit testing, progress tracking, mid-development changes, existing feature resumption, page design, requirement changes) with improved clarity and workflow examples
- **[tdk-core]** Skills documentation and workflows updated: tdk-analyze, tdk-change-requirement, tdk-checklist, tdk-implement-from-plan, tdk-plan, tdk-status, tdk-tasks, tdk-ut-auto — enhanced with clearer step descriptions, improved branching logic, and comprehensive error handling
- **[tdk-utils]** Skills documentation and workflows: brainstorming (improved research integration), planning (output standards refinement)
- **[Scripts]** feature/status.ts significantly enhanced with improved phase table parsing and status reporting; check-prerequisites.ts and utils/common.ts minor improvements for integration support
- **[Templates]** Incremental refinements to checklist, plan, and tasks templates

### Renamed
- **[tdk-core]** Skill `tdk-implement` → `tdk-implement-task` for clearer intent (task-specific implementation vs. general implementation)

## [1.29.0] - 2026-04-19

### Added
- **[tdk-utils]** New `researcher` agent and `research` skill — comprehensive technical research agent for evaluating technologies, analyzing architectures, gathering requirements; supports multiple research sources (websites, documentation, APIs); integrates with docs-seeker and context7 for knowledge synthesis

### Changed
- **[Plugins]** Simplified `plugin.json` across all 9 plugins — removed redundant `"skills": "./skills/"` and `"hooks": "./hooks/hooks.json"` fields. Claude marketplace auto-discovers these via directory structure.
- **[tdk-utils]** Version bumped `1.4.6 → 1.5.0` for new agent/skill capability
- **[Configuration]** Added `.specify.json.example` config sections for research skill: `skills.research.useGemini` flag and `gemini.model` selection

## [1.28.0] - 2026-04-19

### Changed
- **[Plugins]** Standardize `plugin.json` layout across all 8 plugins — moved to `.claude-plugin/plugin.json` subdir (Claude marketplace convention). Affects `document-converter` (0.0.3 → 0.0.4), `document-skills` (1.0.3 → 1.0.4),  `tdk-core` (1.2.12 → 1.2.13), `tdk-memory` (0.2.3 → 0.2.4), `tdk-test-api` (1.0.2 → 1.0.3), `tdk-utils` (1.4.5 → 1.4.6). `specify-devtools` was already nested — plugin bumped `0.6.0 → 0.6.1` for coupled simplification below.
- **[Scripts]** `verify.ts / fs-helpers.ts:resolvePluginJson()` simplified to single-path (nested only). Removed flat-path fallback dead code. `fixture-builder.ts` drops `nested?: boolean` knob — all fixtures build under `.claude-plugin/`. Breaking change for external projects still on flat layout. Skill `tdk-bump` 1.2.0 → 1.2.1.

### Migration
- Downstream projects consuming this marketplace: no action required — `marketplace.json > plugins[].source` references plugin directories, not `plugin.json` paths; Claude auto-discovers the nested file.
- Downstream projects that custom-read `plugin.json` paths: update to `.claude-plugin/plugin.json` (breaking).

## [1.27.0] - 2026-04-17

### Changed
- **[Skills]** `tdk-bump` — port `collect-diff-data.py` → TypeScript (Bun runtime). Python dependency removed for Step 1 of the workflow; Steps 6 and 11 still use `compute-manifest.py` (Python). Skill version bumped `1.0.15 → 1.1.0` (runtime requirement change — Bun ≥ 1.0 required). Output JSON is byte-identical to prior Python version (validated on 5 scenarios including error paths).

### Removed
- **[Skills]** `tdk-bump/scripts/collect-diff-data.py`, `scripts/tests/test_collect_diff_data.py`, `scripts/tests/__init__.py` — replaced by `collect-diff-data.ts` + `collect-diff-data.test.ts`.

## [1.26.5] - 2026-04-17

### Changed
- **[Scripts]** Refactored config detection CLI to improve API clarity
  - detect-config.ts: Updated command output to use new utility functions (findConfigFile, parseConfig, loadFeatureEnv, readTestApiConfig) and removed resultToJson helper
  - common.ts: Changed default feature prefix from 'aa' to 'feat' for semantic clarity; improved parameter naming in readTestApiConfig
  - config.ts: Removed rawConfig field from public ConfigResult interface and removed resultToJson export (moved to inline JSON serialization in CLI)
- **[Skills]** Updated tdk-load-project-context documentation
  - Updated SKILL.md to reference new featureEnv and testConfig output fields instead of deprecated rawConfig structure
- **[Tests]** Enhanced test coverage for config detection CLI
  - detect-config.test.ts: Added test D-07 validating CLI output envelope replaces rawConfig with featureEnv + testConfig
  - common.test.ts: Updated test expectations to match new default prefixList ('feat' instead of 'aa')

## [1.26.4] - 2026-04-16

### Changed
- **[tdk-core]** Enhanced module detection in UT skills
  - tdk-ut-auto: Added Step 0b module detection and configuration with interactive user prompts
  - tdk-ut-check-rules: Added Step 0b module detection with module creation flow and validation
  - tdk-ut-create-rules: Added Step 0b module detection supporting existing and new module paths
  - tdk-ut-generate: Added Step 0b module detection and module-aware test generation setup
  - tdk-ut-plan: Added Step 0b module detection with sub-workspace and module-level orchestration
- **[Scripts]** Improved UT command error handling and configuration management
  - Added cli-error-handler.ts for standardized error handling across UT commands
  - Enhanced auto.ts, check-rules.ts, create-rules.ts, generate.ts, plan.ts with improved error management
  - Updated config.ts and types.ts for better type definitions and configuration utilities
  - Enhanced ut-scripts.test.ts test coverage for CLI error scenarios

## [1.26.3] - 2026-04-14

### Added
- **[tdk-utils]** Unit tests for brainstorming script configuration
  - test_brainstorm_config.py with config validation tests
- **[specify-devtools]** Unit tests for diff data collection
  - test_collect_diff_data.py with changelog diff parsing tests

### Changed
- **[tdk-core]** Configuration format and parser updates
  - Migrated config format from YAML (.specify.yaml) to JSON (.specify.json)
  - Enhanced speckit-config-reader to support JSON format with auto-migration from YAML
  - Updated test fixtures and context builder to use new JSON format
  - Updated 7 skills documentation to reference .specify.json instead of .specify.yaml: tdk-implement-from-plan, tdk-implement, tdk-sub-workspace-init, tdk-sub-workspace-list, tdk-ut-create-rules, tdk-ut-generate, tdk-ut-plan
- **[tdk-memory]** Documentation updates
  - tdk-memory-init skill updated for .specify.json compatibility
- **[tdk-test-api]** Test code generation updates
  - tdk-test-api-gen-code-playwright-ts: auth strategy patterns and Playwright config patterns refined
  - tdk-test-api-plan: documentation clarifications
- **[tdk-utils]** Utility updates
  - brainstorm.py: improved config handling and documentation
  - Updated 3 skills for consistency: tdk-load-project-context, tdk-setup-guide, tdk-validate-task-id
- **[specify-devtools]** Changelog and distribution improvements
  - tdk-bump: simplified diff collection script and enhanced SKILL documentation
  - tdk-distribute: documentation updates

## [1.26.2] - 2026-04-12

### Changed
- **[tdk-ut-auto]** Enhanced documentation for --module parameter support
- **[tdk-ut-check-rules]** Added module-level rules checking capability
- **[tdk-ut-create-rules]** Extended to support module-specific configurations; improved .specify.json handling
- **[tdk-ut-generate]** Updated documentation for module-aware test generation
- **[tdk-ut-plan]** Enhanced planning for module-specific unit test workflows
- **[Scripts]** Improved config handling and enhanced test coverage for UT commands

## [1.26.1] - 2026-04-12

### Changed
- **tdk-core** YAML indentation standardization across 30 skills (3-space → 2-space indent)
- **tdk-utils** YAML indentation standardization across 2 skills (3-space → 2-space indent)
- **specify-devtools** YAML indentation standardization in tdk-bump skill

## [1.26.0] - 2026-04-11

### Added
- **Scripts** New TypeScript-based command infrastructure with bun runtime (replaces bash)
  - Config detection and management CLI (detect-config, config diff, config sync)
  - Feature workflow commands (create-new-feature, status tracking)
  - Unit test automation commands (plan, generate, check-rules, auto mode)
  - Utility commands (check-prerequisites, setup-plan, sync-commands)
  - Comprehensive test suites for CLI and security validation

### Changed
- **Configuration** Migrated from `.specify.yaml` to `.specify.json` format for configuration metadata
  - Enhanced version tracking and architecture support
  - Improved changelog exclusion patterns
  - Refined spec folder and ticket format configuration

- **Setup** Enhanced setup.sh with automatic dependency installation
  - Auto-detect OS (Linux, macOS, Windows) and architecture (amd64, arm64)
  - Auto-install jq, yq, and bun with fallback to manual installation guidance
  - Improved prerequisite checking flow

- **Skills** Updated 30 skill definitions with new TypeScript script references
  - Migrated from bash check-prerequisites.sh to TypeScript CLI commands
  - Updated parameter names and JSON output handling
  - Enhanced documentation for new bun-based infrastructure
  - Affected plugins: tdk-core, tdk-utils, specify-devtools

### Removed
- **Configuration** Deprecated `.specify.yaml` and `.specify.yaml.example` (replaced by JSON format)

## [1.24.0] - 2026-04-05

### Added
- **[Scripts]** Centralized `compute-manifest.py` for SHA-256 file hashing and component version tracking across all plugins
- **[General]** Centralized `manifest.json` replacing per-plugin inline checksum tracking

### Changed
- **[General]** Relocated `marketplace.json` to `.claude-plugin/` at git root for auto-detection; updated all plugin sources to absolute paths with `strict` mode
- **[General]** Cleaned inline `skills` checksum objects from all plugin.json files, replaced with `"skills": "./skills/"` path reference
- **[General]** Relocated specify-devtools plugin.json to `.claude-plugin/` subdirectory
- **[Skills]** Updated changelog-generator and distribute skill docs to reference centralized manifest system
- **[Skills]** Updated `collect-diff-data.py`, `scan-skill-docs-gaps.py`, `sync-distribute-common-files.py` to use `manifest.json`
- **[Setup]** Removed manual local marketplace registration from setup.sh and docs (auto-detected via `.claude-plugin/`)
- **[General]** Updated `distribute.sh` to use `compute-manifest.py` for component-level diffs
- **[General]** Fixed whitespace in `.claude/settings.json`

### Removed
- **[Skills]** Deleted `compute-skill-checksums.py` (replaced by `compute-manifest.py`)

## [1.23.1] - 2026-04-03

### Changed
- **[General]** `.specify/.specify.yaml`: added `logLevel` configuration and documented hook logging levels/content policy (`Trace`/`Debug` allow content; higher levels do not).
- **[Hooks]** `tdk-core/hooks/dev-context-injector.cjs`: enriched hook log payload with explicit `message` fields for skip/success paths and included injected context content in success events.
- **[General]** `tdk-core/lib/hook-logger.cjs`: added config-aware content logging gate (`shouldLogContent()`), `message` field persistence, and conditional `content` logging only when log level is `Debug` or `Trace`.
- **[General]** `tdk-core/lib/speckit-config-reader.cjs`: added `logLevel` defaulting/parsing support in both YAML parser paths and normalized config output.

## [1.23.0] - 2026-04-03

### Added
- **[General]** Added `.specify/.specify.yaml` as the central workspace configuration (architecture, docs path, git defaults, changelog exclude, and spec ticket format settings).
- **[Skills]** Added compiled cache artifact `tdk-distribute/scripts/__pycache__/sync-distribute-common-files.cpython-313.pyc` alongside distribute script updates.

### Changed
- **[Skills]** `tdk-distribute/SKILL.md`: migrated guidance from `manifest.yaml` skill checksums to per-plugin `plugin.json` checksums; documented new sync flags (`--with-claude`, `--force`, `--verbose`) and CLI wrapper usage.
- **[Skills]** `tdk-distribute/scripts/sync-distribute-common-files.py`: switched skill comparison source from `manifest.yaml` to `plugin.json`, added verbose logging, force-update mode, optional `.claude/` sync path, and improved directory exclude matching.

### Removed
- **[General]** Removed `tdk-core/.logs/hook-log.jsonl` from tracked configuration files.

## [1.22.1] - 2026-04-02

### Changed
- **[General]** `tdk-core/lib/context-builder.cjs`: removed duplicate Workspace section injection and added `Spec Context` output (spec folder, current branch, active ticket extraction from branch).
- **[General]** `tdk-core/__tests__/context-builder.test.cjs`: added coverage for ticket extraction, spec-context rendering, and regression test ensuring Workspace section is emitted once.

## [1.22.0] - 2026-04-02

### Added
- **[Hooks]** Added hook configuration system with `UserPromptSubmit` event support in tdk-core
- **[Hooks]** Added `dev-context-injector.cjs` hook to inject speckit development context on each prompt
- **[Lib]** Added `context-builder.cjs` for building speckit development context
- **[Lib]** Added `hook-logger.cjs` for hook execution logging with log rotation
- **[Lib]** Added `speckit-config-reader.cjs` for parsing .specify.yaml configuration
- **[Configs]** Added hook guidelines: development-principles.md, modularization-guidelines.md, subagent-guidelines.md
- **[Tests]** Added test suite for tdk-core hooks and lib modules

### Changed
- **[General]** tdk-core/plugin.json: added hooks field to register hook configuration

## [1.21.2] - 2026-03-29

### Changed
- **[General]** `.specify/.specify.yaml`: updated the architecture auto-detection note from `/docs:init` to `/tdk-config-init`.
- **[Skills]** `tdk-config-diff`, `tdk-config-index`, `tdk-config-sync`: synchronized slash command naming from the `/docs:*` group to `/tdk-config-*` in titles, examples, and follow-up run suggestions.
- **[Scripts]** `.specify/scripts/bash/config/diff.sh` and `.specify/scripts/bash/config/index.sh`: updated command reference comments to use the new `/tdk-config-*` command set.

## [1.21.1] - 2026-03-28

### Changed
- **[Skills]** `tdk-implement` and `tdk-implement-from-plan`: improved UT phase detection (including signals from `Delegate to:`), auto-detected `--sub-workspace`, and added orchestration branching based on `ut-plan.md` status (`/tdk-ut-generate` when a plan exists, `/tdk-ut-auto` when it does not).
- **[Skills]** `tdk-plan`: added an auto-include rule for a “Unit Test Planning” phase at the end of the plan when applicable, and clarified the boundary between plan-only behavior and execution delegation.
- **[Skills]** `tdk-ut-auto`: updated trigger/orchestration descriptions and added a “Called By” table to standardize invocation flow from plan/implement.

## [1.21.0] - 2026-03-28

### Added
- **[Skills]** Added `specify-devtools/tdk-skill-docs-sync` skill to scan and sync marketplace skill documentation, including deterministic gap scanning script and docs structure mapping reference.

### Changed
- **[Guides]** Updated command and workflow documentation to reflect 37 commands and include `tdk-batch-design`, `tdk-test-viewpoint`, and `tdk-implement-from-plan` in command reference, document flow, and evolution comparison guides.
- **[Skills]** `tdk-utils` guide skills (`obsidian-brain`, `tdk-setup-guide`, `tdk-skill-guide`) now enforce explicit smart-obsidian vault path rules to prevent `.specify/` double-prefix and empty-path errors.

## [1.20.1] - 2026-03-27

### Changed
- **[Skills]** `tdk-core/tdk-ut-auto`: refactored to orchestrator pattern that delegates to `/tdk-ut-check-rules`, `/tdk-ut-create-rules`, `/tdk-ut-plan`, and `/tdk-ut-generate`; clarified mandatory stop conditions and standardized step-by-step workflow.

## [1.20.0] - 2026-03-27

### Added
- **[Claude Hooks]** Added `destructive-command-block.cjs` to block destructive shell commands (`rm`, `rmdir`, `git reset --hard`, force push) at PreToolUse for safer command execution.
- **[Claude Hooks]** Added `privacy-block.cjs` to block access/search on sensitive files and secret-like patterns, with explicit user-approval flow via `AskUserQuestion` marker payload.

### Changed
- **[General]** `.claude/settings.json`: enabled `PreToolUse` hooks for `Bash` destructive-command blocking and `Bash|Glob|Grep|Read|Edit|Write` privacy blocking.

## [1.19.1] - 2026-03-27

### Changed
- **[Skills]** `tdk-utils/tdk-skill-guide`: switched to smart-obsidian MCP-first tool strategy, adding MCP availability guard and fallback flows for overview/detail/search/scenario/tips modes.

## [1.19.0] - 2026-03-27

### Added
- **[Docs]** Added centralized docs index at `.specify/docs/README.md` and guides hub at `.specify/docs/guides/README.md` to improve navigation by purpose.
- **[Setup]** Added Claude Code setup visual assets (extension and Windows terminal screenshots) and plugin marketplace setup screenshots under `.specify/docs/setup/`.
- **[Skills]** Added `tdk-setup-guide` and `tdk-skill-guide` skills to `tdk-utils` for interactive setup guidance and skill discovery.

### Changed
- **[Guides]** Reorganized documentation paths from `docs/` and `.specify/plugins/docs/` into `.specify/docs/guides/` and `.specify/docs/setup/`, including scenario files and setup guides.
- **[Setup]** Updated setup documentation links and references across Claude/Obsidian/plugin marketplace guides.
- **[Skills]** `tdk-bump` updated grouping guidance and diff collection mapping to classify `.specify/docs/guides/` as **Guides** and `.specify/docs/setup/` as **Setup**.
- **[Scripts]** Updated `.specify/setup.sh` paths/messages to point to the new `.specify/docs/setup/` locations.

## [1.18.0] - 2026-03-26

### Added
- **[Claude Skills]** New skill `tdk-test-viewpoint`: generates high-level test viewpoints (観点) from spec.md and ba-requirement.md, outputting UTF-8 BOM CSV. Includes SKILL.md, sample CSV example, element-type matrix, generation guidelines, and quality checklist references.

### Changed
- **[Scripts]** `status.sh`: updated task ID regex to support flexible alphanumeric formats (T###, PnTnn, etc.) instead of only T### pattern.

## [1.17.2] - 2026-03-26

### Added
- **[Config]** `.specify/.specify.yaml`: Add `changelog.exclude` config for tdk-bump skill

### Changed
- **[Skills]** tdk-bump: Move version source from top-level `version` to `metadata.version` in marketplace.json; refactor collect-diff-data.py to read changelog.exclude from `.specify/.specify.yaml`

## [1.17.1] - 2026-03-26

### Changed
- **[Skills]** Refactor 7 tdk-core skills to use `tdk-load-project-context` skill instead of direct `detect-config.sh` script invocation: `tdk-constitution`, `tdk-sub-workspace-init`, `tdk-sub-workspace-list`, `tdk-ut-auto`, `tdk-ut-create-rules`, `tdk-ut-generate`, `tdk-ut-plan`

## [1.17.0] - 2026-03-26

### Added
- **[tdk-utils]** New skill `tdk-validate-task-id` — extracted task ID validation logic shared across tdk-core skills
- **[tdk-utils]** New skill `tdk-load-project-context` — extracted project context loading shared across tdk-core skills

### Changed
- **[tdk-core]** 21 skills refactored to use `tdk-validate-task-id` and `tdk-load-project-context` for task ID validation and project context loading (DRY improvement)
- **[tdk-utils]** Updated plugin configuration
- **[Scripts]** Updated `auto.sh` and `check-rules.sh` scripts

## [1.16.0] - 2026-03-25

### Added
- **[Claude Skills]** New skill `tdk-batch-design` for batch design document generation with Scenario A (new batch) and B (existing code impact) support
- **[Claude Skills]** Added `template-filling-rules.md` reference for tdk-batch-design skill with section-by-section filling guidance

### Changed
- **[General]** `.claude/settings.json` — Added permissions deny list (security hardening: blocks dangerous rm, git push/reset, docker prune, shutdown commands)

## [1.15.3] - 2026-03-22

### Added
- **[Claude Skills]** `tdk-ui-design`: New skill for generating comprehensive UI design specifications (screen item specs, logic, error messages) with page design templates, layout guidelines, and approval sections
- **[Claude Skills]** `tdk-ui-design/references/template-filling-rules.md`: Template rules for UI design document generation ensuring consistent component naming, error handling patterns, and screen state documentation
- **[Claude Skills]** `tdk-ba-requirement/references/template-filling-rules.md`: Template rules for BA requirement document generation with section-by-section filling guidance
- **[Claude Skills]** `tdk-api-design/references/template-filling-rules.md`: Template rules for API design document generation (moved from tdk-db-design consolidation)
- **[Scripts]** `.specify/scripts/bash/clone-template.sh`: New bash utility (118 lines) for cloning reusable skill/template files with destination normalization, backup, and progress output

### Changed
- **[Claude Skills]** `tdk-api-design/SKILL.md`: Refactored from partial DB design — now consolidates database/API schema design into unified skill with Scenario A (new design) and B (existing code impact) support
- **[Claude Skills]** `tdk-ba-requirement/SKILL.md`: Updated with clarified sections and template reference paths; simplified presentation of BA requirement generation workflow
- **[Claude Skills]** `tdk-api-design/references/db-schema-format-convention.md`: Renamed from tdk-db-design reference (now part of tdk-api-design); maintains column types, index naming, FK patterns for CommonDragon
- **[Skills]** `tdk-specify-pages/SKILL.md`: Minor refinements to page design specification workflow
- **[Scripts]** `tdk-utils/shard-doc/scripts/engine.py`: Enhanced document sharding logic (2-line patch)
- **[Scripts]** `specify-devtools/tdk-bump/scripts/collect-diff-data.py`: Extended diff collection for improved file grouping (6-line addition)
- **[Docs]** `docs/tdk-command-guide.md`: Updated command references to reflect skill consolidation
- **[Docs]** `docs/tdk-document-flow.md`: Updated workflow documentation for consolidated design skills

### Removed
- **[Claude Skills]** `tdk-db-design/SKILL.md`: Consolidated into `tdk-api-design` skill — database design is now covered under unified API/database schema design workflow

## [1.15.2] - 2026-03-19

### Added
- **[General]** .specify/setup.sh: New SpecKit automated setup script with smart re-run detection (skips already-installed components), prerequisite validation (Python, jq, yq, git), venv management, config detection, and colorized step-by-step output

### Changed
- **[Skills]** tdk-bump: Bumped patch version for collect-diff-data.py enhancements
- **[Scripts]** collect-diff-data.py: Enhanced `is_excluded()` function to support glob patterns (`**`, `*`) in addition to exact matches and directory prefixes
- **[General]** marketplace.json: Added `.specify/specs/**` to changelog exclusion patterns to prevent spec files from being included in configuration change tracking

## [1.15.1] - 2026-03-18

### Changed
- **[Skills]** tdk-bump: Enhanced path pattern matching with glob support (**, *) to support flexible .specify/ component grouping
- **[Scripts]** collect-diff-data.py: Added regex module and updated COMPONENT_MAP for better path pattern handling including nested structures (agents, hooks under .specify/**)

## [1.15.0] - 2026-03-18

### Added
- **[General]** ctx7-setup.md: Setup guide for Context7 plugin integration (MCP tools: resolve-library-id, query-docs)
- **[General]** github-mcp-setup.md: Setup guide for GitHub MCP server read-only access (PAT setup, remote/local modes, available tools)

### Changed
- **[Claude Agent Config]** settings.json: Added context7-plugin@context7-marketplace to enabled plugins; moved env block before hooks
- **[Embedded Skills]** docs-seeker SKILL.md: Refactored from script-based workflow to MCP tool routing chain (context7 MCP → GitHub MCP → WebFetch → WebSearch); removed script dependency

### Removed
- **[Embedded Skills]** docs-seeker: Removed legacy scripts (analyze-llms-txt.js, detect-topic.js, fetch-docs.js + test suite), workflow files (library-search.md, repo-analysis.md, topic-search.md), references/ docs, .env.example, and package.json — replaced by MCP tool routing

## [1.14.1] - 2026-03-18

### Changed
- **[General]** Added `docs-seeker` skill path to `.claude-plugin` marketplace plugin configuration

## [1.14.0] - 2026-03-16

### Added
- **[Embedded Skills]** `tdk-specify`: Added evals test suite (`evals/evals.json`) with 3 test cases covering English spec generation, Vietnamese input handling, and missing-description error handling

### Changed
- **[Embedded Skills]** `tdk-analyze`: Enriched frontmatter with `argument-hint`, `compatibility`, `user-invocable`, `license`, `metadata` (category, requires, input_format, output_format, examples)
- **[Embedded Skills]** `tdk-memory-changelog`: Added `metadata` block with category `Analysis & Review` and `requires: [tdk-memory-init]`
- **[Embedded Skills]** `tdk-memory-checksum`: Added `metadata` block with category `Context & Memory` and `requires: [tdk-memory-init]`
- **[Embedded Skills]** `tdk-memory-init`: Added `metadata` block with full input/output format, examples, and `requires: []`
- **[Embedded Skills]** `tdk-memory-preload`: Added `argument-hint` and `metadata` block with category, requires, input/output format, and examples
- **[Embedded Skills]** `tdk-memory-query`: Added `metadata` block with examples, marked `user-invocable: true`, added `argument-hint`
- **[Embedded Skills]** `tdk-memory-update`: Added `metadata` block with category `Context & Memory`, requires chain, and examples

## [1.13.0] - 2026-03-15

### Added
- **[Claude Agent Config]** Added new `tdk-api-design` skill for generating API design documents from feature specifications
- **[Templates]** Added template for `api_design.md` generation

### Changed
- **[General]** Improved `tdk-specify-pages` skill prompt to better handle missing documentation, use actual API endpoints, follow UI/UX guidelines, and provide a clearer final summary

## [1.12.1] - 2026-03-15

### Changed
- **[Claude Agent Config]** Added `user-invocable: false` to 14 skill frontmatters to prevent direct user invocation (sequential-thinking, docx, pdf, pptx, xlsx, tdk-memory-checksum, brainstorming, common, context-engineering, docs-seeker, obsidian-brain, planning, problem-solving, repomix, shard-doc)

### Removed
- **[Claude Agent Config]** Deleted local `.claude/skills/docs-seeker/` (17 files) — skill now available via `tdk-utils` plugin marketplace only

## [1.12.0] - 2026-03-15

### Added
- **[Claude Agent Config]** New `tdk-db-design` skill — generates DB design documents for leader/PO approval with Scenario A (new DB) and B (existing code impact) support
- **[Claude Agent Config]** DB design format convention reference (`db-design-format-convention.md`) — column types, index naming, FK patterns for CommonDragon
- **[Templates]** DB design output template (`db-design-template.md`) — standardized markdown table format with new/modified tables, impact analysis, ER diagram, and approval sections

### Changed
- **[Claude Agent Config]** Updated `tdk-ba-requirement` skill template path reference from `ba-requirement-output-template.md` to `ba-requirement-template.md`
- **[Templates]** Renamed BA requirement template for naming consistency (`ba-requirement-output-template.md` → `ba-requirement-template.md`)

## [1.11.0] - 2026-03-15

### Added
- **[Claude Agent Config]** New `tdk-ba-requirement` skill for generating BA requirement documents from feature specifications (includes task validation, spec parsing, technical implication analysis, and approval section generation)
- **[Templates]** New `ba-requirement-output-template.md` template with structured sections for requirements, analysis, clarifications, and approval sign-off

## [1.10.5] - 2026-03-13

### Added
- **[Embedded Skills]** `tdk-memory-preload`: Added `flow-preload-mcp.md` and `flow-preload-normal.md` — per-skill MCP and non-MCP execution flow references
- **[Embedded Skills]** `tdk-memory-query`: Added `flow-available-mcp.md` and `flow-query-normal.md` — per-skill MCP and non-MCP execution flow references
- **[Embedded Skills]** `tdk-memory-update`: Added `flow-update-mcp.md` and `flow-update-normal.md` — per-skill MCP and non-MCP execution flow references

### Changed
- **[Embedded Skills]** `tdk-memory-preload/SKILL.md`: Simplified — Step 0 now redirects to `flow-preload-mcp.md` or `flow-preload-normal.md` based on MCP availability, replacing 100+ lines of inlined steps
- **[Embedded Skills]** `tdk-memory-query/SKILL.md`: Simplified — redirects to per-skill flow references after MCP availability check
- **[Embedded Skills]** `tdk-memory-update/SKILL.md`: Simplified — redirects to per-skill flow references after MCP availability check

### Removed
- **[General]** Deleted shared `references/mcp-tool-mapping.md` — replaced by per-skill flow reference files

## [1.10.4] - 2026-03-13

### Changed
- **[General]** `mcp-tool-mapping.md`: updated all MCP tool references to full `mcp__smart-obsidian__*` names; added deferred tools notice and explicit `ToolSearch("select:...")` requirement before first MCP call
- **[Embedded Skills]** `tdk-memory-preload`: expanded Step 0 with inline ToolSearch + step-by-step MCP check instead of cross-reference-only
- **[Embedded Skills]** `tdk-memory-query`: same Step 0 expansion as preload
- **[Embedded Skills]** `tdk-memory-update`: same Step 0 expansion as preload

## [1.10.3] - 2026-03-13

### Added
- **[General]** New shared reference `mcp-tool-mapping.md` for MCP/fallback tool mapping used by all tdk-memory skills

### Changed
- **[General]** `tdk-memory-preload`: refactored MCP availability check to Step 0 using shared reference; steps renumbered; simplified tool call descriptions
- **[General]** `tdk-memory-query`: same refactoring — MCP check to Step 0, guard checks to Step 1, steps renumbered
- **[General]** `tdk-memory-update`: same refactoring — MCP check to Step 0, read memory-index merged into Step 1, steps renumbered; removed duplicated MCP/fallback inline code blocks

## [1.10.2] - 2026-03-13

### Changed
- **[Embedded Skills]** `tdk-memory-preload`: Switch MCP availability guard from `list_vault_files` to `get_server_info` for more reliable health check
- **[Embedded Skills]** `tdk-memory-query`: Switch MCP availability guard from `list_vault_files` to `get_server_info` for more reliable health check
- **[Embedded Skills]** `tdk-memory-update`: Switch MCP availability guard from `list_vault_files` to `get_server_info` for more reliable health check

## [1.10.1] - 2026-03-12

### Changed
- **[General]** `tdk-memory-preload`: Added MCP Availability Guard (Step 0.5) detecting smart-obsidian MCP at runtime; added Step 2.5 cross-domain semantic discovery via `search_vault_smart`; updated Step 3 to load files via `get_vault_file` (MCP) or `tdk-memory-query` legacy fallback when MCP unavailable
- **[General]** `tdk-memory-query`: Added MCP Availability Guard (Step 0.5); updated Step 2 file resolution to use `list_vault_files` / `search_vault_smart` / `search_vault` MCP tools based on query flags; updated Step 3 to read via `get_vault_file` (MCP) or `Read` tool fallback
- **[General]** `tdk-memory-update`: Added MCP Availability Guard (Step 0.5); replaced section-anchor strategy with heading-based `patch_vault_file` / `create_vault_file` MCP tools in Step 4; updated Step 5 index rebuild to use `list_vault_files`; removed malformed-tag guard and section-anchor reference doc dependency; updated block ID guidance to heading-based targeting

## [1.10.0] - 2026-03-12

### Added
- **[Embedded Skills]** Added `docs-seeker` skill to `tdk-utils`: script-first documentation discovery via context7.com llms.txt standard; includes `detect-topic.js`, `fetch-docs.js`, `analyze-llms-txt.js` scripts with zero-token overhead, test suite (3 test files + runner), workflow references (library-search, repo-analysis, topic-search), and advanced/error/context7-patterns reference docs
- **[Embedded Skills]** Added `shard-doc` skill to `tdk-utils`: splits large markdown documents (200+ lines) into smaller section files by heading level, replaces extracted content with Obsidian `[[wikilinks]]`, generates navigation index; includes Python scripts (`engine.py`, `rewriter.py`, `shard_doc.py`), wikilink sharding pattern reference, and test samples

## [1.9.5] - 2026-03-10

### Added
- **[General]** Added `document-converter` plugin with `xlsx-to-csv` skill: converts XLSX files to CSV with auto-detect output directory (`{source}_CSV_AI`), multi-sheet support (each sheet → separate CSV file), recursive directory processing, UTF-8 BOM encoding for Excel compatibility, and `--overwrite` flag.

### Changed
- **[General]** Registered `document-converter` plugin in marketplace.json.

## [1.9.4] - 2026-03-08

### Changed
- **[Embedded Skills]** `tdk-implement-from-plan`: Phase detection upgraded to flexible regex supporting `##`–`####` headings with any separator (`:`, `.`, `—`, `-`). Added lightweight phase status tracking via `<!-- status:done -->`/`<!-- status:skipped -->` HTML comments written to plan.md. Split phase execution into UT phases (4B) and Implementation phases (4C). UT phases now strictly enforce delegation to `/tdk-ut-auto` — never write tests inline. Implementation phases explicitly require actual code output.
- **[Embedded Skills]** `tdk-status`: Fast-path display (plan.md without tasks.md) now reads `<!-- status:done/skipped -->` markers to show real progress (✅/⏭️/⏸️) with progress bar and percentage. Previously showed all phases as pending.
- **[Embedded Skills]** `tdk-ut-auto`: Script execution hardened to always run from workspace root (`git rev-parse --show-toplevel`). Added existence check for `auto.sh` before execution. `detect-config.sh` also anchored to workspace root.

## [1.9.3] - 2026-03-08

### Changed
- **[General]** `tdk-plan` skill: removed Phase 1 step that ran `update-agent-context.sh` to update AI agent context files
- **[General]** `planning` skill: removed Phase 1 step that referenced agent context update

### Removed
- **[Scripts]** Deleted `update-agent-context.sh` (817-line bash script) that auto-updated AI agent context files (Claude, Gemini, Copilot, Cursor, etc.) from plan.md data

## [1.9.2] - 2026-03-08

### Changed
- **[General]** Consolidated git and spec configuration into `.specify.yaml` under new `git:` and `specs:` sections (migrated from `.specify.env`)
- **[Scripts]** Updated `common-env.sh` to load config from `.specify.yaml` via `yq` instead of parsing `.specify.env`
- **[Claude Agent Config]** Updated `development-rules.md` config source table — replaced `.specify.env` row with `.specify.yaml → git:, specs:` reference
- **[Claude Agent Config]** Added `tdk-test-api@tdk-plugin-marketplace` to enabled plugins in `settings.json`
- **[Embedded Skills]** Updated all 16 tdk-core skills and archived commands to reference `.specify.yaml` `git.prefix-list` / `specs.default-folder` instead of `.specify.env` env vars
- **[Embedded Skills]** Updated `brainstorming` skill script to parse `.specify.yaml` for prefix config instead of `.specify.env`
- **[Embedded Skills]** Updated `tdk-distribute` docs to reference `.specify.yaml` instead of `.specify.env.example`

### Removed
- **[General]** Deleted `.specify.env` and `.specify.env.example` — git/spec configuration migrated into `.specify.yaml`

## [1.9.1] - 2026-03-08

### Changed
- **[General]** `marketplace.json`: Registered 2 new plugin bundles — `tdk-test-api` (API test automation: plan, test case generation, Playwright TS code gen) and `tdk-utils` (utility skills: brainstorming, planning, problem-solving, context-engineering, obsidian-brain, repomix, common)
- **[Embedded Skills]** `tdk-memory-init`: Added Step 5.1 — Obsidian enrichment for domain-overview.md (full frontmatter: aliases, type, domain, tags, created_at, updated_by; wikilinks to sibling files)
- **[Embedded Skills]** `tdk-memory-init`: Added Step 6.5 — generate `memory-map.canvas` visual domain map (Obsidian Canvas JSON, radial layout); SHA256 entry added to memory.yaml manifest
- **[Embedded Skills]** `tdk-memory-init`: Updated Step 6 memory-index.md domain table to use wikilink format for domain rows
- **[Embedded Skills]** `tdk-memory-update`: Added Step 4.1 — Obsidian enrichment for new files (frontmatter, wikilinks, callouts, block IDs)
- **[Embedded Skills]** `tdk-memory-update`: Added Step 4.2 — wikilink preservation rule when updating existing memory files
- **[Templates]** All 6 memory templates enriched with Obsidian-compatible frontmatter: aliases, type, multi-line tags, created_at, updated_by; title formats standardized (e.g. "{ScreenName} Screen", "{FlowName} Flow")

## [1.9.0] - 2026-03-08

### Added
- **[General]** New `tdk-utils` plugin in marketplace with 7 utility skills migrated from `.claude/skills/`: brainstorming, common, context-engineering, obsidian-brain, planning, problem-solving, repomix
- **[Claude Agent Config]** Enabled `tdk-utils@tdk-plugin-marketplace` in `settings.json`

### Changed
- **[General]** Updated README with `tdk-utils` plugin entry and updated installation example with `tdk-memory`
- **[Embedded Skills]** `tdk-core/tdk-plan`: Updated AI Docs Manager step to use `tdk-memory-query` skill instead of deprecated `memory-architect` script
- **[Scripts]** `specify-devtools/tdk-bump`: Fixed `compute-skill-checksums.py` docstring to show correct default skill version (`0.1.0`)

### Removed
- **[Claude Agent Config]** Removed `claude-code` skill from `.claude/skills/` (SKILL.md + 11 reference files)
- **[Claude Agent Config]** Removed `mcp-builder` skill from `.claude/skills/` (SKILL.md + 4 references + 4 scripts)
- **[Claude Agent Config]** Removed `template-skill/SKILL.md`

## [1.8.0] - 2026-03-07

### Added
- **[Embedded Skills]** `tdk-core`: New `tdk-implement-from-plan` skill — stateless fast path to execute implementation directly from plan.md phases without requiring tasks.md

### Changed
- **[Embedded Skills]** `tdk-core/tdk-status`: Updated skill definition and workflow tracking instructions
- **[Embedded Skills]** `specify-devtools/tdk-bump`: Refactored — enhanced diff collection script, improved checksum computation, updated SKILL.md with detailed step-by-step workflow
- **[Embedded Skills]** `specify-devtools/tdk-distribute`: Updated sync-config.yaml distribution configuration

### Removed
- **[General]** `.specify/manifest.yaml` — centralized skill manifest replaced by per-plugin plugin.json files
- **[Embedded Skills]** `tdk-bump/install.sh` — install script removed (no longer needed)

## [1.7.5] - 2026-03-07

### Changed
- **[Scripts]** Remove `save_manifest_plugins()` function and manifest.yaml sync logic from `tdk-distribute` sync script — manifest updates now handled externally

## [1.7.4] - 2026-03-07

### Added
- **[General]** specify-devtools plugin.json: initial plugin descriptor file

### Changed
- **[Embedded Skills]** tdk-bump: fix new skill default version from 1.0.0 to 0.1.0, add plugin.json sync to Step 11, update Step 12 summary format
- **[Embedded Skills]** tdk-bump: compute-skill-checksums.py default version changed from 1.0.0 to 0.1.0 for unmanifested skills
- **[Claude Agent Config]** memory-guardian agent: add `model: sonnet` to frontmatter

## [1.7.3] - 2026-03-07

### Added
- **[Embedded Skills]** `tdk-memory-preload` skill — auto-loads relevant memory context (business rules, data models, constraints) before spec/plan generation
- **[Embedded Skills]** `tdk-memory-query` skill — NL query interface for `.specify/memory/` knowledge base with agent-mode output
- **[Claude Agent Config]** `memory-guardian` agent — validates specs/plans against memory for business logic conflicts (CONFLICT/WARNING/CLEAR)

### Changed
- **[Embedded Skills]** `tdk-analyze`, `tdk-clarify`, `tdk-plan`, `tdk-specify`, `tdk-specify-pages` — added Step 0.memory for automatic memory context pre-loading
- **[Embedded Skills]** `tdk-plan` — added Phase 0.guardian for business logic validation via memory-guardian agent
- **[Embedded Skills]** `tdk-memory-init` — improved domain map scope column auto-fill from evidence snippets (fresh-init + re-run flows)
- **[General]** `tdk-memory` plugin.json — updated description and bumped to v0.1.0

### Removed
- **[Claude Agent Config]** `skill-creator` skill — removed entirely (LICENSE, SKILL.md, references, scripts)

## [1.7.2] - 2026-03-06

### Added
- **[Embedded Skills]** Add `tdk-memory-init` reference files for modular skill architecture (domain-extraction-and-confirmation, domain-overview-template, fresh-init-flow, memory-index-template, re-run-flow)
- **[Embedded Skills]** Add `tdk-memory-update` reference files for modular skill architecture (deprecation-flow, domain-source-extraction-flow, regenerate-memory-index-flow)

### Changed
- **[Scripts]** Fix file handle leak in `compute-sha256-hashes.py` — use `with` statement for proper resource cleanup
- **[Embedded Skills]** Refactor `tdk-memory-init` SKILL.md — extract inline flows into 5 modular reference files; improve description for better LLM skill triggering
- **[Embedded Skills]** Refactor `tdk-memory-update` SKILL.md — extract inline flows into 3 modular reference files

## [1.7.1] - 2026-03-06

### Changed
- **[tdk-memory-init]** Replace domain interview with file-based extraction: AI reads provided source files to extract business domains with evidence snippets, conflict/ambiguity detection, and path/size security guards; falls back to text description if no file given
- **[tdk-memory-init]** Scaffold creates only `flows/` subdirectory per domain — removed auto-generation of `services.md` and `business-rules.md` at init time (use `/tdk-memory-update` instead)
- **[tdk-memory-init]** Re-run guard replaced with idempotent flow: presents "Run /tdk-memory-update" vs "Force Re-init" options with explicit wipe confirmation before deleting existing domain folders
- **[tdk-memory-init]** Removed Step 4 (copy templates), Step 5 (create per-domain files from templates), and Step 8 (create `memory-architect/SKILL.md`); `memory.yaml` now records only `memory-index.md` hash at init time
- **[tdk-memory-update]** Added Step 1.5: optional source file extraction for domain-level updates (`services.md`, `business-rules.md`, `flows/`) with domain mismatch check against Step 1 routing result
- **[tdk-memory-update]** Added Step 3.5: Merge vs Replace decision for domain-level updates with preview of entries to be removed before replacement
- **[tdk-memory-update]** `memory-index.md` regeneration no longer excludes `memory-architect/` directory

### Removed
- **[tdk-memory-init]** Deleted `references/memory-architect-skill-template-for-project-specific-ai-context.md` — memory-architect step removed from init flow

## [1.7.0] - 2026-03-06

### Added
- **[Plugin Marketplace]** New plugin `tdk-memory` (v0.0.2) — domain-based project memory knowledge base with 4 skills: `tdk-memory-init` (domain scaffold interview), `tdk-memory-update` (natural language update routing with additive/replacement strategy), `tdk-memory-checksum` (validate memory checksums against manifest), `tdk-memory-changelog` (generate changelog entries for memory changes)
- **[Plugin Marketplace]** SHA-256 checksum script (`compute-sha256-hashes.py`) for `tdk-memory`
- **[Templates]** 6 memory domain templates under `.specify/templates/memory/`: `business-rules`, `data-model`, `flow`, `screen-flow`, `screen`, `services`

### Changed
- **[Plugin Marketplace]** README updated to list `tdk-memory` plugin with skill inventory and description

## [1.6.2] - 2026-03-05

### Changed
- **[Scripts]** Replace `SCRIPT_DIR`-based relative path resolution with `CLAUDE_PROJECT_DIR` env var (git fallback) in `common-env.sh` `get_repo_root()`
- **[Scripts]** Use `CLAUDE_PROJECT_DIR` for `REPO_ROOT` in `show-progress.sh`, `sync-commands.sh`, `run-migration-tests.sh`
- **[Scripts]** Update migration tests: add prompt stub creation, fix function rename `get_bug_list_path` → `get_bugs_dir`, update CLI signatures to include feature-id arg
- **[Embedded Skills]** Replace `SCRIPT_DIR`-relative sourcing with `REPO_ROOT`/`CLAUDE_PROJECT_DIR` in tdk-test-api skill scripts (gen-code, generate-testcase, plan)
- **[Embedded Skills]** Simplify `install.sh` path resolution in tdk-bump using `CLAUDE_PROJECT_DIR`

## [1.6.1] - 2026-03-05

### Changed
- **[Embedded Skills]** Update `tdk-test-api-generate-testcase` template path references from `.specify/templates/` to `.specify/templates/test/api-test/`
- **[Embedded Skills]** Update `tdk-test-api-plan` template path references from `.specify/templates/` to `.specify/templates/test/api-test/`
- **[Templates]** Reorganize API test templates into nested `test/api-test/` subdirectory for better template organization

## [1.6.0] - 2026-03-05

### Added
- **[Plugin]** New `tdk-test-api` plugin with 3 skills for API test automation
- **[Skill]** `tdk-test-api-plan` — generate API test plans from OpenAPI specs with Python parser
- **[Skill]** `tdk-test-api-generate-testcase` — generate test cases from API test plans
- **[Skill]** `tdk-test-api-gen-code-playwright-ts` — generate Playwright TypeScript test code with auth strategy and config pattern references
- **[Templates]** `api-test-plan-template.md` and `api-testcases-template.md` for API test artifacts

### Changed
- **[Scripts]** Add `json_escape()`, `read_test_api_config()`, `resolve_skill_workspace()` helpers to `common-env.sh`
- **[Scripts]** Expose `RAW_CONFIG` in `detect-config.sh` output for plugin-specific config reads

## [1.5.3] - 2026-03-04

### Changed
- **[General]** Add `_shared` directory to tdk-distribute sync-config include paths
- **[Scripts]** Update `status.sh` command references from `/erc:*` to `/tdk-*` syntax

## [1.5.2] - 2026-03-04

### Changed
- **[Scripts]** Migrate `compute-skill-checksums.py` manifest format from flat `skills:` to nested `plugins:` structure; add `--write` flag for direct manifest updates; add `build_plugins_section()` and `write_manifest_plugins()` helpers
- **[Scripts]** Migrate `sync-distribute-common-files.py` manifest format from `skills:` to `plugins:` key; rename `save_manifest_skills` → `save_manifest_plugins`; add `get_skills_section()` helper for backward-compatible manifest reading

## [1.5.1] - 2026-03-04

### Changed
- **[Scripts]** Add `flatten_skills()` to `compute-skill-checksums.py`: handle nested plugin-grouped manifest format in skill classification
- **[Scripts]** Add `flatten_skills()` to `sync-distribute-common-files.py`: handle nested plugin-grouped manifest format in skill distribution
- **[Scripts]** Update docstring step reference in `compute-skill-checksums.py`: "Step 10.5" → "Step 6"

## [1.5.0] - 2026-03-04

### Added
- **[Embedded Skills]** New `tdk-distribute` skill: distribute common .specify/ files from current project to target projects with sync-config.yaml and sync script
- **[Scripts]** Add `compute-skill-checksums.py` for detecting skill content changes via MD5 checksums
- **[Embedded Skills]** Add checksum-based skill version tracking to `tdk-bump` workflow (Step 6 + Step 11 manifest updates)

### Changed
- **[Embedded Skills]** Centralize version tracking: remove inline `version` from 33 skill SKILL.md frontmatter files (tdk-core x31, tdk-bump x1) — versions now managed in manifest.yaml
- **[Configurations]** Register `tdk-distribute` in marketplace.json plugin registry

## [1.4.2] - 2026-03-04

### Changed
- **[General]** Update plugins README: add `tdk-core` to plugin table, add VSCode Extension setup guide (Option B), update enabledPlugins config and verification steps

### Added
- **[General]** Add 5 screenshot assets for plugin marketplace setup documentation (access settings, add marketplace, success confirmation, skill loading in extension/terminal)

## [1.4.1] - 2026-03-03

### Changed
- **[Embedded Skills]** Update cross-references in 17 `tdk-core` skills: `/tdk-cmd-sub` syntax
- **[Claude Agent Config]** Update planning skill and output-standards: `/tdk-tasks` references
- **[Scripts]** Update 6 bash scripts (check-prerequisites, sync-commands, ut/*): command references to new skill syntax
- **[Templates]** Update 5 templates (checklist, plan, tasks, ut-phase, ut-plan): command references to new skill syntax
- **[Configurations]** Update document-manager.md: `/tdk-config-index`
- **[General]** Update `.specify.yaml.example`: `/tdk-config-init`

## [1.4.0] - 2026-03-03

### Added
- **[Embedded Skills]** Migrate 31 Tihon slash commands to `tdk-core` plugin skills with YAML frontmatter and cross-ref updates

### Changed
- **[Claude Agent Config]** Enabled `tdk-core` plugin in `.claude/settings.json`
- **[General]** Registered `tdk-core` with 31 skill references in marketplace.json

### Removed
- **[Commands]** Archived 31 Tihon slash commands to `.specify/commands-archived/` (replaced by plugin skills)

## [1.3.0] - 2026-03-02

### Added
- **[Embedded Skills]** `references/sheet-reference-cards.md` — CSV-verified specs for all 20 sheet types in DevelopmentDocument_CSV_AI (データフロー設計, 画面定義書, API mapping mini-sheets)
- **[Embedded Skills]** `references/validation-checks.md` — 10 post-edit validation checks for design document consistency (completeness, cross-doc parity, CSV-reference completeness, etc.)
- **[Embedded Skills]** `references/anti-regression-rules.md` — 10 anti-regression rules to prevent known failure patterns (route-first classification, evidence-based edits, free-form 業務チェック handling)

## [1.2.0] - 2026-03-02

### Added
- **[General]** `specify-devtools` plugin registered in marketplace with `tdk-bump` skill
- **[Claude Agent Config]** `specify-devtools@tdk-plugin-marketplace` enabled in `.claude/settings.json`

### Changed
- **[Embedded Skills]** Migrated `tdk-bump` (SKILL.md, install.sh, collect-diff-data.py) from `.claude/skills/` to `.specify/plugins/specify-devtools/skills/`
- **[General]** Updated marketplace README to document new plugin and generalize "Adding a new plugin" instructions

## [1.1.0] - 2026-03-02

### Added
- **[Plugin Marketplace]** New `tdk-plugin-marketplace` registry at `.specify/plugins/` with `marketplace.json` defining plugin sources and skill declarations
- **[Embedded Skills]** `document-skills` plugin with 4 new document processing skills: `docx` (create/edit/analyze .docx files with OOXML schema validation, redlining workflow, docx-js integration, and comment templates), `pdf` (form filling, field extraction, bounding box checks, annotation-based filling, PDF-to-image conversion), `pptx` (HTML-to-PPTX conversion, OOXML manipulation, slide inventory/rearrange/replace, thumbnail generation), `xlsx` (spreadsheet formula recalculation support)

## [1.0.2] - 2026-03-02

### Added
- **[Claude Agent Config]** `install.sh` — New install script for `tdk-bump` skill; installs `pyyaml>=6.0` into project `.venv` with Linux/macOS and Windows path support

### Changed
- **[Claude Agent Config]** `SKILL.md` — Added Step 2 "Bootstrap manifest" handling Case A (manifest missing: create with defaults) and Case B (manifest exists but version empty: prompt user to set version); renumbered subsequent steps 2→11; updated collect-diff-data.py output description to include `manifest_exists` field
- **[Claude Agent Config]** `collect-diff-data.py` — Added `manifest_exists` boolean to JSON output; replaced yaml import fallback with hard-exit + helpful install hint; improved `parse_manifest` error handling with typed exceptions and clean None returns

## [1.0.1] - 2026-03-01

### Changed
- **[Commands]** `tdk-plan` — Added Step 1.5 "Handle Existing Plan": detects `PLAN_EXISTS` flag from setup script and prompts user to update existing plan, regenerate from scratch, or abort; Added UPDATE mode (preserve populated sections) and REGENERATE mode (fresh template via `--force`) guidance to Step 2
- **[Scripts]** `setup-plan.sh` — Added `--force` flag to overwrite existing `plan.md` unconditionally; script now detects pre-existing plan before template copy and reports `PLAN_EXISTS` in both JSON and plain-text output; template copy skipped when plan exists unless `--force` is passed

## [1.0.0] - 2026-03-01

### Added
- **[Claude Agent Config]** New `tdk-bump` skill (`SKILL.md`) — 10-step workflow for generating Keep-a-Changelog entries from staged or historical git diffs in `.specify/`, `.claude/`, `.github/` directories
- **[Claude Agent Config]** Added `collect-diff-data.py` helper script — parses git diff output, filters to tracked config directories, classifies files by component group (Scripts, Commands, Templates, Embedded Skills, Memory, Configurations, etc.), and reads current version from `.specify/manifest.yaml`
