# Ingest workflow

Feeds the `pending` rows of archived `close-out.md` files into project memory. Entered by `/tdk-archive --ingest [task-id]`, or at the end of `/tdk-archive <task-id> --auto-upmem`. Running ingest is the consent to write memory: no approval question exists apart from the single conflict confirmation in step 4.

Memory is only written through `/tdk-memory-update` with a candidate block (step 5). This workflow never edits the memory root directly, and it only edits `close-out.md` row statuses and `memory_status`.

## Row state machine

The status cell of a Memory candidates row is one of:

| State | Meaning | Ingest does |
|---|---|---|
| `pending (<reason>)` | Not in memory yet | Classify, then write or leave |
| `ingested` | In memory | Skip: never query, never write, never re-ask |
| `skipped (<reason>)` | User declined; terminal | Skip: never query, never write, never re-ask |

Any other status cell (empty, different spelling) is treated as `pending (invalid status)`. A duplicate row id inside one file stops the run for that file with the ids named.

Transitions, applied to the file right after each row is decided: `pending` -> `ingested` (written or already present), `pending` -> `skipped (<reason>)` (user chose Skip), `pending` -> `pending (<new reason>)` (unknown domain, environment failure, Leave pending). `ingested` and `skipped` never change. A closed row therefore survives any number of reruns untouched.

## 1. Scope

Run `tdk-load-project-context` with `require_feature_dir` false for `featureEnv.specsRoot` (a given task id is validated first with `tdk-validate-task-id`, host `/tdk-archive`).

