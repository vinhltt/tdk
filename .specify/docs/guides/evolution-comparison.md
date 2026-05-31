# Tihon — CommonDragon vs Predecessors

> **Purpose**: Deep-dive comparison for developers evaluating CommonDragon Tihon.
> For a quick glance, see the [Evolution table](command-reference.md#evolution) in the command guide.

Three generations of the Tihon framework, each targeting a different AI platform:

- **speckit-original** — 9 commands¹, GitHub Copilot, core workflow only
- **speckit-tdk-jp** — 18 commands, GitHub Copilot, full dev cycle (hardcoded to one project)
- **CommonDragon** — 36 commands, Claude Code CLI, multi-workspace, no external deps

---

## Quick Comparison

| Dimension | speckit-original | speckit-tdk-jp | CommonDragon |
|-----------|-----------------|----------------|--------------|
| Commands | 9¹ | 18 | **36** |
| Platform | Agent templates | GitHub Copilot | **Claude Code CLI** |
| UT Framework | -- | -- | **3 commands** |
| Sub-workspace | -- | -- | **Isolation support** |
| Config mgmt | -- | -- | **diff/sync/index** |
| Skills system | -- | -- | **10+ skills** |
| Language | English | Japanese | **English** |

---

## Detailed Feature Breakdown

| Dimension | speckit-original | speckit-tdk-jp | CommonDragon |
|-----------|:-:|:-:|:-:|
| **Platform** | | | |
| Runtime | Agent templates | GitHub Copilot + bash | **Claude Code CLI** |
| Language | English | Japanese | **English** |
| Command count | 9¹ | 18 | **36** |
| External dependencies | Git scripts | GitHub Copilot + bash | **None (MCP native)** |
| **Specification** | | | |
| Spec + brainstorm | ✓ | ✓ | ✓ |
| Fast/token-efficient mode | -- | -- | **✓ `specify --fast`** |
| Inline clarifying Q&A | Basic | ✓ (up to 5) | ✓ (up to 5) |
| Auto-requirements checklist | -- | -- | **✓ (generated with spec)** |
| **Planning & Architecture** | | | |
| Architecture principles source | ✓ (template) | ✓ (5 principles) | **✓ (8 principles, v2.1)** |
| Plan artifacts count | 1 | ~4 | **7+ files** |
| Plan ## Phases table | -- | -- | **✓ primary implementation SoT** |
| Onboarding guide generation | -- | ✓ | ✓ |
| HTML wireframe generation | -- | ✓ | ✓ |
| **Task Management** | | | |
| Phase grouping | -- | -- | **✓ P1/P2/P3** |
| Parallel task markers | -- | ✓ | ✓ |
| TDD-first task ordering | -- | ✓ | ✓ |
| Auto-completion tracking | -- | ✓ | ✓ |
| **Validation & Quality** | | | |
| Requirements gate | Advisory² | Advisory | **✓ Blocking gate** |
| Cross-artifact analysis | -- | Basic | **✓ Full consistency check** |
| UT skill-based conventions | -- | -- | **✓ per consumer skill** |
| **Git Workflow** | | | |
| Branch auto-creation | Enforced | Enforced | **❌ Removed — flexible** |
| Parallel spec development | ✗ | ✗ | **✓ Any branch strategy** |
| **Unit Testing** | | | |
| UT framework | -- | -- | **✓ 3 commands** |
| Framework-aware rules | -- | -- | **✓ Per sub-workspace** |
| UT pipeline automation | -- | -- | **✓ `ut:auto` (one command)** |
| **E2E Testing & Bugs** | | | |
| Test spec generation | -- | ✓ | ✓ |
| E2E execution engine | -- | ✓ | ✓ |
| **Change Management** | | | |
| Requirement changes | ✗ | Ad-hoc | **✓ Formal pipeline** |
| Impact analysis before apply | -- | -- | **✓ Cross-artifact report** |
| **Page Design** | | | |
| Screen spec generation | -- | ✓ | ✓ |
| Spec ↔ code sync | -- | ✓ | ✓ |
| Code review vs design | -- | ✓ | ✓ |
| Auto-fix review issues | -- | ✓ | ✓ |
| Progress visibility | -- | ✓ | ✓ |
| **Multi-Project / Workspace** | | | |
| Sub-workspace isolation | -- | -- | **✓ Init + list + flag** |
| Doc consistency check | -- | -- | **✓ `config:diff`** |
| Bidirectional doc sync | -- | -- | **✓ `config:sync`** |
| LLM-discoverable index | -- | -- | **✓ `config:index`** |
| **Infrastructure** | | | |
| AWS architecture design | -- | ✓ | ✓ |
| Architecture review checklist | -- | ✓ | ✓ |
| CloudFormation generation | -- | ✓ | ✓ |
| **Extensibility** | | | |
| Skills ecosystem | -- | -- | **✓ 10+ skills** |
| MCP native integration | -- | -- | **✓ Playwright, Context7...** |
| No subscription required | Depends | ✗ (Copilot) | **✓** |

---

## Core Command Upgrades

Commands present in predecessors, upgraded in CommonDragon (11 total):

| Command | Predecessor | CommonDragon Upgrade |
|---------|-------------|----------------------|
| `/tdk-specify` | Spec + brainstorm | **+ auto `checklists/requirements.md` generation** |
| `/tdk-clarify` | Up to 5 Q&A | **Deeper integration with spec.md structure** |
| `/tdk-constitution` | Template (orig) / 5 principles (jp) | **8 principles, v2.1 governance, amendment versioning** |
| `/tdk-plan` | plan + research + constitution + quickstart + wireframes | **+ YAML contracts, enhanced quickstart & wireframe generation, ## Phases table SoT** |
| `/tdk-analyze` | Basic quality check | **+ Full cross-artifact consistency, gap detection, coverage scoring** |
| `/tdk-checklist` | Quality testing (orig only)² | **+ Gate mode: blocks implementation until items resolved** |

---

## New Commands in CommonDragon

Commands not present in any predecessor (15 total):

| Command | Category | Value |
|---------|----------|-------|
| `/tdk-specify --fast` | Specification | **Token-efficient fast mode**, skips brainstorm |
| `/tdk-status` | Workflow | **Project/feature status overview** |
| `/tdk-ut-backfill-plan` | Unit Testing | **Framework-aware test plan** with phase files |
| consumer test skill routing | Unit Testing | **Code generation and execution via `plan-skill-routing.md`** |
| `/tdk-config-diff` | Config Mgmt | **Compare** workspace vs sub-workspace docs |
| `/tdk-config-sync` | Config Mgmt | **Bidirectional sync** with dry-run |
| `/tdk-config-index` | Config Mgmt | **LLM-discoverable** doc index |
| `/tdk-sub-workspace-init` | Workspace | **Multi-project isolation** |
| `/tdk-sub-workspace-list` | Workspace | **Workspace inventory** |
| `/tdk-batch-design` | Design | **Batch processing design** for approval |
| `/tdk-test-viewpoint` | Testing | **High-level test viewpoints** (観点) from spec |
| `/tdk-implement-from-plan` | Implementation | **Primary path: lightweight implement** from plan.md ## Phases, no tasks.md required |

---

## Validation Gates

| Gate | speckit-original | speckit-tdk-jp | CommonDragon |
|------|:----------------:|:--------------:|:------------:|
| `/tdk-checklist` | Advisory² | -- | **Blocks implementation until approved** |
| `/tdk-analyze` | -- | Basic | **Full cross-artifact: spec↔plan↔tasks** |

---

## Design Decisions

### Flexible Branch Strategy

speckit-original and speckit-tdk-jp auto-created a feature branch per spec (e.g., `feature/feat-001`), forcing linear development. CommonDragon **removed** this constraint — teams apply their own strategy (trunk-based, gitflow, GitHub flow). `--sub-workspace` handles logical isolation at the docs level without requiring git isolation.

### Plan.md ## Phases as Primary SoT

CommonDragon elevates the `plan.md` file's `## Phases` table as the primary source of truth for implementation. This reduces artifact overhead while maintaining phase-based organization.

### Validation-First

Two-layer validation gates ensure quality before proceeding: `/tdk-checklist` blocks implementation until resolved → `/tdk-analyze` checks cross-artifact consistency. UT conventions are defined in consumer `.claude/skills/{name}/SKILL.md` files and routed through `{docs.path}/custom-workflow/plan-skill-routing.md`. Every phase has a quality gate, not just a final review.

### Native Integration > Scripted Workarounds

speckit-tdk-jp used Playwright MCP but wrapped in bash scripts routed through GitHub Copilot. CommonDragon runs Playwright MCP natively within Claude Code — no bash wrapper, no Copilot intermediary, cross-platform (Windows/Mac/Linux), runs in the AI context directly.

### Artifact Chain

Full traceable chain: requirements → checklist → spec → plan (7+ files with ## Phases table) → optional tasks (legacy) → implementation → UT → review → E2E → bugs. Every output is the input of the next phase, ensuring nothing is lost or disconnected.

### Token-Efficient Variants

`/tdk-specify --fast` provides a lightweight path for small, well-understood features — skips brainstorm phase, produces fewer tokens. Without `--fast`, auto-detect picks the mode based on description complexity and Impact Surface (defaults to full brainstorm).

---

> **See also**: [Tihon Command Guide](command-reference.md) — full command reference, cheat sheet, and scenarios.

---

*¹ speckit-original command list inferred from codebase analysis; no official documentation exists for the original framework.*

*² speckit-original had `speckit.checklist` for requirements quality testing. Dropped in speckit-tdk-jp, reintroduced as blocking gate in CommonDragon.*
