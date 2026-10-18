# Review orchestration

Algorithms for `/tdk-review`. The TS helpers own scope and routing decisions; this file only says how to call them and what to do with their output. Never restate or re-derive git-map, identity, fallback, or routing rules here.

## 1. Scope

```text
bun --no-install "<loaded-skill-root>/scripts/review-scope.js" --project-root <project-root> --feature-dir <FEATURE_DIR> [--phase NN]
```

Success JSON: `repos[]` (`subWorkspace`, `repoPath`, `workingRoot`, `baseCommit`, `includesUncommitted`, `source`, `files`, `diffLines`, `truncated`), `slices[]` (`id`, `repoPath`, `subWorkspace`, `files`, `routingPaths`, `diffLines`, `truncated`, `pieces[]` with `index`, `files`, `diff`, `diffLines`, `oversized`), `notReviewed[]`, `phases` (`reviewed`, `skipped`), `porcelain`, `porcelainArgs`, `warnings`, `empty`.

- `repos[]` is the physical repository: base commit, working root, integrity, `files`, `diffLines`, `truncated`. It carries no diff text.
- `slices[]` is the unit of review: the files of one repo owned by one sub-workspace (`subWorkspace: null` when no configured path owns them). `files` are repo-relative evidence coordinates; `routingPaths` are the same files in project coordinates, for routing only. The diff text lives only in `pieces[].diff`: whole files packed to a 1500-line target, one file per piece when it alone is larger (`oversized: true`). A file with no content (a `truncated` directory or unreadable entry) is in no piece; a slice whose `pieces` is empty is listed as stat only and is never dispatched, counted, or treated as unreviewed. Slice identity, ownership, coordinates and packing belong to the helper. Never re-derive, merge, re-split or re-pack them.

- Exit 1 with `ok:false`: STOP and report `error`/`message`. `phase_in_progress` and `phase_not_done` mean the user must finish or pick a done phase; do not narrow the scope yourself to get past them.
- `empty: true`: spawn nothing. Go to the write step with `verdict: blocked` and reason `empty_scope`.
- `pieces[].diff` already contains the content of untracked files as new-file diffs, and `diffLines` counts it. Entries in `truncated` have `--stat` only: list them in the report under Scope as "stat only" and never claim they were reviewed.
- `notReviewed[]` rows are listed in the report under Scope, with their reason. Never treat them as an empty diff.
- Surface every `warnings[]` entry in the report.

## 2. Integrity snapshot

Before dispatching anything, run for every key in `porcelain` (a repo path relative to the project root; `.` is the project root):

```text
git -C <project-root>/<key> <porcelainArgs...>
```

and compare with the `porcelain[key]` the scope helper recorded. Keep the "before" result. Re-run after all reviewers return (step 7). Any difference other than the one pending report file sets `verdict: blocked` with reason `working_tree_changed` and names the reviewers that were running. This is detection only: never revert anything.

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

An **assignment** is (slice × lens) or (slice × ready routed agent of that slice), for slices with at least one piece. Each assignment runs once per piece of its slice; one run is an **invocation**.

| Mode | Who reviews | Subagents |
|---|---|---|
| `--quick` | Main session, inline, slice by slice: `spec` and `quality` lenses, with only that slice's ready routed skills loaded and applied. Routed agents are not dispatched | 0 |
| standard | `@tdk-code-reviewer` with `LENS=spec` and `LENS=quality`, plus each ready routed agent of the slice, all per slice × piece in parallel | Σ slices (2 + ready routed agents of the slice) × pieces |
| `--deep` | standard plus `LENS=security` and `LENS=reliability` | Σ slices (4 + ready routed agents of the slice) × pieces |

`--quick` has no context isolation: never claim it in the report. Its Reviewers section names the routed agents that were not run.

