# TDK - TiHon Development Kit

**TDK (TiHon Development Kit)** is a specification-driven coding workflow toolkit for Claude Code with generated Codex harness support. It generates specs, portable task breakdowns, plans, and code from natural language — shipped as a set of marketplace plugins + a TypeScript CLI.

Core philosophy: **SDD (Specification-Driven Development)** — every feature starts from a formal spec, can produce portable work items, flows through structured plans, and is verified against the spec before shipping.

## Workflow Overview

TDK works as a closed development loop:

- **Build**: turn intent into specs, plans, implementation phases, tests, and status.
- **Learn**: collect evidence after implementation, propose reviewable deltas, and apply only approved learnings.
- **Compound**: approved learnings improve the next TDK session instead of staying as one-off feedback.

![TDK lifecycle workflow](assets/tdk-lifecycle-share-graph.svg)

## What It Does

TDK structures the full development loop:

1. **Start** — classify greenfield or brownfield repo shape and recommend the safe workflow path (`/tdk-greenfield-start`, `/tdk-brownfield-start`)
2. **Advise** — optionally produce project-level architecture options, decisions, or recovery reports without topology/config writes (`/tdk-architecture-advisor`)
3. **Map** — optionally produce workspace topology proposal markdown and JSON without runtime config writes (`/tdk-boundary-map`)
4. **Guide boundaries** — optionally turn approved topology into module boundary policy and non-applied snippets (`/tdk-module-boundary-policy`)
5. **Discover** — optionally create epic-only context before spec (`/tdk-discovery`)
6. **Specify** — generate feature specs from natural language and optional discovery refs (`/tdk:specify`)
7. **Clarify** — resolve unresolved questions before planning (`/tdk-clarify`)
8. **Design** — optionally produce approval-level HLD artifacts after clarify for greenfield work (`/tdk-high-level-design`)
9. **Break down** — optionally turn clarified spec/HLD context into portable Markdown work items (`/tdk-task-breakdown`)
10. **Plan** — break specs into phased implementation plans (`/tdk:plan`)
11. **Implement** — execute plans with guided phase tracking (`/tdk-implement`)
12. **Verify** — plan and route unit-test work through consumer test skills (`/tdk-ut-backfill-plan`)
13. **Track** — status dashboards, checklists, progress sync (`/tdk-status`)

Additional workflows: constitution-owned `product-context.md`, topology proposal and dry-run workspace config previews, config management, sub-workspace docs generation, scout (codebase analysis), memory management, API test generation.

Authority boundaries: discovery is context-only and does not mint requirement IDs; `spec.md` owns `UR-*`/`FR-*`/`SC-*`; HLD enriches existing IDs and is not a second requirement source.

## Quick Start

### Prerequisites

