# Changelog

All notable changes to this plugin will be documented in this file.

Format: [Keep a Changelog](https://keepachangelog.com/en/1.1.0/), Semver.

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
