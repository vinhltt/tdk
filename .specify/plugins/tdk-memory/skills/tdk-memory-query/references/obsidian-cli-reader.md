# Obsidian CLI reader

Load this file only when the runtime `resolve` JSON reports `reader: obsidian-cli`.
The CLI has one job: nominating note paths for a free-text query. Never use it for
writes, checksums, changelogs, index regeneration, exact `id` or path resolution,
typed data-model resolution, or evidence verification. Note content always comes
from a file read of a contained path (the root contract,
`memory-root-and-asset-contract.md`, section 7; `--status` reads no notes and does not
load it).

Take `vault`, `on_unavailable`, and `workspace` from `reader_cli` in that JSON and
`root` from its `root`. The runtime already validated `vault`. Never show `workspace`
or the binary path in a Status Block, an error line, or a result.

`--status` uses Locate the binary, Read a CLI result, and Probe. `tdk-memory-query`
uses every section. `tdk-memory-agent` skips Probe.

## Locate the binary

Take the first candidate that exists and is executable:

1. The output of `command -v obsidian`, only when it is an absolute path.
2. On WSL (`WSL_DISTRO_NAME` is set): `/mnt/c/Program Files/Obsidian/Obsidian.com`.
3. On WSL: `/mnt/c/Program Files/Obsidian/Obsidian.exe`.

No candidate: the reason is `not-installed`. Refuse a candidate whose path contains a
control character, `` ` ``, `$`, or `"` before any further command and report
`not-installed`, because double quotes would not keep it inert. Canonicalize the candidate with
`realpath` and compare by path segment, not string prefix. When it is inside
`workspace` or `root`, refuse it and report `not-installed` without trying another
candidate, because a binary a repository supplies must never run.

Invoke only that absolute path, in double quotes. Never run a bare name and never
go through `cmd.exe /c`.

## Read a CLI result

The exit code carries no signal: the CLI exits 0 on failure. Run every call in this
form, keeping `vault=` first and stdin closed, and read its filtered stdout with the
table below, including the retry. Where `timeout` is missing, drop it and rely on the
shell tool's time limit.

```sh
timeout 15 "<binary>" "vault=<vault>" <arguments> </dev/null | tr -d '\r' | grep -Ev 'Loading updated app package|installer is out of date|^[[:space:]]*$'
```

| Filtered stdout | Result |
|---|---|
| empty | retry the call once, because a cold call can print only noise or time out; still empty is `failed` |
| first line starts with `Error:` | `failed` |
| `Vault not found.` | `unknown-vault` |
| `No matches found.` | `no-matches` |
| anything else | payload |

## Probe

The first call may launch the Obsidian app. Stop at the first step that yields a
reason.

1. Locate the binary. Reason: `not-installed`.
2. Read the vault path and compare it with `root` in one snippet. The variable keeps
   the value out of the command text:

   ```sh
   vault_path=$(timeout 15 "<binary>" "vault=<vault>" vault info=path </dev/null | tr -d '\r' | grep -Ev 'Loading updated app package|installer is out of date|^[[:space:]]*$')
   printf 'payload: %s\n' "$vault_path"
   case "$vault_path" in
     /*) realpath "$vault_path" ;;
     [A-Za-z]:\\*|\\\\*)
       [ -n "$WSL_DISTRO_NAME" ] && vault_path=$(wslpath -u "$vault_path")
       realpath "$vault_path" ;;
   esac
   if [ "$vault_path" -ef "<root>" ]; then echo same; else echo different; fi
   ```

   Read the `payload:` line first, by the table above; for an empty payload that retry
   reruns the whole snippet. `unknown-vault`: reason `vault-mismatch`. `failed`, more
   than one line, or any other payload that is not an absolute path: reason
   `not-running`.
3. Only a single absolute path gets here. Read the last line: `same` passes, and
   `different` is reason `vault-mismatch`. The shell compares the directories themselves,
   so two spellings of one path, such as a drive path and its Git Bash form, are `same`.

With no reason the probe passes and `reader` stays `obsidian-cli`. With a reason,
apply `on_unavailable`:

| `on_unavailable` | Outcome |
|---|---|
| `ask` | Use `AskUserQuestion`: "Obsidian CLI `<reason>`. Fall back to reading files?" Yes is fall back; No is refuse. A run that cannot ask (non-interactive, no question tool) falls back |
| `fallback` | Fall back |
| `fail` | Refuse |

