---
name: tdk-sub-workspace-docs
description: "Smart skill: init or update 4 codebase-derived doc files per sub-workspace (codebase-summary, code-standards, system-architecture, README). Pipes repomix pack + tdk-scout report into the tdk-docs-writer agent and writes results under <docsPath>/sub-workspaces/<name>/. Generates the codebase-analysis doc set per sub-workspace."
user-invocable: true
argument-hint: "[--sub-workspace NAME | --all] [--force]"
metadata:
  version: "4.0.1"
  author: "VinhLTT"
  category: docs
---

# tdk-sub-workspace-docs

Generate or refresh codebase-derived documentation for one or every configured sub-workspace. The skill auto-detects mode per target:

- **init** — target dir has none of the 4 expected files → silent generate from templates.
- **update** — target dir has at least one file → preserve content outside AUTO-GEN markers, refresh marker bodies. Optionally accepts user feedback.
- **force** — `--force` flag → overwrite all 4 files regardless of existing content.

## When to use

- Bootstrapping docs for a new sub-workspace.
- Refreshing docs after large refactors / dependency changes.
- A reviewer asked for "what does this sub-workspace do?" and existing docs are stale.

## Prerequisites

- `repomix` installed globally (`npm install -g repomix`).
- `bun` available; tdk TS CLI is `bun .specify/scripts/ts/src/index.ts`.

## Args

| Flag | Notes |
|---|---|
| `--sub-workspace <NAME>` | XOR with `--all`. One sub-workspace from `config.subWorkspaces[]`. |
| `--all` | XOR with `--sub-workspace`. Process every configured sub-workspace sequentially. |
| `--force` | Optional. Overwrite all files (mode=force per target). |

## Steps

1. **Locate project root.** Use `<agent-resolved-project-root>` from the active coding harness/session and `cd` there. Ask the user for the project root if it cannot be identified confidently. All paths below are relative to root.

2. **Run TS resolver.**
   ```bash
   bun .specify/scripts/ts/src/index.ts sub-workspace docs <flags>
   ```
   Capture full output. Stdout will end with one JSON line; stderr carries repomix progress.

3. **Parse contract.** Take the LAST stdout line and `JSON.parse` it. On `{ ok: false, error, code }`: surface the error to the user with code, then stop.

   Successful envelope shape:
   ```json
   {
     "ok": true,
     "targets": [
       { "name": "...", "wsPath": "...", "outputDir": "...", "packedFile": "...",
         "tokenCount": 42100, "mode": "init|update|force",
         "existingFiles": ["..."] }
     ],
     "cleanupCandidates": [".specify/cache/tdk-docs/"],
     "warnings": [...]
   }
   ```
   Surface every entry of `warnings` to the user before continuing.

4. **Per-target sequential loop.** For each `target` in `targets`:

   ### 4a. (mode=update only) Optional user feedback
   Use `AskUserQuestion`:
   - question: `"<target.name>: có thông tin gì sai cần sửa, hoặc codebase đổi gì?"`
   - options: `[{ label: "Skip", description: "No feedback — refresh from sources only" }, { label: "Provide feedback", description: "Type free-form feedback for the writer agent" }]`
   - On "Provide feedback": prompt the user for the text and capture as `userFeedback`. On "Skip": `userFeedback` stays empty.

   ### 4b. Legacy marker check (mode=update only)
   For each filename in `target.existingFiles`:
   ```bash
   grep -L "AUTO-GEN-START" "<target.outputDir>/<filename>"
   ```
   `grep -L` prints paths of files **without** the pattern. If any output → that file is legacy.
   For each legacy file, `AskUserQuestion`:
   - question: `"<filename> has no AUTO-GEN markers. Convert to managed format?"`
   - options: `[{ label: "Convert (overwrite)", description: "Treat as force for this file" }, { label: "Skip", description: "Leave file untouched" }]`
   Track per-file overrides; pass to agent as part of `mode` (per file in update mode, you may need to override individual files to `force`).

   ### 4c. Run tdk-scout
   Run the scout CLI via `Bash`:
   ```bash
   bun .specify/scripts/ts/src/index.ts scout --from-pack "<target.packedFile>" --task-hint "doc generation" --output ".specify/cache/tdk-scout/<target.name>.md"
   ```
   Wait for completion. Read the generated output file. If file is empty or the CLI exited non-zero → STOP entire skill, report which sub-workspace failed and the scout error. **No graceful degrade.** (Decision chốt.)

   ### 4d. Spawn tdk-docs-writer
   Use the Task tool:
   - description: `"Generate docs for <target.name>"`
   - subagent_type: `tdk-docs-writer`
   - prompt (JSON-encoded contract):
     ```json
     {
       "mode": "<target.mode>",
       "packedFile": "<target.packedFile>",
       "scoutReport": ".specify/cache/tdk-scout/<target.name>.md",
       "templatesDir": "<absolute path to .specify/templates/sub-workspace-docs/>",
       "outputDir": "<target.outputDir>",
       "splicerCli": "bun .specify/scripts/ts/src/lib/auto-gen-markers-cli.ts",
       "userFeedback": "<4a result or empty>",
       "existingFiles": <target.existingFiles>
     }
     ```

   Handle the agent's status per Orchestration Protocol:
   - `DONE` → record summary, continue to next target.
   - `DONE_WITH_CONCERNS` → log concerns inline, continue.
   - `BLOCKED` → STOP entire skill, surface reason.
   - `NEEDS_CONTEXT` → STOP, surface what was missing.

5. **Cleanup prompt** (after all targets processed):

   `AskUserQuestion`:
   - question: `"Delete repomix cache at .specify/cache/tdk-docs/?"`
   - options: `[{ label: "No (keep)", description: "Cache stays for next run — faster reruns" }, { label: "Yes (delete)", description: "Free disk; next run repacks from scratch" }]`
   - Default to "No" (safer). On "Yes": `Bash: rm -rf .specify/cache/tdk-docs`.

6. **Final summary.** Print one block per target:
   ```
   <target.name> [<mode>]
     written: <n> file(s)
     warnings: <n>
     concerns: <n>
   ```
   Followed by an aggregate "OK" or "Completed with N warnings" line.

## Error UX

| Symptom | Message + next step |
|---|---|
| `code: NO_ARGS` | `"Need --sub-workspace NAME or --all. Run: tdk sub-workspace docs --help"` |
| `code: INVALID_ARGS` | `"--sub-workspace and --all are mutually exclusive. Pick one."` |
| `code: EMPTY_CONFIG` | `"No sub-workspaces in .specify.json. Run /tdk-sub-workspace-init first."` |
| `code: UNKNOWN_SW` | Show the message verbatim — TS already lists available names. |
| `code: MISSING_PATH` | `"Sub-workspace path missing on disk. Check .specify.json."` |
| `code: MISSING_BIN` | `"repomix not installed. Run: npm install -g repomix"` |
| Scout failed | `"<target.name>: tdk-scout failed. See <scoutReport>. Aborting."` |
| Agent BLOCKED | Show reason verbatim. Aborting. |

## Notes

- Sequential per-target. Do not parallelize: shared cache dir `.specify/cache/tdk-docs/` would race.
- Token cost: each target spawns one scout (Tier 1 deterministic + Tier 2 haiku) + one writer (haiku). For `--all` over N sub-workspaces this scales linearly. Warn the user if any target's pack >100K tokens (TS resolver already emits this).
- Cache files (`tdk-docs/<name>.md`, `tdk-scout/<name>.md`) are gitignored.
- Generates codebase-derived docs only; PRD/roadmap orchestration is out of scope.
