# TDK - TiHon Development Kit

**TDK (TiHon Development Kit)** is a specification-driven coding workflow toolkit for Claude Code. It generates specs, plans, tasks, and code from natural language — shipped as a set of marketplace plugins + a TypeScript CLI.

Core philosophy: **SDD (Specification-Driven Development)** — every feature starts from a formal spec, flows through structured plans and tasks, and is verified against the spec before shipping.

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

Install Claude harness artifacts explicitly after the substrate sync:

```bash
cd .specify/scripts/ts
bun src/index.ts harness install --harness claude --plugins tdk-core --dry-run
bun src/index.ts harness install --harness claude --plugins tdk-core --yes
```

Omit `--plugins` to select plugins interactively with Space and Enter. Existing unmanaged `.claude/` files require explicit interactive overwrite approval; `--yes` does not approve those overwrites.

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
│   ├── tdk-core/            # Core workflow (17 skills)
│   ├── tdk-utils/           # Utilities: scout, research, problem solving (14 skills)
│   ├── tdk-memory/          # Domain memory management (6 skills)
│   └── tdk-test-api/        # API test generation (3 skills)
├── templates/            # 33 templates (spec, plan, task, test, memory, output, design, docs)
├── docs/                 # 26 user guides (12 scenario guides + setup guides + reference)
├── configurations/       # Hook configs, sub-workspace configs
└── scripts/
    ├── ts/               # TypeScript CLI (@tdk/tdk) — primary
    │   ├── src/
    │   │   ├── index.ts         # Unified CLI entry
    │   │   ├── commands/        # 8 command groups + standalone scripts
    │   │   ├── lib/             # Library modules (parsers, generators)
    │   │   └── utils/           # Zod schemas, shared utilities
    │   └── tests/               # Bun test suite (30+ test files)
    ├── bash/             # Legacy shell scripts (maintenance-only)
    └── python/           # Legacy Python utilities (maintenance-only)
```

## Plugins

| Plugin | Skills | Purpose |
|--------|--------|---------|
| **tdk-core** | 17 | Specify, plan, implement, fix, config, sub-workspace, ut-backfill |
| **tdk-utils** | 14 | Scout, research, brainstorming, docs-seeker, context-engineering, problem-solving |
| **tdk-memory** | 6 | Domain memory: init, update, checksum, changelog, query, preload |
| **tdk-test-api** | 3 | Test plan, testcase generation, Playwright code gen |

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
| `tdk harness install` | Install selected TDK plugin artifacts into `.claude/` with dry-run, ownership, collision, drift, and hook safety |
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
