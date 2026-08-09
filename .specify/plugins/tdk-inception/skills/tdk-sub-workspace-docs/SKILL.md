---
name: tdk-sub-workspace-docs
description: "Init or update arc42-lite documentation for one or all configured sub-workspaces. Writes README, architecture, interfaces, data-flow, and engineering docs under <docsPath>/sub-workspaces/<name>/."
user-invocable: true
argument-hint: "[--sub-workspace NAME | --all] [--force]"
metadata:
  version: "1.1.0"
  author: "VinhLTT"
  category: docs
---

# tdk-sub-workspace-docs

Generate or refresh arc42-lite docs for one or every configured sub-workspace. Output path:

```text
<docsPath>/sub-workspaces/<name>/
```

Expected files:

- `README.md`
- `architecture.md`
- `interfaces.md`
- `data-flow.md`
- `engineering.md`

The skill reads code evidence, scout output, and `workspace-dependency-policy.md` when available. It updates only the managed AUTO-GEN sections and does not delete old generated docs.

## When To Use

- After `/tdk-workflow-config-apply` has populated `.specify/.specify.json` with `subWorkspaces[]`.
- After `/tdk-workspace-dependency-policy` has produced dependency guidance.
- Before `/tdk-sub-workspace-automation-recommend`, so recommendation can reason from focused per-workspace docs.

## Prerequisites

- `.specify/.specify.json` exists with configured `subWorkspaces[]`.
- `repomix` is installed globally: `npm install -g repomix`.
- `bun` is available.
- Use `<agent-resolved-project-root>` from the active coding harness/session. Ask the user for the project root if it cannot be identified confidently.

## Args

| Flag | Notes |
|---|---|
| `--sub-workspace <NAME>` | Target one configured sub-workspace. XOR with `--all`. |
| `--all` | Target every configured sub-workspace sequentially. XOR with `--sub-workspace`. |
| `--force` | Overwrite managed AUTO-GEN sections for every target. |

## Steps

1. Locate project root from the active session and `cd` there.

2. Run the TypeScript resolver:

   ```bash
   bun .specify/scripts/ts/src/index.ts sub-workspace docs <flags>
   ```

   Parse the last stdout line as JSON. On `{ ok: false, error, code }`, surface the error and stop.

3. For each target in the successful envelope:

   - Surface resolver warnings.
   - In update mode, ask whether the user has correction feedback for that sub-workspace.
   - Check existing managed files for AUTO-GEN markers. If a file has no markers, ask before converting or leave it untouched.
   - Run scout:

     ```bash
     bun .specify/scripts/ts/src/index.ts scout --from-pack "<target.packedFile>" --task-hint "arc42-lite sub-workspace docs" --output ".specify/cache/tdk-scout/<target.name>.md"
     ```

     Check the exit status. Scout is advisory here, so a non-zero exit degrades this
     target instead of failing it: record a warning carrying scout's stderr, omit
     `scoutReport` from the payload below, and continue to the next target. Never abort
     the run — one sub-workspace that scout cannot navigate must not stop the others.

   - Spawn `tdk-docs-writer` with (omit the `scoutReport` line entirely when scout failed):

     ```json
     {
       "mode": "<target.mode>",
       "packedFile": "<target.packedFile>",
       "scoutReport": ".specify/cache/tdk-scout/<target.name>.md",
       "templatesDir": "<absolute path to .specify/templates/sub-workspace-docs/>",
       "outputDir": "<target.outputDir>",
       "splicerCli": "bun .specify/scripts/ts/src/lib/auto-gen-markers-cli.ts",
       "userFeedback": "<optional user feedback>",
       "existingFiles": <target.existingFiles>
     }
     ```

     `existingFiles` is an array taken whole from the resolver envelope for this
     target — it reflects which managed files actually exist in `outputDir`. Do
     not replace it with a hard-coded list: the writer uses it to decide which
     files get `update` splicing versus fresh `init` rendering.

4. After all targets finish, ask whether to keep or delete `.specify/cache/tdk-docs/`. Default to keep.

5. Final summary per target:

   ```text
   <target.name> [<mode>]
     written: <n> file(s)
     warnings: <n>
     concerns: <n>
     scout: ok | unavailable (<reason>)
   ```

   The `scout` line makes a degraded target visible at a glance. Without it a
   pack-only run reads as a full one, and the user cannot tell which docs were
   written without navigation evidence.

## Error UX

| Symptom | Message |
|---|---|
| `NO_ARGS` | Need `--sub-workspace NAME` or `--all`. |
| `INVALID_ARGS` | `--sub-workspace` and `--all` are mutually exclusive. |
| `EMPTY_CONFIG` | No sub-workspaces in `.specify/.specify.json`. Run workspace layout and config apply first. |
| `UNKNOWN_SW` | Show the resolver message with available names. |
| `MISSING_PATH` | Config points to a missing sub-workspace path. Fix config or create the folder. |
| `MISSING_BIN` | Install repomix with `npm install -g repomix`. |
| Scout failed | Degrade that target: record a warning with scout's stderr, omit `scoutReport` from the writer payload, and continue with the remaining targets. |
| Writer blocked | Stop and show the writer reason. |

## Notes

- Sequential per target. Do not parallelize because cache paths are shared.
- This creates source-grounded docs only. It does not create PRDs, roadmaps, implementation plans, source code, or runtime config.
- `interfaces.md` should use `workspace-dependency-policy.md` as stronger context when the policy exists.
