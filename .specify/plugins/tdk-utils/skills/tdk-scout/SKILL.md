---
name: tdk-scout
description: "Codebase navigation skill (S4 hierarchical 2-tier). Pre-process a repomix pack via deterministic TS Tier 1 parser, then dispatch the tdk-scout-runner agent (Tier 2) to produce a markdown navigation report (file list + descriptions + unresolved questions). Use for understanding unfamiliar codebases, locating task-relevant files, or pre-processing for downstream skills like tdk-sub-workspace-docs."
user-invocable: true
argument-hint: "[--scope DIR | --from-pack FILE] [--task-hint STR] [--sample-budget N] [--output PATH] [--force-refresh] [--include GLOBS] [--ignore GLOBS]"
metadata:
  version: "3.0.3"
  author: "VinhLTT"
  category: utility
---

# tdk-scout

Self-contained codebase navigation skill. Trade-off: regex-based Tier 1 (no LLM) gives deterministic, cheap structural extraction; Tier 2 (haiku agent) reads ~10 sampled files to compose human-readable descriptions.

## When to use

- User wants to understand the structure of a repo or sub-workspace.
- Need to locate task-relevant files quickly without reading everything.
- A downstream skill (e.g. `tdk-sub-workspace-docs`) needs structured navigation data.

## Prerequisites

- `repomix` installed globally (`npm install -g repomix`) — only required for `--scope` mode.
- `bun` (or node) available; tdk TS CLI uses `bun src/index.ts`.

## Args

| Flag | Notes |
|---|---|
| `--scope <DIR>` | XOR with `--from-pack`. Run repomix on DIR. |
| `--from-pack <FILE>` | XOR with `--scope`. Reuse existing pack file. |
| `--task-hint <STR>` | Optional. Bias file scoring. Default: `"general codebase navigation"`. |
| `--sample-budget <N>` | Optional. Max files for Tier 2 to read. Default: `10`. Range: `1-50`. |
| `--output <PATH>` | Optional. Default: `.specify/cache/tdk-scout/<scope>.md`. |
| `--force-refresh` | Optional. Re-run Tier 1 even if cache fresh. |
| `--include <GLOBS>` | Optional, `--scope` mode only. Comma-separated globs; only matching files enter the pack. |
| `--ignore <GLOBS>` | Optional, `--scope` mode only. Comma-separated globs excluded from the pack. |

`--include`/`--ignore` are repomix glob patterns, passed through verbatim — TDK does not interpret or rewrite them, so repomix's glob semantics apply. Both are rejected with `--from-pack`: that pack is already built, so filtering it would change nothing; narrow with `--scope` instead.

## Size ceiling

One scout run covers at most **800 files**. The Tier 2 agent reads the whole Tier 1 JSON before it opens any file, so a bigger scope produces a report it cannot use. Past the ceiling the TS CLI exits non-zero and writes nothing — it does not degrade to a partial report. Split the work with `--scope <subdir>`, or narrow the pack with `--include`/`--ignore`.

The ceiling is a backstop against runaway repos, not a promise: reports well under 800 files can still be large, so keep the scope as tight as the task allows. A separate stderr warning fires for packs above ~1 MB; it is approximate and never stops the run on its own.

## Steps

1. **Locate project root.** Use `<agent-resolved-project-root>` from the active coding harness/session and `cd` there. Ask the user for the project root if it cannot be identified confidently. (Tier 1 cache lives under `.specify/cache/tdk-scout/` relative to root.)

2. **Validate args** locally for fast failure: at least one of `--scope`/`--from-pack`, not both. If invalid, surface error and stop.

3. **Run TS resolver.** Use `Bash`:
   ```bash
   bun .specify/scripts/ts/src/index.ts scout <flags>
   ```
   Capture full output. Stdout will end with one JSON line; stderr carries progress.

4. **Parse contract.** From stdout, take the LAST line and `JSON.parse` it:
   ```json
   {
     "packPath": "...",
     "tier1JsonPath": "...",
     "outputPath": "...",
     "taskHint": "...",
     "sampleBudget": 10,
     "cacheHit": false
   }
   ```
   On non-zero exit OR malformed JSON, surface stderr to the user and stop.

5. **Spawn tdk-scout-runner via Task tool.** Use `subagent_type: tdk-scout-runner` and pass the contract verbatim:
   ```
   Run the tdk-scout-runner agent.

   Contract:
   - tier1_json_path: <tier1JsonPath>
   - pack_path:       <packPath>
   - output_path:     <outputPath>
   - task_hint:       <taskHint>
   - sample_budget:   <sampleBudget>

   Read the Tier 1 JSON, score files, sample within budget, and Write the markdown report to output_path.
   ```

6. **Verify output.** After the agent returns, check `outputPath` exists. `Read` the first ~30 lines and surface to the user as a preview. Return the absolute `outputPath`.

## Examples

```
# Scout a sub-workspace with a task focus
/tdk-scout --scope apps/frontend --task-hint "find auth flow"

# Reuse a pack already produced by another skill
/tdk-scout --from-pack .specify/cache/tdk-docs/frontend.md \
           --output .specify/cache/tdk-scout/frontend-auth.md \
           --task-hint "auth"

# Whole repo with default budget
/tdk-scout --scope .

# Narrow a large repo to server-side TS, excluding tests and build output
/tdk-scout --scope . \
           --include "src/**/*.ts,*.md" \
           --ignore "**/*.test.ts,dist/**" \
           --task-hint "request pipeline"
```

## Output

- Markdown report at `<outputPath>` (default: `.specify/cache/tdk-scout/<scope>.md`).
- Tier 1 JSON cache at `.specify/cache/tdk-scout/<scope>-tier1.json` (regenerable; reusable by other skills).

## Failure modes

| Condition | What happens |
|---|---|
| `repomix` not installed (scope mode) | TS CLI exits non-zero with install hint; surface to user. |
| Pack file missing (from-pack mode) | TS CLI exits non-zero. |
| Both `--scope` and `--from-pack` set | TS CLI exits non-zero (`mutually exclusive`). |
| `--include`/`--ignore` used with `--from-pack` | TS CLI exits non-zero; re-pack with `--scope` instead. |
| Scope larger than 800 files | TS CLI exits non-zero before dispatching Tier 2; no report is written. Re-run with `--scope <subdir>`, or with `--include`/`--ignore` to pack a subset. |
| Pack larger than ~1 MB | Stderr warning only; the run continues to the exact file-count check. |
| Tier 2 agent malformed output | The runner agent self-writes a 3-line error report at `outputPath`; surface that to the user. |

## Notes

- This skill is glue. Scoring rules + parser internals live in the agent + Tier 1 TS modules — do not duplicate them here.
- Tier 1 cache is content-driven (mtime check); a fresh pack invalidates it automatically. Use `--force-refresh` to override.
- `description` for downstream auto-routing intentionally mentions the 2-tier architecture so peer skills can decide whether they need full tdk-scout or just the Tier 1 JSON.
