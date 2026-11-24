# Report contract

What `/tdk-review` writes, and how. The writer is the bundled helper; the skill never writes the report any other way.

## Frontmatter

Keys are fixed. `tdk-retro-collect` reads `{FEATURE_DIR}/reviews/*.md` unchanged.

```yaml
---
task_id: pref-001
generated_at: 2026-10-11T09:05:07+07:00   # ISO 8601 with offset
mode: standard            # quick | standard | deep
scope: full               # full | phase-NN
focus: ""                 # the user's focus text, redacted; empty when none
verdict: changes_requested   # pass | pass_with_concerns | changes_requested | blocked
blocked_reason: ""        # scope_incomplete | empty_scope | working_tree_changed | all_reviewers_failed; empty unless blocked
repos:
  - sub_workspace: api    # null when the repo is not a sub-workspace
    repo_path: apps/api
    base_commit: <sha>
    includes_uncommitted: true
    source: git-map       # git-map | fallback
reviewers:
  - name: tdk-code-reviewer
    lens: spec            # spec | quality | security | reliability; routed agents use their name and lens "routed"
    status: ok            # ok | failed | skipped
    reason: ""            # reason code when failed or skipped, e.g. no-loader, agent-not-found, invalid_output
    skills_loaded: ["/my-lens"]
counts: { critical: 0, high: 1, medium: 2, low: 3, missing: 1 }
---
```

`counts` covers verified findings only. `implemented` matrix rows are `low` and are not counted as defects.

`reviewers[]` stays one entry per (name, lens), aggregated over every slice and batch. Each assignment (batch × lens, or batch × routed agent) counts with the result of its last invocation, so a retry that succeeds lifts it: `status: ok` when every assignment ended ok, otherwise `failed` when any assignment ended failed, else `skipped`, with the reason of the first assignment in that status; `skills_loaded` is the union in slice order. Waves, batches and per-invocation detail go in the body, never in new frontmatter keys.

## Sections, in order

Write each section as a `##` heading with exactly its bold name below and no number: `## Proposed Fix Phases`, never `## 7. Proposed Fix Phases`. `/tdk-status` and the write helper find the Ready line by that heading.

1. **Summary**: verdict, one paragraph, counts.
2. **Scope**: repos with base commit and `source` (label `fallback` explicitly), slices (id, repo, sub-workspace, files, diffLines, batch count), reviewed phases, skipped phases, `Not reviewed` rows with reasons, `stat only` files from `truncated` (binary, directory, unreadable, or an untracked file over 1 MB), **Generated, not reviewed** (each file a reviewer declared generated, with the lens that declared it, or `None.`), and any scope warnings. Never list `reviews/.diff/` as a change.
3. **Reviewers**: in standard and deep mode, first the `Review plan:` line of `review-orchestration.md` §Waves, exactly as computed before the first spawn. Then one line per invocation: reviewer, lens, `wave`, slice id, repo, sub-workspace, `batch i/n`, files with `+added/−deleted`, status, reason code if any, the skills actually loaded, and `retry` when it re-ran an earlier invocation over the files that one left uncovered. A failed first invocation that a retry rescued keeps its own line. A routed agent's line also names the batch files missing from its `filesReviewed`. Then **Unreviewed slices**: each slice whose invocations all failed or were skipped, with their reasons, or `None.`. Then **File coverage gaps**: each (file × lens) pair still uncovered after its retry, with the reason, or `None.`; a routed agent's gaps stay on its own line. In `--quick`, one row per slice reviewed inline, stating that no subagent ran, plus the routed agents that were not run.
4. **Spec Compliance Matrix**: one row per FR and SC ID and per phase success criterion, with the status decided by spec synthesis: `implemented | partial | missing | extra`, plus `file:line` evidence or the `requirement_ref` for `missing`. A `missing` row shows no location. Then **Spec coverage gaps**: each criterion left unevaluated, with its ID, why (the `notChecked` reason, or the failed or skipped invocation) and the slice ids involved, or `None.`.
5. **Findings by severity**: `critical`, `high`, `medium`, `low`. Each finding has an ID `F<n>`, unique within the report and numbered as `review-orchestration.md` §Dedupe says, then `file:line` (prefixed with its `repoPath` whenever the run has more than one repo), contributing lenses and invocations, evidence (≤5 lines), and recommendation. When the run stopped between waves (`working_tree_changed`), say so here: the findings of the waves that finished are still listed.
6. **Not verified**: findings that failed validation, with the failing rule. They carry no ID, are not counted, never drive the verdict and never join a fix group.
7. **Proposed Fix Phases**: see below.
8. **Next actions**: the Ready line again, exactly as in Proposed Fix Phases. A `blocked` report has no Ready line: its Next action is `/tdk-review <task-id>`, once the cause is fixed.

## Proposed Fix Phases

Group the verified findings into fix groups, one block per group. `/tdk-plan` reads these blocks through the Ready line, so keep the labels exactly as shown:

```markdown
### G1: <short title>
- Description: <one paragraph>
- Findings: F2, F5
- Dependencies: none
- Related Code Files:
  - Modify: `apps/api/src/orders.ts`
  - Create: `apps/api/src/orders.test.ts`
```

