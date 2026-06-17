# TDK - TiHon Development Kit

**TDK (TiHon Development Kit)** is a specification-driven coding workflow toolkit for Claude Code. It generates specs, plans, tasks, and code from natural language — shipped as a set of marketplace plugins + a TypeScript CLI.

Core philosophy: **SDD (Specification-Driven Development)** — every feature starts from a formal spec, flows through structured plans and tasks, and is verified against the spec before shipping.

## Workflow Overview

TDK works as a closed development loop:

- **Build**: turn intent into specs, plans, implementation phases, tests, and status.
- **Learn**: collect evidence after implementation, propose reviewable deltas, and apply only approved learnings.
- **Compound**: approved learnings improve the next TDK session instead of staying as one-off feedback.

![TDK lifecycle workflow](assets/tdk-lifecycle-share-graph.svg)

## What It Does

TDK structures the full development loop:

1. **Specify** — generate feature specs from natural language (`/tdk:specify`)
2. **Plan** — break specs into phased implementation plans (`/tdk:plan`)
3. **Implement** — execute plans with guided task tracking (`/tdk-implement`)
4. **Verify** — auto-backfill unit tests, check rules, validate coverage (`/tdk:ut-backfill-auto`)
5. **Track** — status dashboards, checklists, progress sync (`/tdk:status`, `/tdk:tasks`)

Additional workflows: config management, sub-workspace docs generation, scout (codebase analysis), memory management, API test generation.

## Quick Start

### Prerequisites