- **Fall back:** `reader` becomes `file`, `reader_fallback` becomes `<reason>`, and
  `warnings` gains `reader-<reason>`. The operation continues on files.
- **Refuse:** `status` becomes `error` and `error` becomes `reader-<reason>`.
  `root`, `reader`, and `reader_fallback` keep their values. Stop without writing.

## Nominate

Natural-language queries and free-text agent evidence only. Typed queries, `--domain`,
`--type`, `--for-agent` calls, and known paths never reach this section. The agent's
own free-text evidence step reaches it; its `tdk-memory-query --for-agent` calls do
not.

| Caller | Before step 1 | `on_unavailable: ask` |
|---|---|---|
| `tdk-memory-query` | Run the Probe. Refuse stops with its code; fall back uses file nomination for this query | Asked by the Probe |
| `tdk-memory-agent` with `reader: obsidian-cli` in control | Locate the binary only. Never probe and never ask: the caller's `--status` already probed. A failure to locate is a failed search below | Acts as `fallback` |

1. **Term.** The term is the whole query for `tdk-memory-query`, the same text the
   file flow ranks, and one keyword or evidence phrase at a time for the agent.
   Normalize it through the runtime, which takes no root and reads no file. Encode it
   as JSON on one physical line and never place it in argv. `<runtime>` is the
   `memory-manifest.cjs` path your caller already uses for `resolve`. Run the block as
   printed: the closing `TDK_RANK_INPUT` must start its line, so never indent it.

```sh
node "<runtime>" rank --print-term <<'TDK_RANK_INPUT'
{"terms":["<term encoded as a JSON string>"]}
TDK_RANK_INPUT
```

   The printed `term` stays inert inside double quotes and is what the search uses.
   `{"term":null}`, as with a question mark or a path in the query, means skip the CLI
   and use file nomination for this query under any `on_unavailable`, because no search
   ran and so none failed. The agent gives up `candidates` for the whole call.
2. **Search.**

   ```sh
   timeout 15 "<binary>" "vault=<vault>" search "query=<term>" format=json limit=50 </dev/null | tr -d '\r' | grep -Ev 'Loading updated app package|installer is out of date|^[[:space:]]*$'
   ```

   A usable payload parses as a JSON array of strings with fewer than 50 entries. A
   full 50 may be a cut-off result, and the cut could drop the note that would rank
   first. `failed`, `unknown-vault`, `no-matches`, an unparseable payload, and a full
   result all count as a failed search.
3. **Filter each path before ranking.** Drop an entry that is absolute (leading `/`
   or `\`, or a drive letter), has a `..` segment, contains a backslash, control
   character, U+2028, U+2029, `` ` ``, `$`, or `"`, does not end in `.md`, or has a
   `_templates`, `_deprecated`, `memory-architect`, `assets`, `.obsidian`, or `.trash`
   segment. A note name is untrusted and those characters stay active inside double
   quotes, so only a path that passed this filter may reach a shell. Deduplicate. No
   entries left counts as a failed search.
4. **Rank.** The remaining paths become `candidates` of the `rank` call: the one in
   `flow-query.md` for `tdk-memory-query`, and Step 3.5 for the agent, which gathers
   every keyword's paths into one call. `rank` keeps only paths in its own inventory,
   which applies containment and the exclusions, and scores them like any other
   note. `total: 0` counts as a failed search, so falling back repeats `rank` once
   without `candidates`. CLI result order never affects rank.

A failed search falls back for that query only:

| `on_unavailable` | Outcome |
|---|---|
| `ask`, `fallback` | Use file nomination for this query. Do not ask again. The `(file nomination)` label below is the only warning: add nothing to a Guardian Report section or its counts |
| `fail` | The query fails. `tdk-memory-query`: STOP with `reader-search-failed — <memory.path as configured>`. Agent `validate`: a claim whose only route to evidence was that search is `NOT CHECKED`; a claim with evidence from a file-based read keeps its result. Agent `load`: the keyword adds no paths and is named under `## Constraints & Warnings` as `reader search failed: <keyword>` |

## Record the reader

Report `reader: obsidian-cli (file nomination)` when any free-text query in the
operation used file nomination, and `reader: obsidian-cli` otherwise. A Probe that
falls back in `tdk-memory-query` counts as file nomination, and that result also prints
`warning: reader-<reason>`.
