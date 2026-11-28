# Review orchestration

Algorithms for `/tdk-review`. The TS helpers own scope and routing decisions; this file only says how to call them and what to do with their output. Never restate or re-derive git-map, identity, fallback, or routing rules here.

## 1. Scope

```text
bun --no-install "<loaded-skill-root>/scripts/review-scope.js" --project-root <project-root> --feature-dir <FEATURE_DIR> [--phase NN]
```

Success JSON: `diffDir`, `repos[]` (the physical repositories), `slices[]`, `notReviewed[]`, `phases`, `porcelain`, `porcelainArgs`, `warnings`, `incomplete`, `empty`; no field carries diff text.

- Each of `slices[]` is one repo's files owned by one sub-workspace (`subWorkspace: null` when no configured path owns them). `files` are `repoPath`-relative; `routingPaths` are the same files in project coordinates, for routing only. Slice identity, ownership and coordinates belong to the helper: never re-derive, merge, re-split or re-map them; only splitting a slice into parts is yours (§5).
- `diffFile` is one file's whole diff, relative to the project root, inside `diffDir`; `hunks` (`oldStart`, `oldLines`, `newStart`, `newLines`) place a `file:line` without reading it. `materialFile` is the slice's reviewed material, or `null` for a stat-only slice. Never Read a diff or material file to put its text into a prompt: pass paths.
- A file with no content (an entry in `truncated`: binary, directory, unreadable, or an untracked file over 1 MB) has `diffFile: null` and no hunks: list it under Scope as "stat only", never as reviewed. A slice with no `diffFile` at all is never dispatched, counted, or treated as unreviewed.

- Exit 1 with `ok:false`: STOP and report `error`/`message`. Never narrow the scope yourself to get past `phase_in_progress` or `phase_not_done`. `diff_write_failed` means the helper could not use `reviews/.diff/`; never write the diffs anywhere else.
- `incomplete: true`: spawn nothing. Go to the write step with `verdict: blocked` and reason `scope_incomplete`, and list every `notReviewed[]` row with `blocking: true` under Scope with its reason.
- `empty: true`: spawn nothing. Go to the write step with `verdict: blocked` and reason `empty_scope`.
- List `notReviewed[]` rows under Scope with their reason; never treat them as an empty diff. `unmapped_in_mapped_repo` is a note, not a skipped row: its path was diffed against `HEAD` only, it never blocks, and it does not prevent `empty: true`.
- Surface every `warnings[]` entry in the report.
- Run the helper once per review: each call removes the previous run's diff directory, which reviewers and retries still read.

## 2. Integrity snapshot

Before dispatching anything, run for every key in `porcelain` (the directory the helper read, relative to the project root: usually a `repoPath`, or a `_worktrees/…` path for a git-map row with a worktree; `.` is the project root):

```text
git -C <project-root>/<key> <porcelainArgs...>
```

and compare with `porcelain[key]`. Compare each key on its own, even when two keys snapshot one repository, and apply the report-file exemption per key. Re-run it after the dispatch and again after the retry round when one ran (§5), or once before writing in `--quick` (§8), always with this `git -C` command and never by calling `review-scope.js` again (§1). Any difference other than the one pending report file sets `verdict: blocked` with reason `working_tree_changed`, naming the round and the reviewers that were running. This is detection only: never revert anything.

## 3. Routing

For each slice with a non-empty `files`, pass that slice's `routingPaths`:

```text
bun .specify/scripts/ts/src/index.ts routing phase-delegates resolve --project-root <project-root> --domain review --path <slice.routingPaths...>
```

Result `{ skills[], agents[] }`, kept under `slice.id` in returned order. Never union or deduplicate delegates across slices: the same agent returned for two slices is two separate assignments. A slice receives exactly what the resolver returns for its own paths (ancestor and root `.` sections and the global fallback included), never a sibling slice's section. `review` is an explicit domain this skill only reads: it never registers, edits, or injects routes (D10). An empty result is normal.

## 4. Readiness (Tier 1)

Run the Tier 1 static readiness check exactly as written in `tdk-implement/references/phase-execution.md` (`### Delegate Skill Loading Requirement`) for `@tdk-code-reviewer` and every routed agent. Do not reimplement or loosen it.

- A reviewer or routed agent that is not ready is recorded `skipped` with its reason code (`agent-not-found`, `skill-not-found`, `no-loader`, `unverified`). Never fall back to running it in the main session.
- A routed skill that is not ready is dropped from that reviewer's skills and recorded the same way. Record every such outcome per slice.
- If `@tdk-code-reviewer` is not ready in standard or deep mode, STOP with the Tier 1 failure block, `--specialist` or not. `--quick` does not need it.