- [Bun](https://bun.sh) runtime
- [Claude Code](https://claude.ai/code) CLI

### Install into a Consumer Project

```bash
# From the consumer project root:
bash /path/to/tdk/setup.sh
```

This installs TDK's marketplace plugins, templates, and configurations into the consumer project's `.specify/` directory.

Install harness artifacts explicitly after the substrate sync from the consumer project root:

```bash
# Install one plugin
bun .specify/scripts/ts/src/index.ts harness install --harness claude --plugins tdk-core --dry-run
bun .specify/scripts/ts/src/index.ts harness install --harness claude --plugins tdk-core --yes

# Install multiple plugins
bun .specify/scripts/ts/src/index.ts harness install --harness claude --plugins tdk-core,tdk-memory --dry-run
bun .specify/scripts/ts/src/index.ts harness install --harness claude --plugins tdk-core,tdk-memory --yes

# Install every plugin listed in .specify/plugins/manifest.json
bun .specify/scripts/ts/src/index.ts harness install --harness claude --all-plugins --dry-run
bun .specify/scripts/ts/src/index.ts harness install --harness claude --all-plugins --yes

# Install preconverted Codex artifacts
bun .specify/scripts/ts/src/index.ts harness install --harness codex --plugins tdk-core --dry-run
bun .specify/scripts/ts/src/index.ts harness install --harness codex --plugins tdk-core --yes
bun .specify/scripts/ts/src/index.ts harness install --harness codex --all-plugins --dry-run

# Select plugins interactively
bun .specify/scripts/ts/src/index.ts harness install --harness claude

# Maintainers: regenerate generated Codex packages under .specify/codex-plugins/
bun .specify/scripts/ts/src/index.ts harness convert --dry-run
bun .specify/scripts/ts/src/index.ts harness convert
bun .specify/scripts/ts/src/index.ts harness convert --check

# Migrate an existing flat .claude/ tree to Codex artifacts
bun .specify/scripts/ts/src/index.ts harness convert-flat --dry-run
bun .specify/scripts/ts/src/index.ts harness convert-flat --yes
```

`harness convert` is source-tree/maintainer-only. It emits generated Codex packages to `.specify/codex-plugins/<plugin>/` following the official OpenAI layout (only `.codex-plugin/plugin.json` inside `.codex-plugin/`; `skills/`, `hooks/`, `lib/` at the package root) from plugin source trees; `--check` re-emits in memory and fails if the committed packages drift from source.

`harness install --harness codex` reads the generated packages from `.specify/codex-plugins/` and verifies them against `.specify/codex-plugins/manifest.json`, writes skills to `.agents/skills/` and hooks/lib to `.codex/`, generates `.codex/agents/*.toml` and `.codex/config.toml` at install time from plugin source agents, merges `.codex/hooks.json`, and writes Codex ownership state to `.specify/state/harness-install/codex.json`.

`convert-flat` leaves the source `.claude/` tree untouched, reports unknown entries as skipped, and writes Codex ownership state to `.specify/state/harness-install/codex.json`. Use `--force` to overwrite conflicts on unowned or user-edited `.codex/` targets.

Omit `--plugins` and `--all-plugins` to select plugins interactively with Space and Enter.

Existing unmanaged `.claude/` files require explicit interactive overwrite approval; `--yes` does not approve those overwrites.

Claude hook runtime entries are merged into `.claude/settings.json`. Hook scripts are installed under plugin-scoped paths like `.claude/hooks/tdk-core/`; plugin `hooks/hooks.json` files stay source declarations and are not installed as `.claude/hooks/hooks.json`.

### CLI Usage (Development)

```bash
cd .specify/scripts/ts

# Run integrated CLI
bun src/index.ts --help

# Run individual commands
bun src/commands/detect-config.ts
bun src/commands/manifest/compute.ts --root ../..
```

## Architecture

```
.specify/
├── plugins/              # Marketplace plugins (installed by setup.sh)
│   ├── tdk-core/            # Core workflow (15 skills + 1 agent)
│   ├── tdk-utils/           # Utilities: scout, research, problem solving (14 skills + 5 agents)
│   ├── tdk-memory/          # Domain memory management (5 skills + 1 agent)
│   ├── tdk-test-api/        # API test generation (3 skills)
│   ├── tdk-retro/           # Retrospective learning loop (4 skills)
│   └── tdk-scaffold/        # Skill/agent scaffolding (2 skills)
├── templates/            # 34 templates (spec, plan, task, test, memory, output, design, docs)
├── docs/                 # 25 user guides (12 scenario guides + setup guides + reference)
├── configurations/       # Hook configs, sub-workspace configs
└── scripts/
    ├── ts/               # TypeScript CLI (@tdk/tdk) — primary
    │   ├── src/
    │   │   ├── index.ts         # Unified CLI entry
    │   │   ├── commands/        # 8 command groups + standalone scripts
    │   │   ├── lib/             # Library modules (parsers, generators)
    │   │   └── utils/           # Zod schemas, shared utilities
    │   └── tests/               # Bun test suite (89 .test.ts files)
    ├── bash/             # Legacy shell scripts (maintenance-only)
    └── python/           # Legacy Python utilities (maintenance-only)
```

## Plugins

| Plugin | Skills | Purpose |
|--------|--------|---------|
| **tdk-core** | 15 skills + 1 agent | Specify, plan, implement, fix, config, sub-workspace, ut-backfill |
| **tdk-utils** | 14 skills + 5 agents | Scout, research, brainstorming, docs-seeker, context-engineering, problem-solving |
| **tdk-memory** | 5 skills + 1 agent | Domain memory: init, update, checksum, changelog, query, and tdk-memory-agent |
| **tdk-test-api** | 3 | Test plan, testcase generation, Playwright code gen |
| **tdk-retro** | 4 | Retrospective feedback collection, learning proposal, and approved-delta application |
| **tdk-scaffold** | 2 | Skill/agent scaffolding from approved automation recommendations |

## CLI Commands

Integrated commands (via `bun src/index.ts`):

| Command | Description |
|---------|-------------|
| `tdk config detect` | Detect `.specify.json` configuration |
| `tdk config index` | Index configuration files |
| `tdk config diff` | Compare docs between workspace and sub-workspace |
| `tdk ut auto` | Automated unit test backfill |
| `tdk ut plan` | Plan unit test coverage |
| `tdk ut impl` | Implement unit tests from plan |
| `tdk ut check-rules` | Validate UT rules |
| `tdk ut create-rules` | Generate UT rules |
| `tdk scout` | Codebase analysis (repomix + tier-1 extraction) |
| `tdk harness install` | Install selected TDK plugin artifacts into `.claude/` or preconverted `.codex/` + `.agents/skills/` targets with dry-run, saved install settings, prefix rewrite, ownership, collision, and drift safety |
| `tdk harness convert` | Maintainer-only command that emits generated Codex packages under `.specify/codex-plugins/<plugin>/` and checks converter freshness |
| `tdk harness convert-flat` | Convert an existing flat `.claude/` tree into additive `.codex/` and `.agents/skills/` artifacts with dry-run, conflict reporting, and `.specify/state/harness-install/codex.json` ownership manifest |
| `tdk sub-workspace docs` | Generate sub-workspace documentation |

Standalone scripts (via `bun src/commands/<path>.ts`): manifest, feature, setup, changelog, util, test-api.

## Tech Stack

- **Runtime:** Bun
- **Language:** TypeScript (strict mode, `noUncheckedIndexedAccess`)
- **CLI:** Commander.js
- **Validation:** Zod schemas for config/data, Commander for CLI args
- **Testing:** Bun test runner (TDD-first)
- **Config format:** `.specify.json`

## Documentation

- [Command Reference](.specify/docs/guides/command-reference.md) — full CLI documentation
- [Scenario Guides](.specify/docs/guides/scenarios/) — 12 workflow scenarios
- [Setup Guide](.specify/docs/setup/speckit-setup-guide.md) — installation and configuration
- [UT Backfill Usage](.specify/docs/guides/tdk-ut-backfill-skills-usage.md) — unit test workflow
- [Document Flow](.specify/docs/guides/document-flow.md) — spec → plan → task lifecycle
