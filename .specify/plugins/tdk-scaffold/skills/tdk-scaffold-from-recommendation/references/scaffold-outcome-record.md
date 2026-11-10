# Scaffold Outcome Record

`scaffold-outcome.json` sits beside the recommendation. It records what an approved scaffold run left on disk, so the next run can tell which artifacts changed since then: a hand edit, a retro apply, or a line-ending-only checkout difference that is not a change.

Only `scripts/scaffold-outcome-record.ts` writes this file or derives baseline labels from it; `/tdk-sub-workspace-automation-recommend` reads its rows directly, as evidence only. Never hash a file for the sidecar, edit the JSON, or infer a baseline label by hand. The raw-byte snapshots of the scaffold's Review Each Artifact steps 4 and 7 are a separate approval guard and stay. The script needs preinstalled Bun and nothing else: no `.specify/scripts/ts` tree, no dependency install, no build.

## Sidecar v1

```json
{
  "version": 1,
  "recommendation": { "path": "<repo-relative>", "sha256": "<64 hex>", "recorded_at": "<ISO UTC>" },
  "proposal": { "path": "<repo-relative>", "sha256": "<64 hex>", "recorded_at": "<ISO UTC>" },
  "artifacts": [
    {
      "kind": "skill",
      "name": "<name>",
      "path": ".claude/skills/<name>/SKILL.md",
      "outcome": "created",
      "recorded_at": "<ISO UTC>",
      "files": [{ "path": "<repo-relative>", "sha256": "<64 hex>" }]
    }
  ]
}
```

- `kind` is `skill` or `agent`. `path` is the canonical target: `.claude/skills/<name>/SKILL.md` or `.claude/agents/<name>.md`.
- `outcome` is `created`, `patched`, `reused`, or `kept-unchanged`.
- `proposal` is `null` until a run records one.
- The sidecar never stores readiness, route verification, or any other derived label.

## Record

```text
bun --no-install <loaded-skill-root>/scripts/scaffold-outcome-record.ts record --project-root <root> --recommendation <repo-relative> [--proposal <repo-relative>] [--rows-file <path>]
```

Pass the rows as one JSON array on stdin. When the host cannot pass a here-document, write the array to a temporary file outside the project and pass `--rows-file`. Empty stdin is `invalid_rows`. An empty array `[]` is valid and refreshes only `recommendation` and `proposal`.

```json
[
  { "kind": "skill", "name": "<name>", "path": ".claude/skills/<name>/SKILL.md", "outcome": "created", "files": [".claude/skills/<name>/references/<file>.md"] },
  { "kind": "agent", "name": "<name>", "path": ".claude/agents/<name>.md", "outcome": "reused" }
]
```

- `files` lists the artifact's supporting files, repo-relative. The script always adds `path` itself.
- The script validates every path and file and the existing sidecar before it writes anything. One failure writes nothing.
- It upserts by `(kind, path)`. A given row replaces the stored row and gets this run's `recorded_at`. A stored row that is not given stays exactly as it was. No row is ever deleted.
- `recommendation` is always refreshed. `proposal` is refreshed only with `--proposal`.
- The write is atomic: a temporary file in the same directory, then a rename.

Success prints `{"ok":true,"sidecar":"<repo-relative>","upserted":[...],"kept":[...]}` and exits 0.

## Compare

Read-only. It runs in `--dry-run` too.

```text
bun --no-install <loaded-skill-root>/scripts/scaffold-outcome-record.ts compare --project-root <root> --recommendation <repo-relative>
```

| `state` | Extra fields | Meaning |
|---|---|---|
| `present` | `recommendation_changed`, `artifacts[]` | The baseline is usable |
| `missing` | none | No sidecar yet |
| `invalid` | `reason` | Unreadable, malformed, a symlink, or a recorded path that now resolves outside the root |
| `unsupported-version` | `version` | Written by a newer or older format |
| `foreign` | `recorded_for` | The sidecar belongs to another recommendation in the same directory |

Each `artifacts[]` item has `kind`, `name`, `path`, `outcome`, `recorded_at`, `label`, and `files[]` with a per-file `label`. A file is `unchanged`, `changed`, or `missing`. An artifact is `changed` when any file changed, else `missing` when any file is missing, else `unchanged`.

Every `state` exits 0. Exit 1 is only for argument errors, a missing recommendation, or a path outside the root.

## Errors

Failures print `{"ok":false,"error":"<code>","detail":"..."}` and exit 1.

| Code | Cause |
|---|---|
| `invalid_args` | Unknown command or flag, missing or repeated value, an absolute or `\` path in `--recommendation` or `--proposal`, no rows input (stdin is a terminal and there is no `--rows-file`) |
| `invalid_rows` | Rows are not a JSON array, a row is malformed, its path is not the canonical target for its kind and name, or a `(kind, path)` repeats |
| `path_outside_root` | A path uses `..` or resolves outside the project root through a symlink |
| `missing_file` | The recommendation, proposal, or an artifact file does not exist |
| `foreign_sidecar` | The existing sidecar records another recommendation |
| `invalid_sidecar` | The existing sidecar is unreadable, malformed, a symlink, or not version 1 |
| `io_error` | Any other read or write failure |

`foreign_sidecar` and `invalid_sidecar` leave the file untouched. Name its path and let the user decide whether to move or delete it. Never overwrite it.

## Hash Rule

- SHA-256, lowercase hex, over the whole file.
- For `.md`, `.json`, `.yaml`, `.yml`, `.txt`, and `.tpl`, every `\r\n` pair is folded to `\n` first. A lone `\r` and a BOM stay significant.
- Every other extension hashes its raw bytes.

So an LF file hashes to its plain SHA-256, and a `core.autocrlf=true` checkout of the same content hashes the same.
