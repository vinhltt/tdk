# Changelog

All notable changes to this plugin will be documented in this file.

Format: [Keep a Changelog](https://keepachangelog.com/en/1.1.0/), Semver.

## [2.0.2] - 2026-06-27

### Changed
- Updated documentation/links to point to .specify/docs/en/ across skills (obsidian-brain, tdk-setup-guide, tdk-skill-guide).

## [2.0.0] - 2026-06-15

### Added
- Add .claude-plugin/interface.json interface definition

### Removed
- Move .codex-plugin/plugin.json to codex-plugins registry

## [1.11.4] - 2026-06-09

### Changed
- Project root resolution: tdk-load-project-context, tdk-scout, tdk-setup-guide skills adopt agent-resolved-project-root / bash -lc pattern

## [1.11.3] - 2026-06-07

### Changed
- brainstorming: replaced hardcoded .claude/skills/ script paths with ${CLAUDE_SKILL_DIR} in SKILL.md and scripts/README.md
- shard-doc: replaced hardcoded .claude/skills/ script paths with ${CLAUDE_SKILL_DIR} in SKILL.md

## [1.11.2] - 2026-06-07

### Changed
- brainstorming: replaced hardcoded .claude/skills/ script paths with ${CLAUDE_SKILL_DIR} in SKILL.md and scripts/README.md
- shard-doc: replaced hardcoded .claude/skills/ script paths with ${CLAUDE_SKILL_DIR} in SKILL.md

## [1.11.0] - 2026-06-02

### Changed
- Retarget plugin metadata toward research, scouting, and problem solving

### Removed
- planning: remove retired planning skill and standalone reference docs

## [1.10.8] - 2026-06-01

### Changed
- researcher: accept explicit output_path and self-resolve timestamped research report paths under research/
- planning and research: align planning output standards and research guidance with research/ report directories

## [1.10.7] - 2026-06-01

### Changed
- tdk-load-project-context: make script commands CWD-independent — resolve project root via CLAUDE_PROJECT_DIR / GITHUB_WORKSPACE / git rev-parse and run detect-config in a $PROJECT_DIR/.specify/scripts/ts subshell.

## [1.10.6] - 2026-05-31

### Changed
- planning: update implementation handoff guidance to /tdk-implement
- tdk-red-team-skeptic: check integration gaps against /tdk-implement artifacts
- tdk-load-project-context and tdk-validate-task-id: recognize tdk-implement as a host skill

## [1.10.5] - 2026-05-30

### Changed
- Updated status vocabulary in output-standards.md to enforce new status values (todo|in_progress|done|skipped|blocked|cancelled)

## [1.10.4] - 2026-05-29

### Changed
- brainstorming: normalize script README guidance and reference the installed skill by name

## [1.10.3] - 2026-05-24

### Changed
- tdk-load-project-context: description updated, tdk-specify-fast -> tdk-specify (supports --fast mode)
- tdk-validate-task-id: description updated, tdk-specify-fast -> tdk-specify (supports --fast mode)
- tdk-skill-guide: dropped /tdk-specify-fast from listed commands

## [1.10.2] - 2026-05-24

### Changed
- planning: drop deprecated /tdk-tasks references and tasks.md from plan directory structure
- planning output-standards: remove tasks.md from artifacts list and next-step guidance
- tdk-load-project-context: drop tdk-implement and tdk-tasks from caller list
- tdk-validate-task-id: drop tdk-implement and tdk-tasks from caller list

## [1.10.1] - 2026-05-17

### Changed
- Updated researcher agent
