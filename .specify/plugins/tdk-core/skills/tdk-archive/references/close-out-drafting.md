# Close-out drafting

How `/tdk-archive` fills `templates/close-out-template.md.tpl` from the spec's own artifacts. The close-out is a record of what the spec delivered. It is derived, never interviewed, and it never invents content.

## Ground rules

- Read only: `spec.md`, `plan.md`, `phases/*.md`, `git-map.md`, `reviews/*.md`, `ut/`. Never run tests, git, or the review again.
- A source that does not exist is written as `n/a (<artifact> missing)`, for example `n/a (reviews missing)`. Never fill the gap from memory of the conversation or from guesses.
- Every claim traces to an artifact. If no artifact evidences a result, say `not evidenced` instead of `met`.
- Links point inside the feature dir with relative paths (`phases/phase-01-x.md`), so they keep working after the folder moves.
- Keep it compact: one line per phase, one line per SC, one line per candidate. No pasted diffs, logs, secrets, or absolute machine paths.
- A section with nothing to list gets the single line `None.` (a table is replaced by it, header rows included). `n/a (<artifact> missing)` is only for a source that does not exist.
- Write the draft into the active feature dir as `close-out.md`. The folder is archived right after, so every value is written for the post-archive state.

## Frontmatter

| Key | Source |
|---|---|
| `task_id` | The canonical `taskId` (`<folder>/<ticket>`) from the `check-prerequisites` JSON of Step 2 (or the `archive` output when it carries one); never derived from path segments, because a ticket may contain `/` |
| `title` | `plan.md` frontmatter `title` (fallback: the first `#` heading of `spec.md`) |
| `archived_at` | Today, `YYYY-MM-DD` |
| `archived_from` | `--check` output `archived_from` (`done` or `cancelled`) |
| `feature_branch` | `git-map.md` frontmatter `feature_branch`; `n/a (git-map.md missing)` when absent |
| `phases` | Run `src/commands/util/parse-phases-table.ts "{FEATURE_DIR}/plan.md" --json` through the same project-root wrapper as the other scripts. It returns `{phases[], errors[]}` with no counts: count the `phases` array yourself. `total` = its length; `done` and `skipped` = entries whose `status` is that value; other statuses such as `cancelled` count only in `total`. A non-empty `errors` is a script error (STOP) |
| `review_verdict` | `verdict` in the frontmatter of the newest `reviews/*.md` (file names start with a timestamp); `n/a (reviews missing)` when none |
| `memory_status` | Derived from the Memory candidates table, see [Memory status](#memory-status) |

## Sections

| Section | Fill from |
|---|---|
| Outcome | `done` -> `delivered`, or `partial` when a phase is `skipped`, an SC is not met, or the newest review verdict is `changes_requested` or `blocked` (`pass_with_concerns` stays `delivered`; name the concerns). `cancelled` -> `cancelled` plus the reason stated in `plan.md` or the cancelled phases. One short paragraph naming the basis. |
| What shipped | One row per phase: link, one-line result from the phase file (`skipped` -> its stated reason), repo and branch from `plan.md` `## Scope` and the `git-map.md` rows (sub-workspace, repo path, branch). |
| Decisions & deviations | `plan.md` `## Decisions Made`; any phase note that records a changed approach, deferral, or spike result; review findings that changed the plan. One line each, with the source link. |
| Review & verification | One line per `reviews/*.md`: file, mode, verdict, severity counts (frontmatter `counts`). Then `ut/` content: files and the result they record. Do not summarize raw findings. |
| Debt & follow-ups | Open `## Unresolved Questions` of `spec.md` and `plan.md`, deferred items, skipped phases, review fix phases that never ran. Each item is a ready seed line `/tdk-plan <task-id> "<description>"`; `<task-id>` stays a placeholder because an archived spec cannot be re-planned. A description never contains a `--` token. |
| SC-* results | One row per `SC-nnn` in `spec.md` `## Success Criteria`: target (verbatim, shortened), observed (from the review compliance matrix, `ut/`, or phase evidence), result `met`, `partly`, `not met`, or `not evidenced`. |
| Memory candidates | See below. |

## Memory candidates

Only durable project knowledge that a later spec would otherwise rediscover. Candidate sources: rules decided, service contracts introduced, data-model entities, decision records, accepted risks or debt, flows.

Never a candidate: task progress, file lists, test counts, anything already obvious from code, anything the artifacts do not state, secrets.

- Table `id | type | domain | content | status`.
- `id`: unique within the file, kebab-case, for example `invoice-approval-rule`. It becomes the target `name` for name-addressed types at ingest time, so do not add a type suffix such as `-flow`.
- `type`: `business-rule`, `service`, `data-model`, `decision-record`, `risk-debt`, or `flow`.
- `domain`: for `business-rule`, `service` and `flow` it must be a domain of the project memory Domain Map, and it is never guessed. Run the Memory status block of `ingest-workflow.md` section 2 once per run (ingest of the same run reuses it). When it is `ready` and its `domains` lists names, check the domain the spec names against `domains` (read only); a domain that is not listed keeps the name the spec gave and the row status is `pending (unknown domain <d>)`. When memory is not initialised, unavailable, or `domains` is `unknown`, use the domain the spec names; `domains: none` lists no domain, so every named domain is unknown. When the spec names no domain, write the status `pending (domain not chosen)` for that row (its `domain` cell is `-`) instead of picking one; the user fixes the cell, then ingest treats the row as a normal `pending` row. For the other types the domain is provenance only: use the owning domain when the spec names one, else `general`.
- `content`: one self-contained line, at most about 300 characters, no `|` characters (rephrase), no `Source:` suffix (ingest appends it). Entries are intentionally brief; a longer flow or entity belongs in the spec, with the memory line pointing at the outcome.
- `status`: `pending (not ingested yet)` in a fresh draft, except the `pending (unknown domain <d>)` and `pending (domain not chosen)` rows above.
- `cancelled` specs get no rows: write `None (cancelled).` instead of the table. A done spec with no durable knowledge gets `None.` instead of the table.

## Memory status

Computed from the row statuses (`pending (...)`, `ingested`, `skipped (...)`):

| Value | Rule |
|---|---|
| `skipped` | No rows (always for `cancelled`), or every row `skipped` |
| `ingested` | No `pending` row and at least one `ingested` row |
| `partial` | At least one `ingested` row and at least one `pending` row |
| `pending` | No `ingested` row and at least one `pending` row |

A fresh draft with rows is `pending`; without rows it is `skipped`.

## Existing close-out.md

A `close-out.md` already in the active feature dir comes from an earlier run that failed before the folder moved, or from a restored spec. If it is identical to the new draft, keep it without asking. Otherwise show what differs and ask once: overwrite, keep the existing file, or stop. Never overwrite silently.

When overwriting, a row whose `id` and `content` match an existing row keeps that row's status (`ingested` and `skipped` are terminal); only new or changed rows start as `pending (not ingested yet)`. Recompute `memory_status` afterwards.
