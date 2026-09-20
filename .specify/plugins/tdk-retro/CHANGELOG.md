# Changelog

All notable changes to this plugin will be documented in this file.

Format: [Keep a Changelog](https://keepachangelog.com/en/1.1.0/), Semver.

## [1.1.0] - 2026-09-20

### Changed
- tdk-retro-collect reads the **union** of `{FEATURE_DIR}/sessions.jsonl` and legacy `{FEATURE_DIR}/sessions.txt`, never either/or: a session recorded before the JSONL cutover exists only in the legacy file, which is read and never written
- Dedup is by session ID with JSONL metadata winning; ordering is JSONL records in file order (append order = first-association order), then legacy IDs in file order, and only then the existing cap of 10
- Only the extracted `.session` value is passed to `langfuse … --session-id`, never a raw JSONL line
- Skip-reason literals are union-aware: `no session file (sessions.jsonl or sessions.txt) for {FEATURE_DIR}` and `session file present but no usable session id` replace `sessions.txt missing` / `sessions.txt empty`

### Added
- Reverse-trace `jq` recipes in `references/langfuse-trace-analysis.md`, all guarded with `fromjson? // empty` so one corrupt byte cannot abort a retro run, and with `// "-"` placeholders because `host`/`user` are absent under `TDK_SESSION_IDENTITY=hashed`

## [1.0.6] - 2026-08-08

### Changed
- signal-target-routing.md (T5) updated to reference delegate-routing.md

## [1.0.5] - 2026-07-17

### Changed
- tdk-retro-collect: collect final red-team reports while excluding temporary recovery logs and parse-failure replies from retrospective evidence

## [1.0.4] - 2026-07-06

### Changed
- tdk-retro-collect: read test-mode phase evidence from canonical phase files instead of legacy ut/plan.md.
- retro feedback schema: record test execution evidence from phases/phase-*.md outputs.

## [1.0.3] - 2026-07-02

### Changed
- Update consumer-skill-discovery.md to document consumer skill suffix conventions (*-ut, *-test) and clean up stale guide references

## [1.0.2] - 2026-06-28

### Changed
- _shared: point consumer skill discovery suffix convention at docs/en/guides/migration-ut-rule-to-skill.md

## [1.0.1] - 2026-06-27

### Changed
- Refactored consumer-skill-discovery.md shared docs.

## [1.0.0] - 2026-06-15

### Added
- Add .claude-plugin/interface.json interface definition

### Removed
- Move .codex-plugin/plugin.json to codex-plugins registry

## [0.1.1] - 2026-06-13

### Changed
- Refactored project-root resolution in _shared/script-command-contract.md: replaced env-var/git discovery with explicit agent-provided argument
- tdk-retro-collect: updated bash snippets for agent-arg project root
- tdk-retro-apply, tdk-retro-propose: updated per contract change

## [0.1.0] - 2026-06-01

### Added
- tdk-retro-collect: collect evidence-backed retro feedback from reviews, phase drift, UT results, Langfuse traces, and user feedback
- tdk-retro-propose: convert active feedback signals into reviewable technical or memory learning deltas
- tdk-retro-apply: apply user-approved technical deltas and delegate memory updates through /tdk-memory-update
- _shared: add retro feedback, learning delta, script command, skill discovery, and signal routing contracts
- README: document retro plugin skills, artifacts, flow, and path resolution rules
