# Review orchestration

Algorithms for `/tdk-review`. The TS helpers own scope and routing decisions; this file only says how to call them and what to do with their output. Never restate or re-derive git-map, identity, fallback, or routing rules here.

## 1. Scope

```text
bun --no-install "<loaded-skill-root>/scripts/review-scope.js" --project-root <project-root> --feature-dir <FEATURE_DIR> [--phase NN]
```

Success JSON: `repos[]` (`subWorkspace`, `repoPath`, `workingRoot`, `baseCommit`, `includesUncommitted`, `source`, `files`, `diff`, `diffLines`, `truncated`), `notReviewed[]`, `phases` (`reviewed`, `skipped`), `porcelain`, `porcelainArgs`, `warnings`, `empty`.

- Exit 1 with `ok:false`: STOP and report `error`/`message`. `phase_in_progress` and `phase_not_done` mean the user must finish or pick a done phase; do not narrow the scope yourself to get past them.
- `empty: true`: spawn nothing. Go to the write step with `verdict: blocked` and reason `empty_scope`.
- `repos[].diff` already contains the content of untracked files as new-file diffs, and `diffLines` counts it. Entries in `truncated` have `--stat` only: list them in the report under Scope as "stat only" and never claim they were reviewed.
- `notReviewed[]` rows are listed in the report under Scope, with their reason. Never treat them as an empty diff.
- Surface every `warnings[]` entry in the report.

## 2. Integrity snapshot

Before dispatching anything, run for every key in `porcelain` (a repo path relative to the project root; `.` is the project root):

```text
git -C <project-root>/<key> <porcelainArgs...>
```

and compare with the `porcelain[key]` the scope helper recorded. Keep the "before" result. Re-run after all reviewers return (step 7). Any difference other than the one pending report file sets `verdict: blocked` with reason `working_tree_changed` and names the reviewers that were running. This is detection only: never revert anything.

## 3. Routing

For each distinct sub-workspace in `repos[]` (use all `files` of that repo as paths):

```text
bun .specify/scripts/ts/src/index.ts routing phase-delegates resolve --project-root <project-root> --domain review --path <files...>
```

Result `{ skills[], agents[] }`, deduplicated across sub-workspaces in routing order. `review` is an explicit domain: this skill only reads it. It never registers, edits, or injects routes (D10). An empty result is normal.

## 4. Readiness (Tier 1)

Run the Tier 1 static readiness check exactly as written in `tdk-implement/references/phase-execution.md` (`### Delegate Skill Loading Requirement`) for `@tdk-code-reviewer` and for every routed agent. Do not reimplement or loosen it.

- A reviewer or routed agent that is not ready is recorded `skipped` with its reason code (`agent-not-found`, `skill-not-found`, `no-loader`, `unverified`). Never fall back to running it in the main session.
- A routed skill that is not ready is dropped from that reviewer's skills list and recorded the same way.
- If `@tdk-code-reviewer` itself is not ready in standard or deep mode, STOP with the Tier 1 failure block (no `/tdk-review` report is possible without a reviewer). `--quick` does not need it.

## 5. Dispatch by mode

| Mode | Who reviews | Subagents |
|---|---|---|
| `--quick` | Main session, inline: `spec` and `quality` lenses, with routed skills loaded and applied | 0 |
| standard | `@tdk-code-reviewer` with `LENS=spec` and `LENS=quality` in parallel, plus each ready routed agent | 2 + routed |
| `--deep` | standard plus `LENS=security` and `LENS=reliability` | 4 + routed |

Each reviewer receives, inline: `TASK_ID`, `LENS`, the spec excerpt (FR and SC IDs with text), each reviewed phase's `Success Criteria`, its diff slice inside the fenced block, the ordered routed skill locators, and the focus text. Wrap reviewed material in `=== REVIEWED MATERIAL ===` fences. Reviewers return the JSON defined in `tdk-utils/agents/tdk-code-reviewer.md`. Routed agents are asked for the same schema.

### Budget and splitting

Start with 1500 `diffLines` per reviewer. If a lens's slice exceeds that, split by sub-workspace first, then by file, and run the pieces as separate reviewers. Split reviewers count as one lens in the report. The cap is **8 subagents per run**: if the plan needs more, STOP and suggest `--phase NN` to narrow it.

## 6. Validate findings

For every finding, in order:

1. `file` and `line` must exist in the scope's `files` and its diff. Otherwise → Not verified.
2. A `missing` finding must carry a `requirement_ref` present in `spec.md`. Otherwise → Not verified.
3. A finding without `evidence` (except `missing`, whose evidence is what was searched) → Not verified.
4. A reviewer that returned invalid JSON, `lens: "invalid"`, or an `empty_or_malformed_input` note is a failed reviewer: record `failed`, keep its other output out of the findings.

Then union and dedupe by `(file, line ±2, lens-agnostic title)`. Keep the highest severity and list every contributing lens. If dedupe would merge findings that name different requirements, keep them separate.

## 7. Verdict

| Verdict | When |
|---|---|
| `blocked` | empty scope, a working-tree change during review, or every reviewer failed or was skipped |
| `changes_requested` | any `critical` or `high` finding, or any `missing` finding |
| `pass_with_concerns` | only `medium` or `low` findings |
| `pass` | none of the above |

## 8. Re-check, then write

Re-run the integrity snapshot, apply step 2's rule, then continue with `report-contract.md`. A `blocked` verdict is still written as a report.