- [Bun](https://bun.sh) runtime
- [Claude Code](https://claude.ai/code) CLI

### Install into a Consumer Project

```bash
# From the consumer project root after TDK .specify/ is present:
bash .specify/setup.sh
```

This bootstraps prerequisites, installs TypeScript dependencies, runs setup checks, and registers TDK plugin metadata from the consumer project's `.specify/` directory.

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

Underscore-prefixed shared skill directories such as `_shared` are copied as reference assets, but their `SKILL.md` entrypoint is not installed as a loadable Codex skill.

`convert-flat` leaves the source `.claude/` tree untouched, reports unknown entries as skipped, and writes Codex ownership state to `.specify/state/harness-install/codex.json`. Use `--force` to overwrite conflicts on unowned or user-edited `.codex/` targets.

Omit `--plugins` and `--all-plugins` to select plugins interactively with Space and Enter.

Existing unmanaged `.claude/` files require explicit interactive overwrite approval; `--yes` does not approve those overwrites.

Claude hook runtime entries are merged into `.claude/settings.json`. Hook scripts are installed under plugin-scoped paths like `.claude/hooks/tdk-core/`; plugin `hooks/hooks.json` files stay source declarations and are not installed as `.claude/hooks/hooks.json`.

Claude and Codex harness installs are separate runs. A combined Claude+Codex install is unsupported.

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
│   ├── tdk-core/            # Core workflow (23 skills + 1 agent)
│   ├── tdk-utils/           # Utilities: scout, research, boundary policy, problem solving (15 skills + 5 agents)
│   ├── tdk-memory/          # Domain memory management (5 skills + 1 agent)
│   ├── tdk-test-api/        # API test generation (3 skills)
│   ├── tdk-retro/           # Retrospective learning loop (4 skills)
│   └── tdk-scaffold/        # Skill/agent scaffolding (2 skills)
├── codex-plugins/        # Generated Codex packages (6 packages; skills/hooks/lib at package root)
├── templates/            # 41 templates (spec, plan, task, discovery, HLD, test, memory, output, design, docs)
├── docs/                 # 26 user guides (scenario guides + setup guides + reference)
├── configurations/       # Hook configs, sub-workspace configs
└── scripts/
    ├── ts/               # TypeScript CLI (@tdk/tdk) — primary
    │   ├── src/
    │   │   ├── index.ts         # Unified CLI entry
    │   │   ├── commands/        # Integrated command groups + standalone scripts
    │   │   ├── lib/             # Library modules (parsers, generators)
    │   │   └── utils/           # Zod schemas, shared utilities
    │   └── tests/               # Bun test suite (97 .test.ts files)
    └── bash/             # Legacy shell scripts (maintenance-only)
```

## Plugins

| Plugin | Skills | Purpose |
|--------|--------|---------|
| **tdk-core** | 23 skills + 1 agent | Greenfield/brownfield start, architecture advisor, boundary map, topology apply, constitution, discovery, specify, clarify, HLD, task breakdown, plan, implement, config, sub-workspace, ut-backfill |
| **tdk-utils** | 15 skills + 5 agents | Scout, research, module boundary policy, brainstorming, docs-seeker, context-engineering, problem-solving |
| **tdk-memory** | 5 skills + 1 agent | Domain memory: init, update, checksum, changelog, query, and tdk-memory-agent |
| **tdk-test-api** | 3 | Test plan, testcase generation, Playwright code gen |
| **tdk-retro** | 4 | Retrospective feedback collection, learning proposal, and approved-delta application |
| **tdk-scaffold** | 2 | Skill/agent scaffolding from approved automation recommendations |

## CLI Commands

Integrated commands (via `bun src/index.ts`; no installed `tdk` binary yet):

| Command | Description |
|---------|-------------|
| `bun src/index.ts config detect` | Detect `.specify.json` configuration |
| `bun src/index.ts config index` | Index configuration files |
| `bun src/index.ts config diff` | Compare docs between workspace and sub-workspace |
| `bun src/index.ts config topology apply --dry-run` | Preview `.specify/.specify.json` changes and emit `planHash`; apply with `--yes --expect-hash <planHash>` |
| `bun src/index.ts ut backfill auto` | Automated unit test backfill |
| `bun src/index.ts ut backfill plan` | Plan unit test coverage |
| `bun src/index.ts ut backfill impl` | Implement unit tests from plan |
| `bun src/index.ts scout` | Codebase analysis (repomix + tier-1 extraction) |
| `bun src/index.ts harness install` | Install selected TDK plugin artifacts into `.claude/` or preconverted `.codex/` + `.agents/skills/` targets with dry-run, saved install settings, prefix rewrite, ownership, collision, and drift safety |
| `bun src/index.ts harness convert` | Maintainer-only command that emits generated Codex packages under `.specify/codex-plugins/<plugin>/` and checks converter freshness |
| `bun src/index.ts harness convert-flat` | Convert an existing flat `.claude/` tree into additive `.codex/` and `.agents/skills/` artifacts with dry-run, conflict reporting, and `.specify/state/harness-install/codex.json` ownership manifest |
| `bun src/index.ts sub-workspace docs` | Generate sub-workspace documentation |

Standalone scripts (via `bun src/commands/<path>.ts`): manifest, feature, setup, changelog, util, test-api.

## Tech Stack

- **Runtime:** Bun
- **Language:** TypeScript (strict mode, `noUncheckedIndexedAccess`)
- **CLI:** Commander.js
- **Validation:** Zod schemas for config/data, Commander for CLI args
- **Testing:** Bun test runner (TDD-first)
- **Config format:** `.specify.json`

## Documentation

- [Command Reference](.specify/docs/en/command-reference.md) — full CLI documentation
- [Scenario Guides](.specify/docs/en/scenarios/) — 12 workflow scenarios
- [Setup Guide](.specify/docs/en/setup/speckit-setup-guide.md) — installation and configuration
- [UT Backfill Usage](.specify/docs/en/tdk-ut-backfill-skills-usage.md) — unit test workflow
- [Document Flow](.specify/docs/en/document-flow.md) — spec → plan → task lifecycle
