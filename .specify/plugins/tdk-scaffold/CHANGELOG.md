# Changelog

All notable changes to this plugin will be documented in this file.

Format: [Keep a Changelog](https://keepachangelog.com/en/1.1.0/), Semver.

## [2.1.0] - 2026-07-05

### Added
- tdk-plan-skill-routing: add reviewed route file init, inspection, diff, register, verify, and optimization workflow
- tdk-scaffold-from-recommendation: add plan-skill-routing proposal artifact format for approved routing suggestions

### Changed
- tdk-scaffold-from-recommendation: parse routing suggestions and scaffold reviewable proposals without mutating route files
- tdk-sub-workspace-automation-recommend: document optional routing suggestions with explicit review/register handoff
- Plugin metadata: advertise route proposal management alongside automation recommendation and golden-path scaffolding

## [2.0.0] - 2026-07-01

### Added
- Added tdk-sub-workspace-automation-recommend skill to recommend skills and agents for a selected sub-workspace.

### Changed
- Streamlined tdk-scaffold-from-recommendation skill implementation to target sub-workspace directories.

### Removed
- Removed tdk-recommend-automations skill (replaced by tdk-sub-workspace-automation-recommend).

## [1.2.2] - 2026-06-30

### Changed
- tdk-golden-path-scaffold: accept workspace layout evidence and workspace dependency policy guidance while keeping legacy topology/policy fallback

## [1.2.1] - 2026-06-30

### Changed
- Updated tdk-golden-path-scaffold references to point to tdk-workflow-config-apply

## [1.2.0] - 2026-06-27

### Added
- Added tdk-golden-path-scaffold skill to support dry-run-first golden-path scaffolding from approved workspace topology

### Changed
- Updated display name, description, and default prompts to include the new golden-path scaffolding capability

## [1.1.0] - 2026-06-27

### Added
- tdk-golden-path-scaffold: add guarded dry-run-first scaffold recipe workflow for approved architecture/topology skeletons.
- Add golden-path output contract, recipe schema, safety gates, dry-run/apply workflows, and report templates.

### Changed
- Update plugin metadata to include golden-path skeleton scaffolding without business-code generation.

## [1.0.0] - 2026-06-15

### Added
- Add .claude-plugin/interface.json interface definition

### Removed
- Move .codex-plugin/plugin.json to codex-plugins registry

## [0.3.1] - 2026-06-14

### Changed
- tdk-scaffold-from-recommendation: clarify prerequisite wording to refer to the installed scaffold plugin rather than a literal path check

## [0.3.0] - 2026-05-29

### Added
- tdk-scaffold-from-recommendation: add skill for scaffolding skills and agents from approved recommendation reports
- tdk-scaffold-from-recommendation: add reusable output pattern references for generated SKILL.md and agent.md files

### Changed
- Update plugin metadata to describe both recommendation and scaffolding workflows
- Register tdk-scaffold in the marketplace catalog with strict loading enabled

## [0.2.0] - 2026-05-29

### Added
- tdk-scaffold-from-recommendation skill (v0.1.0) — reads approved recommendation.md, scaffolds SKILL.md + references/ stubs for skills and agent.md for agents following TDK conventions
- references/skill-output-pattern.md — structural pattern for generated SKILL.md files
- references/agent-output-pattern.md — structural pattern for generated agent.md files

### Changed
- Plugin description updated to reflect both recommend + scaffold scope
- Registered in marketplace.json

## [0.1.0] - 2026-05-24

### Added
- tdk-recommend-automations skill (v0.1.0) — architecture-aware skill/agent recommendations from .specify.json + project docs; maps monolith/modular-monolith→monolith preset and microservices/layered-application→distributed preset; optional vercel-labs:find-skills community discovery; emits .specify/reports/recommendation-<project>.md
- references/architecture-presets.md defining baseline recommendations per category
- three-format plugin.json manifests: .claude-plugin / .codex-plugin / .cursor-plugin
