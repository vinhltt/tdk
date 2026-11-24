# Review orchestration

Algorithms for `/tdk-review`. The TS helpers own scope and routing decisions; this file only says how to call them and what to do with their output. Never restate or re-derive git-map, identity, fallback, or routing rules here.

## 1. Scope

```text
bun --no-install "<loaded-skill-root>/scripts/review-scope.js" --project-root <project-root> --feature-dir <FEATURE_DIR> [--phase NN]
```

Success JSON: `diffDir`, `repos[]` (`subWorkspace`, `repoPath`, `workingRoot`, `baseCommit`, `includesUncommitted`, `source`, `files`, `diffLines`, `truncated`), `slices[]` (`id`, `repoPath`, `subWorkspace`, `files`, `routingPaths`, `changes[]` with `path`, `added`, `deleted`, `diffLines`, `diffFile`, `hunks`, then `diffLines`, `truncated`), `notReviewed[]` (`subWorkspace`, `state`, `reason`, optional `blocking`), `phases` (`reviewed`, `skipped`), `porcelain`, `porcelainArgs`, `warnings`, `incomplete`, `empty`.

- `repos[]` is the physical repository: base commit, working root, integrity, `files`, `diffLines`, `truncated`. It carries no diff text.
- `slices[]` is the unit of review: the files of one repo owned by one sub-workspace (`subWorkspace: null` when no configured path owns them). `files` are `repoPath`-relative evidence coordinates; `routingPaths` are the same files in project coordinates, for routing only. `changes[]` has one entry per file, in `files` order. Slice identity, ownership and coordinates belong to the helper. Never re-derive, merge, re-split or re-map them; only batching is yours (§5).
- The diff text lives only in the diff files. `diffFile` is one file's whole rendered diff, relative to the project root, inside this run's `diffDir`; `diffLines` is its line count. `hunks` are its changed regions (`oldStart`, `oldLines`, `newStart`, `newLines`), so a `file:line` can be placed without reading the diff. Never Read a diff file to put its text into a prompt: each reviewer Reads its own.
- A file with no content (an entry in `truncated`: binary, directory, unreadable, or an untracked file over 1 MB) has `diffFile: null`, `diffLines: 0` and no hunks. A slice with no `diffFile` at all is listed as stat only and is never dispatched, counted, or treated as unreviewed.

- Exit 1 with `ok:false`: STOP and report `error`/`message`. `phase_in_progress` and `phase_not_done` mean the user must finish or pick a done phase; do not narrow the scope yourself to get past them. `diff_write_failed` means the helper could not use `reviews/.diff/` (for example, a symlink there); never write the diffs anywhere else.
- `incomplete: true`: spawn nothing. Go to the write step with `verdict: blocked` and reason `scope_incomplete`, and list every `notReviewed[]` row with `blocking: true` under Scope with its reason.
- `empty: true`: spawn nothing. Go to the write step with `verdict: blocked` and reason `empty_scope`.
- Untracked files are already rendered as new-file diffs, and `diffLines` counts them. Entries in `truncated` have no diff: list them in the report under Scope as "stat only" and never claim they were reviewed.
- `notReviewed[]` rows are listed in the report under Scope, with their reason. Never treat them as an empty diff. The one exception is `unmapped_in_mapped_repo`, which is a note, not a skipped row. Its path was diffed against `HEAD` only, so its committed changes since the row's base are out of scope. It never blocks, and it does not stop the helper from reporting `empty: true`.
- Surface every `warnings[]` entry in the report.
- Run the helper once per review. At start it removes the previous run's diff directory, so a second call during the run would delete the diffs that later waves and retries still read. Two concurrent reviews of one feature are not supported.

## 2. Integrity snapshot

Before dispatching anything, run for every key in `porcelain` (the directory the helper read, relative to the project root: usually a `repoPath`, or a `_worktrees/…` path for a git-map row with a worktree; `.` is the project root):

```text
git -C <project-root>/<key> <porcelainArgs...>
```