Each invocation receives, inline: `TASK_ID`, `LENS` (or the routed agent name), the assignment header below, the spec excerpt (FR and SC IDs with text), each reviewed phase's `Success Criteria`, the piece diff, only that slice's ordered ready skill locators, and the focus text. Wrap the reviewed material, including the `FILES` list (file names come from the repository), in `=== REVIEWED MATERIAL ===` fences. Reviewers return the JSON defined in `tdk-utils/agents/tdk-code-reviewer.md`. Routed agents are asked for the same schema.

```text
ASSIGNMENT slice=<slice.id> repo=<repoPath> sub_workspace=<subWorkspace or null> piece=<index>/<piece count>
=== REVIEWED MATERIAL ===
FILES <piece.files, one per line>
<piece.diff>
=== REVIEWED MATERIAL ===
```

Pass `piece.diff` verbatim, oversized pieces included. Never abridge, summarize, sample, or replace any part of it with a note.

Never batch two slices into one invocation, and never pass one slice's skills or diff to another slice's invocation.

### Budget

Pieces come from the scope helper with the same 1500-line target for lenses and routed agents. An `oversized` piece is reviewed as is, with its full diff, counted like any other piece, and disclosed in the report.

After readiness and before any spawn, compute the full count with the formula for the mode. The cap is **8 subagents per run**. Above it, STOP the whole run before spawning anything and show a per-slice breakdown (slice id, assignments, pieces, subtotal). You may suggest `--phase NN` as an option that may help; it is not guaranteed to fit. Never drop pieces or agents, change the mode, or narrow the scope to fit the cap.

## 6. Validate findings

For every finding, in order:

1. `file` and `line` must exist in the invocation's own piece (its `files` and its diff) of its own repo. Otherwise → Not verified, even when the file appears elsewhere in the scope. In `--quick`, the slice reviewed inline is the invocation.
2. A `missing` finding must carry a `requirement_ref` present in `spec.md`. Otherwise → Not verified.
3. A finding without `evidence` (except `missing`, whose evidence is what was searched) → Not verified.
4. A reviewer that returned invalid JSON, `lens: "invalid"`, or an `empty_or_malformed_input` note is a failed reviewer: record `failed`, keep its other output out of the findings.

### Spec synthesis

Each `spec` invocation sees one piece, so its `partial` and `missing` mean "in this piece": they are evidence, never a final status. For each FR, SC and phase success criterion, merge the validated `implemented` and `partial` evidence and the `notChecked` entries of every `spec` invocation (every inline slice pass in `--quick`), then decide once:

- `implemented`: the merged evidence covers the criterion, even when every piece reported `partial` because it saw only its own part.
- `partial`: the merged evidence shows wrong or incomplete behavior.
- `missing`: every `spec` invocation finished `ok` and none shows any evidence for it.
- Otherwise it is a **spec coverage gap**: not evaluated, because an invocation failed or was skipped or because the part outside one piece was seen by no other piece.

A requirement implemented in another slice is never `missing`.

The per-piece `spec` rows are inputs to synthesis only. The synthesized per-criterion rows replace them in the matrix, Findings, `counts` and the verdict. A synthesized `partial` takes the highest severity among its contributing `partial` rows.

### Dedupe

Union the verified findings and dedupe by `(repoPath, file, line ±2, lens-agnostic title)`. The same path in two repos is never merged. Keep the highest severity and every contributor (lens, slice id and piece). If dedupe would merge findings that name different requirements, keep them separate.

## 7. Verdict

| Verdict | When |
|---|---|
| `blocked` | empty scope, a working-tree change during review, or (standard and deep) every dispatched invocation failed or was skipped (`all_reviewers_failed`) |
| `changes_requested` | any `critical` or `high` finding, or any criterion `missing` after spec synthesis |
| `pass_with_concerns` | only `medium` or `low` findings, any spec coverage gap, or any unreviewed slice |
| `pass` | none of the above |

An **unreviewed slice** is one whose invocations all failed or were skipped. It and every spec coverage gap cap the verdict at `pass_with_concerns`, never `pass`, and are listed in the report. They add no `blocked_reason`.

## 8. Re-check, then write

Re-run the integrity snapshot, apply step 2's rule, then continue with `report-contract.md`. A `blocked` verdict is still written as a report.