- With a task id: resolve it as an archived spec.

  ```bash
  bash -lc '
  PROJECT_DIR="$1"
  if [ -z "$PROJECT_DIR" ] || [ ! -d "$PROJECT_DIR/.specify/scripts/ts" ]; then
    echo "Invalid project root: $PROJECT_DIR" >&2
    exit 1
  fi
  (cd "$PROJECT_DIR/.specify/scripts/ts" && bun src/commands/util/check-prerequisites.ts {task_id} --allow-archived --json)
  ' -- "<agent-resolved-project-root>"
  ```

  STOP when `archived` is not `true` (tell the user to run `/tdk-archive <id>` first) or when `close-out.md` is missing in the returned `featureDir`. From here on the task id is the JSON `taskId` (canonical `<folder>/<ticket>`), never the raw argument; the [Next step](../SKILL.md#next-step) query uses it.
- Without an id: every `<specs.root>/archive/**/close-out.md` whose frontmatter `memory_status` is `pending` or `partial`. None found -> print `No archived close-out has open memory rows.` and stop.

`<close-out path>` below means the repo-relative POSIX path of each file in scope.

## 2. Memory preflight

Resolve `<memoryRoot>` once: `memory.path` in `.specify/.specify.json` (relative to the project root) when the file sets a nonempty string, otherwise the default `.specify/memory`. A `memory.path` that is present but not a nonempty string -> STOP and report it. `/tdk-memory-update` and `/tdk-memory-query` resolve the same root from the same config, so no root argument is passed to them.

All three must hold, checked silently and without writing:

1. `<memoryRoot>/memory-index.md` exists.
2. `<memoryRoot>/memory.yaml` exists.
3. `/tdk-memory-update` is available in the live skill catalog.

The check itself writes nothing. If any is missing: change nothing except the reason of each `pending (not ingested yet)` row to `pending (memory not initialised)` or `pending (tdk-memory not installed)` (a more specific reason stays), print the reason and the hint `run /tdk-memory-init, then /tdk-archive --ingest`; a single-spec run then prints the [Next step](../SKILL.md#next-step) as in §6, and stops. Archiving never depends on this check.

Read the Domain Map of `<memoryRoot>/memory-index.md` once for step 3.

## 3. Classify every pending row, write nothing yet

Walk all `pending` rows of all files in scope and assign each exactly one outcome before any memory call or file edit:

1. **Unknown domain.** `type` is `business-rule`, `service` or `flow` and the domain is not in the Domain Map -> outcome `unknown-domain`; the row becomes `pending (unknown domain <d>)`. An empty or `-` domain is never guessed: the row becomes `pending (domain not chosen)`. No question.
2. **Query.** Otherwise run `/tdk-memory-query` for the row's domain and type, naming the target file of the type (`business-rules.md`, `services.md`, `flows/<id>-flow.md`, `data-model/<id>.md`, `decisions/<id>.md`, `risks-and-debt/<id>.md`) and the row's key terms. A failed or unreadable query is an environment failure: outcome `pending (memory query failed)`.
3. **Compare** the row with the entries returned and pick the first matching outcome:

   | Outcome | Criterion |
   |---|---|
   | `identical` | Every fact of the row is already stated by an entry of the target section; wording may differ |
   | `conflict` | An entry has the same label or anchor with different content; or an entry states something that contradicts the row (other threshold, opposite obligation, other owner); or applying the row would remove or overwrite an existing entry; or the match cannot be judged from the query result |
   | `new` | Nothing in the target section overlaps the row |

4. **Default action** for each `conflict`:

   | Kind | Default |
   |---|---|
   | Same label, the row only adds facts and contradicts nothing | Merge |
   | Same label, the existing text is outdated by the delivered work and the row says what changed | Replace |
   | Contradiction without a stated supersession; removal needed without a stated supersession; unjudgeable match | Leave pending |

   Skip is never a default: it is terminal and only the user chooses it.

5. **Same-target rows.** Rows in scope that share a target (same type and domain, and the same id for name-addressed types) are compared with each other as well. The first is classified against memory; each later one is a `conflict` when it repeats the label, overlaps, or contradicts an earlier row, because memory will have changed by the time it is written.

`identical` rows become `ingested` in step 5 with no write. `new` rows are written with `action: merge`.

## 4. Confirm conflicts once

- No `conflict` row anywhere in scope: continue with zero questions.
- Otherwise ask exactly one batched confirmation covering every conflict of every file in scope, never one question per row. Print one table: `spec | row id | what conflicts | existing entry | default action`. Then one prompt: reply `ok` to apply every default, `cancel` to discard the conflict decisions and write nothing to memory, or list overrides such as `<spec>:<row id>=skip`. Allowed actions: `merge`, `replace`, `skip`, `leave`. An unrecognised row id or action re-shows the table as part of the same confirmation; it is not a new one.
- `cancel` discards only the memory writes and the conflict decisions: no `/tdk-memory-update` call is made, and conflict, `identical` and `new` rows keep their current status. Reasons decided in steps 2 and 3 are plain status-cell updates, not memory writes, so they are kept: `unknown-domain` rows still become `pending (unknown domain <d>)`, failed queries `pending (memory query failed)`, and the preflight reasons (`memory not initialised`, `tdk-memory not installed`) stay. Then continue with step 6.
- After any other reply, run to the end without further questions.

## 5. Write

For each row in scope that is still `pending`, one at a time (memory updates are sequential, never parallel), in file order:

- `unknown-domain` and `leave` rows: update the status cell only (`leave` -> `pending (left pending at ingest)`).
- `identical` rows: mark `ingested`, no memory call.
- `skip` rows: mark `skipped (<reason>)`, using the user's reason or `declined at ingest`.
- `new`, `merge` and `replace` rows: call `/tdk-memory-update` with this block as the whole argument text, nothing before it:

  ```text
  ===TDK-MEMORY-CANDIDATE===
  type: <row type>
  domain: <row domain>
  action: merge|replace
  name: <row id>
  sourceFiles:
  - <close-out path>
  content:
  <row content> Source: <close-out path>#memory-candidates
  ===END-CANDIDATE===
  ```

  - Include the `name:` line only for `flow`, `data-model`, `decision-record` and `risk-debt`; omit it for `business-rule` and `service`.
  - `replace`: query again right before the write (earlier rows may have changed the section). The entry is addressed by its heading line or its bullet label line, as stored. Make that line the first line of `content`, followed by the new text and the `Source:` suffix on the last line; `/tdk-memory-update` then swaps the whole entry. When the entry has no such line of its own (a plain sentence or a single-line bullet whose first line is its body), or cannot be found, treat the row as `leave` with reason `cannot locate entry to replace`.
  - Read the final `Result:` line of the response: `written` or `already present` -> `ingested`; `error: <reason>` or a missing `Result:` line -> `pending (<reason>)`. A row error never stops the other rows.

Edit the row's status cell in `close-out.md` immediately after each decision, not at the end.

## 6. Recompute and report

Per file, recompute `memory_status` from the row statuses (rules in `close-out-drafting.md`, Memory status) and update the frontmatter. Print a per-spec summary (counts of ingested, already present, skipped, pending with reasons, resulting `memory_status`) and:

```text
Review with (run by hand):
git status --short -- <memoryRoot> <close-out path>
git add -N -- <memoryRoot> <close-out path>
git diff -- <memoryRoot> <close-out path>
```

New memory files and an archived `close-out.md` are untracked, so a plain `git diff` omits them; `git add -N` records them as intent-to-add so the diff shows them. Alternatively, open the new files directly. List every `<close-out path>` in scope.

Hint for rows still `pending (unknown domain <d>)` or `pending (domain not chosen)`: set the domain in the table (or add the domain with `/tdk-memory-init`) and rerun. Rows left pending by a conflict are asked again on the next ingest. Print, never run, any `git add` or commit suggestion.

Last, after `memory_status` is written: a single-spec run (`--ingest <task-id>`, or `--auto-upmem` from an archive run) prints the next step per SKILL.md [Next step](../SKILL.md#next-step), queried as `archive/<canonical task id>`. A multi-spec `--ingest` (no task id) prints the summary only, with no next-step line.

## Crash safety

No state outside `close-out.md` exists. If a session dies between a memory write and the row update, the row is still `pending`. On rerun the query reports the entry as `identical`, or `/tdk-memory-update` answers `already present`; both end as `ingested` without a second entry.