and compare with the `porcelain[key]` the scope helper recorded. Two keys can snapshot the same repository (a directory sub-workspace and the host `.`, or two directory sub-workspaces of one repository): compare each key on its own, and apply the report-file exemption per key. Keep the "before" result. Re-run it after every wave (§5), the last one included, or once before writing in `--quick` (§8), always with this `git -C` command and never by calling `review-scope.js` again (§1). The diff directory ignores itself, so it never shows up here. Any difference other than the one pending report file sets `verdict: blocked` with reason `working_tree_changed` and names the wave and the reviewers that were running. This is detection only: never revert anything.

## 3. Routing

For each slice with a non-empty `files`, pass that slice's `routingPaths`:

```text
bun .specify/scripts/ts/src/index.ts routing phase-delegates resolve --project-root <project-root> --domain review --path <slice.routingPaths...>
```

Result `{ skills[], agents[] }`, kept under `slice.id` in returned order. Never union or deduplicate delegates across slices: the same agent returned for two slices is two separate assignments. A slice receives exactly what the resolver returns for its own paths, which includes ancestor and root (`.`) sections and the global fallback when the resolver applies it, never a sibling slice's section. `review` is an explicit domain: this skill only reads it. It never registers, edits, or injects routes (D10). An empty result is normal.

## 4. Readiness (Tier 1)

Run the Tier 1 static readiness check exactly as written in `tdk-implement/references/phase-execution.md` (`### Delegate Skill Loading Requirement`) for `@tdk-code-reviewer` and for every routed agent. Do not reimplement or loosen it.

- A reviewer or routed agent that is not ready is recorded `skipped` with its reason code (`agent-not-found`, `skill-not-found`, `no-loader`, `unverified`). Never fall back to running it in the main session.
- A routed skill that is not ready is dropped from that reviewer's skills list and recorded the same way.
- A readiness result may be reused for the same locator, but every `skipped` or dropped outcome is recorded per slice assignment, so no assignment and no reason is lost.
- If `@tdk-code-reviewer` itself is not ready in standard or deep mode, STOP with the Tier 1 failure block (no `/tdk-review` report is possible without a reviewer). `--quick` does not need it.

## 5. Dispatch by mode

### Batches

Split each slice's `changes[]` into **batches** before counting anything. Keep a batch's diff to about 60k tokens, counted as 12 tokens per added or deleted line: about a third of a 200k-token reviewer context, leaving the rest for the files it reads around the change, its skills and its output. This is a soft target for your judgment, not a hard limit. Group files by directory or module. Never split a file across batches, and never mix two slices in one batch; a file larger than the target is a batch of its own. A slice's stat-only files (`diffFile: null`) go in its first batch, so the reviewer sees them listed.

