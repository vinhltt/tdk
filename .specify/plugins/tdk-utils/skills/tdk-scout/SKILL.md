---
name: tdk-scout
description: "Codebase navigation skill (S4 hierarchical 2-tier). Pre-process a repomix pack via deterministic TS Tier 1 parser, then dispatch the tdk-scout-runner agent (Tier 2) to produce a markdown navigation report (sampled files + directory boundaries/dependencies + unresolved questions). Use for understanding unfamiliar codebases, locating task-relevant files, or pre-processing for downstream skills like tdk-sub-workspace-docs and tdk-workspace-layout-propose --from-existing."
user-invocable: true
argument-hint: "[--scope DIR | --from-pack FILE] [--task-hint STR] [--sample-budget N] [--output PATH] [--force-refresh] [--include GLOBS] [--ignore GLOBS]"
metadata:
  version: "4.3.1"
  author: "VinhLTT"
  category: utility
---

# tdk-scout

Self-contained codebase navigation skill. Trade-off: regex-based Tier 1 (no LLM) gives deterministic structural extraction; Tier 2 (haiku agent) reads ~10 sampled files to compose human-readable descriptions. Keep full structural coverage separate from sampled source coverage.

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

## Scope size and artifact modes

Keep scopes task-focused, but do not reject a scope merely for exceeding **800 files**. Tier 1 version **2** writes one JSON artifact in either mode:

- **Per-file (≤800 files):** retain the complete `files[]`, `tree`, and `unparsed[]`.
- **Aggregated (>800 files):** replace the full file listing with full-scope directory `aggregated[]` summaries plus representative `files[]` only. Preserve full `totalFiles`, `totalLoc`, and `totalTokens`; never interpret representative length as scope size. Coarsen directory depth until the complete compact artifact fits **50,000 UTF-8 bytes**, not 50K tokens. Do not drop groups, counts, or dependency edges to fit.

The representative list is capped at **50 files**, may shrink further to fit the measured byte budget, and is independent of `--sample-budget` (still the maximum **1–50 source-file reads**). Keep at least one representative per group; coarsen directory depth if the groups would exceed the available representative capacity, rather than dropping groups or leaving them without drill-down files. Downsampling reads cannot make a metadata artifact smaller. If even the coarsest directory view plus representatives cannot fit, surface the CLI's actionable error and narrow with `--scope`, `--include`, or `--ignore`.

A separate approximate stderr warning for packs above ~1 MB is advisory, not a file-count rejection.

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

   Read the version-2 Tier 1 JSON, detect per-file or aggregated mode, rank files or directories accordingly, sample only files[].path within budget, and Write the shared navigation report to output_path.
   ```

6. **Verify output.** After the agent returns, check `outputPath` exists. `Read` the first ~30 lines and surface to the user as a preview. Surface an explicit error report as failure, not successful navigation. Return the absolute `outputPath`.

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

- Markdown report at `<outputPath>` (default: `.specify/cache/tdk-scout/<scope>.md`). Keep `Relevant Files` and `Unresolved Questions`, and add mode/version, full-scope totals, attempted/successful read counts, `Directory Summary`, and directed `Directory Dependencies`. Mark unsampled/coarsened groups and parser/import gaps so layout `--from-existing` can distinguish observed boundaries from inferred ownership or desired-state proposals.
- One versioned Tier 1 JSON cache at `.specify/cache/tdk-scout/<scope>-tier1.json` (regenerable; reusable by other skills). Preserve the CLI envelope fields shown in Step 4; mode metadata belongs in the artifact, not a replacement envelope.

### Tier 1 artifact contract

Require `tier1Version: 2` in both shapes, plus common `scope`, `totalFiles`, `totalLoc`, `totalTokens`, `tier1GeneratedAt`, `files[]`, `tree`, and `unparsed[]`. Each `files[]` entry retains `{path, loc, tokens, imports, exports, symbols}`.

For per-file mode, `aggregated` is absent and `files[]` covers the full scope. For aggregated mode, require:

```json
{
  "tier1Version": 2,
  "aggregationDepth": 1,
  "unparsedCount": 12,
  "aggregated": [
    {
      "path": "src",
      "fileCount": 900,
      "totalLoc": 18000,
      "totalTokens": 72000,
      "entryPoints": ["src/index.ts"],
      "imports": [{"path": "lib", "fileCount": 25}]
    },
    {
      "path": "lib",
      "fileCount": 100,
      "totalLoc": 2000,
      "totalTokens": 8000,
      "entryPoints": ["lib/index.ts"],
      "imports": []
    }
  ]
}
```

The example shows only aggregated-specific fields; include all common fields in the actual artifact. Summaries partition the complete scope, and their counts/LOC/tokens sum to the top-level totals. At depth 0, `.` covers all files; at higher depths, group by the first `min(depth, parent-directory-component count)` components, using `.` for root files. Coarser groups are observed directory summaries, not proof of deeper module/package boundaries.

An import row under `src` targeting `lib` means **src → lib**: 25 distinct source files import resolved internal files in the target group. Count a source file once per target group, not once per import statement. Include only resolved cross-group internal edges; absent edges do not establish independence, and unresolved aliases/dynamic imports remain gaps.

In aggregated mode, `files[]` is the sole source-read allowlist and contains representatives only. `entryPoints[]` lists up to three selected representative navigation anchors per group, preferring entry-point filenames and falling back to other original files. These are not exhaustive runtime entry points, and every declared anchor must exist in `files[]`. Never read a path absent from `files[]`, and distinguish allowlisted representatives from the files actually read within `sample_budget`. `unparsed[]` is the representative failure subset, while `unparsedCount` counts parser failures across the complete scope. Do not reconstruct or claim full sampled coverage from these subsets.

## Failure modes

| Condition | What happens |
|---|---|
| `repomix` not installed (scope mode) | TS CLI exits non-zero with install hint; surface to user. |
| Pack file missing (from-pack mode) | TS CLI exits non-zero. |
| Both `--scope` and `--from-pack` set | TS CLI exits non-zero (`mutually exclusive`). |
| `--include`/`--ignore` used with `--from-pack` | TS CLI exits non-zero; re-pack with `--scope` instead. |
| Scope larger than 800 files | Continue with the version-2 aggregated directory view and representative files; retain full-scope totals. |
| Aggregated artifact cannot fit 50,000 UTF-8 bytes | TS CLI exits non-zero with a narrowing hint; do not dispatch Tier 2 or truncate structural coverage. |
| Pack larger than ~1 MB | Stderr warning only; mode selection uses the exact file count. |
| Missing/unsupported Tier 1 version or invalid shape | Runner writes an explicit 3-line error report at `outputPath`; surface as failure and rerun the CLI. |

## Notes

- This skill is glue. Scoring rules + parser internals live in the agent + Tier 1 TS modules — do not duplicate them here.
- Tier 1 cache requires both matching `tier1Version: 2` and a fresh mtime relative to the pack. Legacy/missing-version artifacts are regenerated even when timestamps look fresh. Use `--force-refresh` to override.
- `description` for downstream auto-routing intentionally mentions the 2-tier architecture so peer skills can decide whether they need full tdk-scout or just the Tier 1 JSON.