- **`G<k>`**: groups are numbered from 1 in the order written.
- **Description**: one paragraph. It MUST NOT contain any `--` token, because `/tdk-plan` strips flags from `USER_CONTENT` and a `--` inside would be parsed as one.
- **Findings**: the IDs of the group's findings. Every verified finding is in exactly one group.
- **Dependencies**: `none`, existing phase numbers (`phase 03`), or groups written earlier (`G1`). A group never points at a later group.
- **Related Code Files**: `Modify:` for a file that exists, `Create:` for a file the fix must add. Each path is project-relative: the finding's `repoPath` joined with its file, or the file alone when `repoPath` is `.`. A group of `missing` findings may leave the list empty; the planner infers its files.

Grouping rules:

- Findings that write the same file share a group.
- Never chain groups through a hub or shared file: a barrel `index.*`, a manifest, a README, a CHANGELOG, a lockfile or a root config file. Two groups that meet only in such a file stay two groups; `/tdk-plan` shows their conflict.
- Never merge across configured sub-workspaces.
- Each `missing` finding is its own group, keyed by its `requirement_ref`.

After the last group, write the report's one Ready line, alone on its line:

```text
/tdk-plan <task-id> "reviews/{{TDK_REVIEW_REPORT_FILE}}"
```

Fill in `<task-id>` and keep `{{TDK_REVIEW_REPORT_FILE}}` literal. When it writes the report, the helper replaces the placeholder with the report's own file name. It does so only on a line that is exactly this command, optionally as a bullet, after a `**Ready line**:` label or inside backticks, and only below the last heading that names this section. A finding's evidence that quotes the command or the heading therefore stays as written. Next actions repeats the same line.

No findings → write `None.` under this heading, and no Ready line.

A `blocked` report has no Ready line. When the run stopped between waves (`working_tree_changed`), still write the groups of the finished waves, for reference.

The Ready line is a suggestion. `/tdk-plan` reads the report through it, re-splits the groups by the files they write and shows one confirm table. This skill never runs it.

## Redaction

The sanitizer runs once, on the final rendered report inside `review-write-report.js`, after findings validation has finished, so it never alters the `file:line` evidence that validation relies on. `review-write-report.js` runs the report through the skill's own sanitizer (`scripts/review-redaction.ts`) before it writes and returns the count as `redactions`. Secrets, credential URLs, internal hosts and machine paths (home, temp, system and CI roots, Windows drive, Cygwin `/cygdrive/<drive>`, Git Bash `/<drive>/Users` or `/<drive>/home`, UNC and `file://` paths) become `[REDACTED:<category>]`, as do root-relative URLs whose query carries a signed-URL or credential key. Slash commands, skill locators, URL routes and HTML tags stay unless they contain a machine-root segment (for example `/media/123`), so the Ready line stays copy-pasteable. A `file:line` pointer stays intact when its extension is in the sanitizer's allowlist; with another extension, for example `auth.conf:3`, it may still be redacted when the file name contains a credential word. Do not build a second sanitizer. Before piping, still keep absolute machine paths out (repo-relative only) and do not copy raw diff or status dumps beyond the ≤5-line evidence excerpts; the marker categories are those `review-redaction.ts` emits. Mention a non-zero `redactions` in the summary you print.

## Slug and write

Slug: `<focus-slug | phase-NN | full>-<mode>`. Lowercase kebab-case, at most 50 characters. If the focus text looks credential-bearing, STOP and ask for a sanitized focus without echoing it.

Send the redacted report on stdin, as a quoted heredoc attached to the writer command itself, so the write stays one command. An allow rule for the writer matches it while the command is short enough for the harness to check; a long report may still ask for approval once:

```text
bun --no-install "<loaded-skill-root>/scripts/review-write-report.js" --project-root <project-root> --feature-dir <FEATURE_DIR> --slug <slug> <<'TDK_REVIEW_REPORT_EOF'
<the redacted report>
TDK_REVIEW_REPORT_EOF
```

Never pipe it from `cat` or another command, and never put the body in an argument or environment variable. No report line may equal the delimiter.

Output `{ "ok": true, "path": "...", "redactions": N }` or `{ "ok": false, "error": "..." }`.

| Error | Meaning | Action |
|---|---|---|
| `collision_exists` | A report with the same second and slug exists | STOP. Ask for a different focus or slug. Never retry. The first report is untouched. |
| `invalid_slug` | Slug not lowercase kebab-case or over 50 chars | STOP. Pick a valid slug with the user. |
| `unsafe_output_path` | `reviews/` is a symlink or file, or the feature dir is outside the project | STOP. Report it; never write elsewhere. |
| `write_failed` | I/O failure | STOP. Report it. |
| `invalid_arguments` | Missing or unknown flag | STOP. This is a skill bug; report it. |

The helper creates only `reviews/` and only the new file. The scope helper also writes per-file diffs under `reviews/.diff/`, a directory that ignores itself, so the report stays the single change the working-tree check sees.