An **assignment** is (batch × lens) or (batch × ready routed agent of the batch's slice). Each assignment runs once; one run is an **invocation**. A retry is a second invocation of a `@tdk-code-reviewer` assignment, over only the files its first invocation left uncovered (§5, after each wave).

| Mode | Who reviews | Subagents |
|---|---|---|
| `--quick` | Main session, inline, slice by slice: it Reads the slice's diff files itself and applies the `spec` and `quality` lenses, with only that slice's ready routed skills loaded and applied. Routed agents are not dispatched | 0 |
| standard | `@tdk-code-reviewer` with `LENS=spec` and `LENS=quality`, plus each ready routed agent of the slice, for every batch of the slice | Σ slices (2 + ready routed agents of the slice) × batches |
| `--deep` | standard plus `LENS=security` and `LENS=reliability` | Σ slices (4 + ready routed agents of the slice) × batches |

`--quick` has no context isolation: never claim it in the report. Its Reviewers section names the routed agents that were not run. It has no batches, waves or coverage check.

Each invocation receives, inline: `TASK_ID`, `LENS` (or the routed agent name), the assignment header below, the spec excerpt (FR and SC IDs with text), each reviewed phase's `Success Criteria`, only that slice's ordered ready skill locators, and the focus text. The payload carries diff file paths, never diff text: the reviewer Reads its own diff files. `WORKING_ROOT` is the slice's `repos[].workingRoot`, already absolute. Each `FILES` line is one JSON object for one file of the batch, with every value JSON-encoded, and `diffFile` made absolute by joining the project root and the helper's `diffFile`, or `null` for a stat-only file. Wrap `WORKING_ROOT` and `FILES` (file names come from the repository) in `=== REVIEWED MATERIAL ===` fences.

```text
ASSIGNMENT slice=<slice.id> repo=<repoPath> sub_workspace=<subWorkspace or null> batch=<i>/<batch count of the slice>
=== REVIEWED MATERIAL ===
WORKING_ROOT <repos[].workingRoot>
FILES
{"path": "<change.path>", "added": <change.added>, "deleted": <change.deleted>, "diffFile": "<project-root>/<change.diffFile>"}
=== REVIEWED MATERIAL ===
```

`@tdk-code-reviewer` returns the JSON defined in `tdk-utils/agents/tdk-code-reviewer.md`, `filesReviewed` included. A routed agent is written by the consumer and may not know this input, so its prompt also carries, verbatim, the `## Reading the change` section of the installed `tdk-code-reviewer.md` (Read it once per run), and asks for the same schema with `filesReviewed`.

Never batch two slices into one invocation, and never pass one slice's skills or diff files to another slice's invocation.

### Waves

After readiness and before any spawn, count the invocations `N` with the formula for the mode, and print exactly once, for every `N`, as a line of your own reply text (never through `echo` or another command):

```text
Review plan: N invocations (+≤R retries) in W waves (≤8 per wave), ≥~Tk est. tokens
```

The report repeats this line at the top of its Reviewers section (`report-contract.md`). `W` is ⌈N / 8⌉ and does not count retry waves. `R`, the retry budget, is 24 − N when N ≤ 24, else 0. `T` is a lower bound: 15k tokens per invocation plus 24 tokens per added or deleted line of its batch, summed over every invocation.

- **N ≤ 24:** run the waves in order. A wave is at most 8 invocations sent in one message; wait for all of them before the next wave. Each reviewer's own completion notice is what you wait for: never schedule a wakeup, start a loop, or invoke this skill again while waiting.
- **N > 24:** STOP before spawning anything. Show a per-slice breakdown (slice id, batches, assignments, subtotal) with the estimate line, and ask once: "Run all" or "Stop". "Stop" ends the run: spawn nothing and write no report. "Run all" runs every wave with no retry budget. The breakdown may suggest `--phase NN` as an option that may help; it is not guaranteed to fit.
- Never ask a second time. Never drop files or agents, change the mode, or narrow the scope to fit the ceiling.

After each wave:

1. **File coverage.** For every `@tdk-code-reviewer` invocation of the wave, the files to cover are its batch's files with a `diffFile`; stat-only files never count. A (file × lens) pair is covered when that lens's invocation finished `ok` and either lists the file in `filesReviewed` or put `<path>: generated, not reviewed` in `notChecked`. A failed invocation covers none of its files.
2. **Retry.** Each `@tdk-code-reviewer` assignment with uncovered files gets one retry: the same batch, lens and header, with `FILES` cut down to those files, marked `retry`. Retries run after the planned waves, in waves of at most 8. When `R` is short, take them in lens order (`spec`, `quality`, `security`, `reliability`), then batch order. A file still uncovered after its retry, or left without budget, is a **file coverage gap** for that lens.
3. **Routed agents.** Their coverage is recorded on their Reviewers row, never retried. A routed agent that returns no `filesReviewed` is not failed for it.
4. **Integrity.** Re-run the snapshot of §2, after the last wave too. A difference stops the run here: dispatch no further wave or retry, and go to §7 with the findings of the waves that finished.

## 6. Validate findings

For every finding, in order:

1. `file` must be one of the files of the invocation's own batch, in its own repo. Otherwise → Not verified, even when the file appears elsewhere in the scope. In `--quick`, the slice reviewed inline is the invocation.
2. A `missing` finding must carry a `requirement_ref` present in `spec.md`. Otherwise → Not verified.
3. A finding without `evidence` (except `missing`, whose evidence is what was searched) → Not verified.
4. A reviewer that returned invalid JSON, `lens: "invalid"`, an `empty_or_malformed_input` note, or (for `@tdk-code-reviewer`) no `filesReviewed` is a failed reviewer: record `failed` with reason `invalid_output`, and keep its other output out of the findings.
5. **Changed region.** Take the file's changed regions from its `changes[].hunks`; never Read or search a diff file to find them. A finding whose `evidence` starts with `[deleted-line]` is about a deleted line: its `line` must fall in an old-side range (`oldStart` … `oldStart + oldLines − 1`), otherwise → Not verified. Any other `line` is in the change when it falls in a new-side range (`newStart` … `newStart + newLines − 1`); an added or untracked file is one hunk that covers all of it. Ranges include the diff's context lines (3 by default), so this is a near match, not an exact one. A finding outside every hunk whose evidence shows no link to the change → Not verified, reason `pre-existing`.
6. **Evidence of `critical` and `high`.** Read about ±3 lines around `file:line` in the current file under the repo's `workingRoot`, or, for a deleted line, its diff file, read in chunks until that hunk. If the `evidence` does not match → Not verified. Outside `--quick`, this is the only diff or file content the main session reads.

### Spec synthesis

Each `spec` invocation sees one batch, so its `partial` and `missing` mean "in this batch": they are evidence, never a final status. For each FR, SC and phase success criterion, merge the validated `implemented` and `partial` evidence and the `notChecked` entries of every `spec` invocation (every inline slice pass in `--quick`), then decide once:

- `implemented`: the merged evidence covers the criterion, even when every batch reported `partial` because it saw only its own part.
- `partial`: the merged evidence shows wrong or incomplete behavior.
- `missing`: every `spec` invocation finished `ok` and none shows any evidence for it.
- Otherwise it is a **spec coverage gap**: not evaluated, because an invocation failed or was skipped or because the part outside one batch was seen by no other batch.

A requirement implemented in another slice is never `missing`.

The per-batch `spec` rows are inputs to synthesis only. The synthesized per-criterion rows replace them in the matrix, Findings, `counts` and the verdict. A synthesized `partial` takes the highest severity among its contributing `partial` rows.

### Dedupe

Union the verified findings and dedupe by `(repoPath, file, line ±2, lens-agnostic title)`. The same path in two repos is never merged. Keep the highest severity and every contributor (lens, slice id and batch). If dedupe would merge findings that name different requirements, keep them separate.

Then number the deduped findings `F1`…`Fn` for the whole report: by severity (`critical` first, `low` last), then by `repoPath`, file and line. A `missing` finding has no location: within its severity it comes after the located findings, ordered by `requirement_ref`. A reviewer's own `id` stays inside its invocation and never reaches the report, and a Not verified finding gets no ID. `F<n>` is a finding ID of this report only; it is unrelated to the F-numbered rule labels in tdk-plan's references, such as F13.

## 7. Verdict

| Verdict | When |
|---|---|
| `blocked` | a git-map row with a branch and a recorded base that could not be diffed (`scope_incomplete`), empty scope, a working-tree change during review (`working_tree_changed`, possibly between waves: the findings of the finished waves still go in the report, with a note), or (standard and deep) every dispatched invocation failed or was skipped (`all_reviewers_failed`) |
| `changes_requested` | any `critical` or `high` finding, or any criterion `missing` after spec synthesis |
| `pass_with_concerns` | only `medium` or `low` findings, any spec coverage gap, any file coverage gap, or any unreviewed slice |
| `pass` | none of the above |

An **unreviewed slice** is one whose invocations all failed or were skipped. It, every spec coverage gap and every file coverage gap (§5) cap the verdict at `pass_with_concerns`, never `pass`, and are listed in the report. They add no `blocked_reason`. Stat-only files and files declared generated are not gaps.

## 8. Re-check, then write

The snapshot after the last wave (§5) is the final integrity check; in `--quick`, run it now. Apply §2's rule, then continue with `report-contract.md`. A `blocked` verdict is still written as a report. Leave the diff directory in place; the next run removes it.