## 5. Dispatch by mode

| Mode | Who reviews |
|---|---|
| `--quick` | Main session, inline, slice by slice: it Reads the slice's diff files and applies `spec` and `quality`, with only that slice's ready routed skills. Routed agents are not dispatched. No subagent |
| standard | Per unit: the core reviewer `@tdk-code-reviewer` with `LENSES=spec,quality`, plus each ready routed agent of the slice |
| `--deep` | The same, with `LENSES=spec,quality,security,reliability` |

`--quick` has no context isolation, parts, retries or coverage check; never claim isolation.

### Units

A **unit** is a slice reviewed whole, or one part of a split slice. A slice with `diffLines` at most **X = 15000** is one unit. Above X, split its files that have a `diffFile` by module:

1. Group `changes[]` by first path segment, in order of first appearance; split a group over X by its next segment until each group is at most X or one file. A root file is a group of its exact path.
2. Merge consecutive groups greedily into parts of at most X; a file over X is its own part. Never split a file across parts.
3. Each such file is in exactly one part, and no entry of one part is a prefix of another's. Stat-only files are in no part.

A part's payload adds this fenced block; each `ONLY_PATHS` entry is a `changes[].path` copied verbatim, or a directory prefix of one ending in `/`.

```text
=== REVIEWED MATERIAL ===
PART <i>/<n>
ONLY_PATHS ["src/api/", "README.md"]
=== REVIEWED MATERIAL ===
```

### Payload

Each invocation receives, inline: `TASK_ID`, `LENSES` (none for a routed agent running alongside), `MATERIAL <project-root>/<slice.materialFile>`, a part's `PART` block, the spec excerpt (FR and SC IDs with text), each reviewed phase's `Success Criteria`, only that slice's ordered ready skill locators, and the focus text. It carries the material path, never diff text.

A routed agent running alongside, written by the consumer, also gets verbatim the `## Reading the change` section of the installed `tdk-utils/agents/tdk-code-reviewer.md` (Read once per run), and is asked for that agent's JSON with `lenses: ["routed"]`, `filesReviewed`, and each finding's `lens` set to the fitting one of the four.

Never give one invocation two slices, nor another slice's skills, routed agents or diff files. Other slices reach a reviewer only as the material's `OTHER_CHANGES`, which name current files, never diffs.

### `--specialist`

With the flag, in standard and deep mode, Read the frontmatter of each ready routed agent's canonical `<project-root>/.claude/agents/<name>.md`. It declares the full contract only with `review_contract: full` under `metadata`; the OMP and Codex copies drop `metadata`, so never read them for this. A missing file or field, or another `name`, is no declaration, with a note. In each unit, the first declaring agent in resolver order gets the core reviewer's exact input, `LENSES` included, and replaces `@tdk-code-reviewer`; other routed agents still run alongside. A slice with no declaring agent runs as without the flag, with a note.

### Sending

Before any spawn, count the invocations of every unit: core reviewers, replacing agents and routed agents running alongside.

- **Up to 24:** send them all in one message.
- **Over 24:** first show a per-slice breakdown (slice id, parts, invocations), which may suggest `--phase NN`, and ask once: "Run all" or "Stop". "Stop" ends the run: spawn nothing and write no report. "Run all" sends them all in one message.
- Never ask a second time, the retry round included. Never drop files or agents, change the mode, or narrow the scope to fit.

Wait for each reviewer's own completion notice: never schedule a wakeup, start a loop, or invoke this skill again while waiting.

### After the dispatch

1. **Integrity.** Re-run §2. A difference stops the run: no retry; go to §7 with the findings returned.
2. **Failures** follow §6 rule 4.
3. **File coverage** (core reviewer and replacing agent): a slice file with a `diffFile` is covered when an invocation of its slice finished `ok` and lists it in `filesReviewed` or notes `<path>: generated, not reviewed`. A `<lens>: <path>: <reason>` note leaves it uncovered for that lens.
4. **Spec rows** (replacing agent): it misses one when an FR or SC ID of the spec excerpt is the `requirement_ref` of none of its `lens: spec` findings.
5. **Retry**: one round, sent in one message.
   - A failed core invocation reruns with the same input, replacing its unit's file retry.
   - Uncovered files: `@tdk-code-reviewer` with the same `LENSES` and an `ONLY_PATHS` of their exact paths, keeping the unit's `PART` line (`PART 1/1` without one).
   - A replacing agent that failed, was skipped or missed a spec row: `@tdk-code-reviewer` reruns its unit with the core reviewer's input, marked `fallback`, in place of that unit's file retry. A replacing agent is never invoked again.
   - The others are marked `retry`. Routed agents running alongside are never retried.
