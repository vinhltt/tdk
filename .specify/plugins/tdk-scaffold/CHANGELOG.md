# Changelog

All notable changes to this plugin will be documented in this file.

Format: [Keep a Changelog](https://keepachangelog.com/en/1.1.0/), Semver.

## [0.1.0] - 2026-05-24

### Added
- tdk-recommend-automations skill (v0.1.0) — architecture-aware skill/agent recommendations from .specify.json + project docs; maps monolith/modular-monolith→monolith preset and microservices/layered-application→distributed preset; optional vercel-labs:find-skills community discovery; emits .specify/reports/recommendation-<project>.md
- references/architecture-presets.md defining baseline recommendations per category
- three-format plugin.json manifests: .claude-plugin / .codex-plugin / .cursor-plugin
