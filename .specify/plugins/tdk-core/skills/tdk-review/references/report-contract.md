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
blocked_reason: ""        # empty_scope | working_tree_changed | all_reviewers_failed; empty unless blocked
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

`reviewers[]` stays one entry per (name, lens), aggregated over every slice and piece: `status: ok` only when every invocation of that reviewer and lens was ok, otherwise `failed` when any invocation failed, else `skipped`, with the reason of the first invocation in that status; `skills_loaded` is the union in slice order. Per-invocation detail goes in the body, never in new frontmatter keys.

## Sections, in order

1. **Summary**: verdict, one paragraph, counts.
2. **Scope**: repos with base commit and `source` (label `fallback` explicitly), slices (id, repo, sub-workspace, files, diffLines, piece count), reviewed phases, skipped phases, `Not reviewed` rows with reasons, `stat only` files from `truncated`, and any scope warnings.
3. **Reviewers**: one row per invocation: reviewer, lens, slice id, repo, sub-workspace, piece `i/n`, files, diffLines, an `oversized` marker when set, status, reason code if any, and the skills actually loaded. Then **Unreviewed slices**: each slice whose invocations all failed or were skipped, with their reasons, or `None.`. In `--quick`, one row per slice reviewed inline, stating that no subagent ran, plus the routed agents that were not run.
4. **Spec Compliance Matrix**: one row per FR and SC ID and per phase success criterion, with the status decided by spec synthesis: `implemented | partial | missing | extra`, plus `file:line` evidence or the `requirement_ref` for `missing`. A `missing` row shows no location. Then **Spec coverage gaps**: each criterion left unevaluated, with its ID, why (the `notChecked` reason, or the failed or skipped invocation) and the slice ids involved, or `None.`.
5. **Findings by severity**: `critical`, `high`, `medium`, `low`. Each finding has an ID, `file:line` (prefixed with its `repoPath` whenever the run has more than one repo), contributing lenses and invocations, evidence (≤5 lines), and recommendation.
6. **Not verified**: findings that failed validation, with the failing rule. They are not counted and never drive the verdict.
7. **Proposed Fix Phases**: see below.
8. **Next actions**: the seed lines again, in the order to run them.

## Proposed Fix Phases

Group verified finding IDs into fix phases. Each group has:

- **Description**: one paragraph. It MUST NOT contain any `--` token, because `/tdk-plan` strips flags from `USER_CONTENT` and a `--` inside would be parsed as one.
- **Dependencies**: proposed phase dependencies (existing phase numbers).
- **Related Code Files**: `Modify:` lines only, repo-relative paths from the findings.
- **Ready line**: `/tdk-plan <task-id> "<description>"`.

No findings → write `None.` under this heading.

The seed is a suggestion. `/tdk-plan` Append shows it as a pre-filled description for one confirm. This skill never runs it.

## Redaction

The sanitizer runs once, on the final rendered report inside `review-write-report.js`, after findings validation has finished, so it never alters the `file:line` evidence that validation relies on. `review-write-report.js` runs the report through the shared sanitizer (the same one `/tdk-handoff` uses) before it writes, replaces secrets with `[REDACTED:<category>]`, and returns the count as `redactions`. Do not build a second sanitizer. Before piping, still keep absolute machine paths out (repo-relative only) and do not copy raw diff or status dumps beyond the ≤5-line evidence excerpts; the category list is in `tdk-handoff/references/redaction-patterns.md`. Mention a non-zero `redactions` in the summary you print.

## Slug and write

Slug: `<focus-slug | phase-NN | full>-<mode>`. Lowercase kebab-case, at most 50 characters. If the focus text looks credential-bearing, STOP and ask for a sanitized focus without echoing it.

Pipe the redacted report to the helper on stdin. Never put the body in an argument or environment variable.

```text
bun --no-install "<loaded-skill-root>/scripts/review-write-report.js" --project-root <project-root> --feature-dir <FEATURE_DIR> --slug <slug>
```

Output `{ "ok": true, "path": "...", "redactions": N }` or `{ "ok": false, "error": "..." }`.

| Error | Meaning | Action |
|---|---|---|
| `collision_exists` | A report with the same second and slug exists | STOP. Ask for a different focus or slug. Never retry. The first report is untouched. |
| `invalid_slug` | Slug not lowercase kebab-case or over 50 chars | STOP. Pick a valid slug with the user. |
| `unsafe_output_path` | `reviews/` is a symlink or file, or the feature dir is outside the project | STOP. Report it; never write elsewhere. |
| `write_failed` | I/O failure | STOP. Report it. |
| `invalid_arguments` | Missing or unknown flag | STOP. This is a skill bug; report it. |

The helper creates only `reviews/` and only the new file. The report is the single permitted change to the working tree.