6. After the retry round, re-run §2 and check coverage again. A file still uncovered is a **file coverage gap** for its lens.

## 6. Validate findings

For every finding, in order:

1. `file` must be in the invocation's reviewed set (the `FILES` its `ONLY_PATHS` matches, or all of them), in its own repo. Otherwise → Not verified, even when the file appears elsewhere in the scope or in `OTHER_CHANGES`. In `--quick`, the slice reviewed inline is the invocation.
2. A `missing` finding must carry a `requirement_ref` present in `spec.md`. Otherwise → Not verified.
3. A finding without `evidence` (except `missing`, whose evidence is what was searched) → Not verified.
4. An invocation that returned invalid JSON, `lenses: ["invalid"]` or an `empty_or_malformed_input` note is failed; so is a core reviewer or replacing agent whose `lenses` differs from its `LENSES` or that returned no `filesReviewed`. Record it `failed` with reason `invalid_output`, and keep its other output out of the findings.
5. **Changed region.** Take changed regions from `changes[].hunks`; never Read or search a diff file to find them. A finding whose `evidence` starts with `[deleted-line]` is about a deleted line: its `line` must fall in an old-side range (`oldStart`, `oldLines`), otherwise → Not verified. Any other `line` is in the change when it falls in a new-side range (`newStart`, `newLines`); an added or untracked file is one hunk. Ranges include context lines. A finding outside every hunk whose evidence shows no link to the change → Not verified, reason `pre-existing`.
6. **Evidence of `critical` and `high`.** Read about ±3 lines around `file:line` in the current file under the repo's `workingRoot`, or, for a deleted line, its diff file, read in chunks until that hunk. If the `evidence` does not match → Not verified. Outside `--quick`, this is the only diff or file content the main session reads.

### Spec synthesis

Each invocation with `spec` in its `LENSES` sees one unit, so its `partial` and `missing` are evidence, never a final status. A routed agent running alongside adds evidence, never a `missing`. For each FR, SC and phase success criterion, merge the validated `implemented` and `partial` evidence and the `notChecked` entries of all of them, across parts and slices (every inline slice pass in `--quick`), then decide once:

- `implemented`: the merged evidence covers it, even when every unit reported `partial`.
- `partial`: the merged evidence shows wrong or incomplete behavior.
- `missing`: all of them finished `ok` and none shows any evidence.
- Otherwise a **spec coverage gap**.

A requirement implemented in another slice is never `missing`. The synthesized rows replace the per-invocation `spec` rows in the matrix, Findings, `counts` and the verdict; a synthesized `partial` takes the highest severity of its contributing `partial` rows.

### Dedupe

Union the verified findings and dedupe by `(repoPath, file, line ±2, lens-agnostic title)`. The same path in two repos is never merged, nor are findings that name different requirements. Keep the highest severity and every contributor (lens, slice id and part).

Then number the deduped findings `F1`…`Fn` for the whole report: by severity (`critical` first), then `repoPath`, file and line; a `missing` finding comes after the located findings of its severity, ordered by `requirement_ref`. A reviewer's own `id` stays inside its invocation and never reaches the report, and a Not verified finding gets no ID.

## 7. Verdict

| Verdict | When |
|---|---|
| `blocked` | a git-map row with a branch and a recorded base that could not be diffed (`scope_incomplete`), empty scope, a working-tree change during review (`working_tree_changed`), or (standard and deep) every dispatched invocation failed or was skipped (`all_reviewers_failed`) |
| `changes_requested` | any `critical` or `high` finding, or any criterion `missing` after spec synthesis |
| `pass_with_concerns` | only `medium` or `low` findings, any spec coverage gap, any file coverage gap, or any unreviewed slice |
| `pass` | none of the above |

An **unreviewed slice** is one whose invocations, retries included, all failed or were skipped. It and every spec or file coverage gap cap the verdict at `pass_with_concerns`, are listed in the report, and add no `blocked_reason`. Stat-only files and files declared generated are not gaps.

## 8. Re-check, then write

The last snapshot of §5 is the final integrity check; in `--quick`, run it now. Apply §2's rule, then continue with `report-contract.md`. A `blocked` verdict is still written as a report. Leave the diff directory in place; the next run removes it.
