# Changelog

All notable changes to this plugin will be documented in this file.

Format: [Keep a Changelog](https://keepachangelog.com/en/1.1.0/), Semver.

## [2.0.0] - 2026-05-17

### Changed
- Port all skill environment scripts from Bash to TypeScript (Bun runtime)
- Updated SKILL.md execution steps to reference `bun .specify/scripts/ts/src/commands/test-api/*.ts` instead of shell scripts

### Removed
- `run.sh` from all 3 skills (`tdk-test-api-plan`, `tdk-test-api-generate-testcase`, `tdk-test-api-gen-code-playwright-ts`) — replaced by TypeScript equivalents
