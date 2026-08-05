---
name: tdk-branch-preflight
description: "Ensure every affected sub-workspace repository stands on the agreed feature branch before implementation writes anything.
  Maps plan files to sub-workspace repositories, confirms base ref and branch name in one batched prompt,
  validates all repositories before creating any branch, and records the result in git-map.md for resume.
  Called by: tdk-implement (Step 6A).
  NOT user-invocable."
user-invocable: false
metadata:
  version: "4.1.0"
  category: "Git"
  input_format: "PROJECT_DIR (agent-resolved absolute project root), TASK_ID (validated), FEATURE_DIR, PROJECT_CONTEXT, TARGET_ROWS, host skill name"
  output_format: "GIT_MAP (sub-workspace to branch/worktree records) or STOP with a per-repository status report"
---

## Branch Preflight

Polyrepo projects declare sibling repositories in `PROJECT_CONTEXT.subWorkspaces[]`. Before implementation
mutates any phase status, every repository the plan touches must stand on the same agreed feature branch.
Resolve that state here, confirm it with the user in a single batched prompt, then hand a `GIT_MAP` back to
the host skill.

### Scope

- **Never create, checkout, or switch a branch in the root workspace repository.** The root repository holds
  spec, plan, and feature artifacts; it stays on whatever branch the user placed it on.
- Confirm before every branch or worktree creation. Never create silently.
- Prompt-driven only. Do not add scripts under `.specify/scripts/`.
- Use generic prefixes such as `sample` in all examples.

### Input Contract

Receive from the calling skill:

| Value | Meaning |
|---|---|
| `PROJECT_DIR` | Agent-resolved absolute project root |
| `TASK_ID` | Validated task ID (output of `tdk-validate-task-id`) |
| `FEATURE_DIR` | Resolved feature directory (output of `tdk-load-project-context`) |
| `PROJECT_CONTEXT` | Loaded config; read `subWorkspaces[]`, `featureEnv.mainBranch`, `featureEnv.defaultFolder` |
| `TARGET_ROWS` | The phase rows this run will execute; step 3 maps only these |
| host skill name | For error messages |

`PROJECT_CONTEXT` has no `git.*` key. Branch-related defaults live under `featureEnv.*`.

### Output Contract

Return `GIT_MAP` — the set of sub-workspace records (repository path, branch, base ref, worktree path) that
were verified or created — or STOP with a per-repository status report.

### Path Anchoring

`subWorkspaces[].path` is workspace-relative, so an unanchored `git -C apps/api …` resolves against whatever
directory the agent happens to sit in. A session opened inside a sub-workspace makes that command fail, and
makes `git worktree add _worktrees/…` *succeed* in the wrong place — creating a worktree inside a
sub-workspace and outside the root `.gitignore`.

- Take `PROJECT_DIR` from the host. Do not derive the project root from the environment or from the current
  directory.
- Anchor every command at execution time: `git -C "$PROJECT_DIR/<sub-path>" …`, worktrees at
  `"$PROJECT_DIR/_worktrees/<sub>/<worktree-name>"`, git-map at `"$PROJECT_DIR/$FEATURE_DIR/git-map.md"`.
- **git-map.md still stores workspace-relative paths** (`apps/api`, `_worktrees/web/feature-sample-001`).
  That file is committed; it must never contain machine-local absolute paths. The anchor is joined at
  execution time and never written into the file. Keep these two concerns separate — a well-meaning
  "consistency" edit that writes absolute paths into the artifact breaks it for every other machine.

The repository-identity check in step 3 compares two already-resolved toplevels. It is a comparison between
two repositories, not a project-root discovery mechanism.

### Value Validation

`spec.md` is committed, so anyone who opens a pull request controls its `feature_branch` value, and a reviewer
skimming YAML sees only a branch-shaped string. Treat every value that reaches a git command — branch name,
base ref, and `TASK_ID` — as untrusted input.

Apply three layers, in this order:

1. **Allowlist — this is the shield.** The value must match `^[A-Za-z0-9._/-]+$`. This is what stops command
   injection, and it also rejects `@{`, `~`, `^`, `:`, and whitespace. A value that fails the allowlist is
   treated as missing, which falls through to the documented fallback.
2. **Quoting — mandatory.** Interpolate values only through quoted shell variables (`"$BRANCH"`). Never
   inline a literal into a command. Every example below shows this form.
3. **`git check-ref-format` — secondary hygiene only.** Run it after the allowlist, in full-refname mode:
   `git check-ref-format "refs/heads/$BRANCH"`. It catches ref-grammar cases the allowlist lets through, such
   as a leading `-`, an embedded `..`, or a `.lock` suffix.

`git check-ref-format` is not a filter for shell metacharacters, and it must never be the only check. Verified
in this repository: `--branch` exits 0 for `a;b`, `` x`id` ``, `a|b`, `a&&b`, and `a$b`; full-refname mode
exits 0 for a backtick-bearing ref as well. Worse, `--branch` is a *resolver* rather than a validator —
`git check-ref-format --branch '@{-1}'` prints the SHA of the previous checkout and exits 0, so a spec
carrying `branch: "@{-1}"` would "validate" and then operate on an entirely different branch, one that varies
per machine. Use full-refname mode, never `--branch`.

Place the `--` separator according to what the command expects on each side, and never by reflex. For
commands whose positional arguments are refs — `git branch`, `git worktree add` — the separator precedes
them: `git branch -- "$BRANCH" "$BASE_REF"`. For `git checkout` and `git switch`, everything *after* `--`
is a pathspec, so the ref goes first and the separator follows it: `git checkout "$BRANCH" --`. Writing
`git checkout -- "$BRANCH"` does not switch branches; it asks Git to restore a *file* named like the branch,
which fails outright in the usual case and silently discards uncommitted changes when a path of that name
happens to exist.

### Flow

#### 1. Resume fast path

Read `{FEATURE_DIR}/git-map.md`. Check the frontmatter for `feature_branch` first — its absence means the
file is a **plan seed** (written by `/tdk-plan` Step 3e), not a previous run. A seed is not a resume: skip
straight to step 3, using its rows as the affected-repository set and its `Base ref` column as the per-repo
suggestion, both still subject to confirmation. Only a file carrying `feature_branch` is a resume.

For a resume, the record is a **hint, not ground truth** — it describes state that is only
real on the machine that created it. Re-verify every record against live git state before acting on it. A
record that disagrees with reality leads to a question, never to a destructive action.

If the file exists:

- **Root branch.** Read the live root branch with `git -C "$PROJECT_DIR" rev-parse --abbrev-ref HEAD` — the
  same command used wherever this document says "live root branch" — and compare it against the recorded
  `milestone_branch`. On a mismatch (the task belongs to milestone `epic-1`, the root sits on `epic-2`), raise
  the **same options offered in step 6**:
  STOP so the user switches the root themselves / update the record to the current root branch as a
  deliberate act / continue and keep the existing record. Preflight never switches the root itself. Do not
  hard-STOP here: the same divergence has an escape hatch in step 6, and the existing convention for branch
  mismatch elsewhere in TDK is warn-only. The durable source of truth for the milestone check is the spec's
  `milestone_branch`; git-map is only a hint.
- **Each recorded sub-repository.** Verify with `git -C "$PROJECT_DIR/<path>" rev-parse --abbrev-ref HEAD`,
  or confirm the worktree path exists and sits on the recorded branch. If every record matches, reuse it,
  ask nothing, and return.

**A partial record locks the branch name.** When git-map carries `feature_branch` in its frontmatter — the
mid-run crash case — repositories without a row continue through steps 4 to 7, but the branch name is no
longer an editable suggestion. Key this on the frontmatter field, never on row count: a plan seed has rows
too, and locking on those would freeze the name before the user ever saw it. Take it verbatim from the git-map frontmatter and display it **read-only** in the
batched prompt. Renaming requires `tdk-repo-worktree --cleanup` followed by a fresh run. Without this lock, a
rename on the second run splits the task in two: one repository on the recorded branch, another on the new
name, while the frontmatter holds only a single `branch:` field. The adopt path dies with it, because adopt
keys on "matches the expected name" and the branch left by the crash no longer matches.

**A sub-repository that diverges from its record takes one of three recovery paths. Never force-recreate.**

| Situation | Action |
|---|---|
| Branch exists, repository sits elsewhere | Check the branch out again. Do not create. |
| Branch is genuinely gone | Offer to recreate it from the base ref, warning that any history it held is lost. |
| Worktree gone, branch still present | Re-attach with `git -C "$PROJECT_DIR/<path>" worktree add "$PROJECT_DIR/<worktree-path>" "$BRANCH"` — **without** `-b`. |

When the re-attach fails with "already checked out", run `git -C "$PROJECT_DIR/<path>" worktree list` to
locate it. A stale entry (directory deleted by hand, git still tracking it) warrants an offer to run
`git -C "$PROJECT_DIR/<path>" worktree prune` and retry. A live checkout elsewhere means reporting its location and offering to use
it. Never force. Every path here goes through a confirmation prompt first.

#### 2. No-op guard

When `PROJECT_CONTEXT.subWorkspaces` is **empty or absent** (`length === 0`), return immediately without
prompting. Phrase the condition as "empty or absent", never as "the project has no `subWorkspaces`": config
loading always sets `subWorkspaces: config.subWorkspaces ?? []`, so the key is always present and a
missing-key test never fires — leaving single-repository projects to fall into an empty batched prompt.

#### 3. Map the affected repositories

When a plan seed exists, take the affected-repository set from its rows instead of re-deriving it, then
re-verify each one still exists and is a repository. Otherwise derive it here.

To derive: read `plan.md` and the phase files — valid at this point, because the host invokes this skill after
its confirmation step. **Read only the phase files for the rows this run will actually execute** (the host's
resolved target rows), not every phase in the plan. Under `--phase NN` the two differ, and mapping the whole
plan would create branches in repositories this run never touches. Collect every path under
`## Related Code Files` (Create/Modify/Delete) and match each
against `subWorkspaces[].path` by prefix. A path matching no sub-workspace belongs to the root; skip it.

Where a sub-workspace path is not a separate repository — its `git -C "$PROJECT_DIR/<path>" rev-parse
--show-toplevel` resolves to the same toplevel as `"$PROJECT_DIR"` — skip it and note it as a plain monorepo
directory.

**Sanitize before use:**

- Reject a sub-workspace `path` that is absolute or contains `..`, and STOP reporting bad config. The config
  schema does not block either.
- Sanitize `name` (no `/`, no `..`) before it becomes part of a worktree path.
- Put `TASK_ID` through the same filter. It reaches the fallback branch name, and the `ticketFormat` regex
  only constrains the parsing layer in code — it does not apply to a prompt-driven skill, and projects can
  relax it.

Show the derived repository set in the batched prompt so the user can correct it.

#### 4. Resolve the branch name

Read `feature_branch` from `{FEATURE_DIR}/spec.md` frontmatter, falling back to the legacy `branch` key for
specs written before the rename. When both are missing or fail the allowlist, fall back
to `<featureEnv.defaultFolder>/<TASK_ID>` — for example `feature/sample-001` — which matches the convention
already used elsewhere in TDK. Do not use `prefixList`; that is a ticket prefix, not a branch prefix.

**The resolved name is only a suggestion.** Present it editable in the batched prompt. **Do not enforce any
format on what the user types** — no `<folder>/<ticket>` shape, no required prefix. The three validation
layers above are the only constraint. The exception is a partial git-map record, which locks the name
(step 1). Whatever is agreed applies to every repository in the set and goes into git-map.

#### 5. Suggest a base ref

Per repository, take the suggestion from the git-map seed's `Base ref` column when one exists, falling back
to `PROJECT_CONTEXT.featureEnv.mainBranch`. Verify it exists on the remote after fetching — a seeded ref is a
plan-time intention that may have been deleted since, so it is confirmed here, never trusted blindly. When it does not, fall back to the remote default via
`git -C "$PROJECT_DIR/<path>" symbolic-ref refs/remotes/origin/HEAD`. When `origin/HEAD` is unset — common
for a remote added by hand — do not guess: leave the suggestion blank and ask the user to supply it.

A base ref edited by the user goes through the same three validation layers as the branch name. Where a
repository has more than one remote, show the full `<remote>/<branch>` form in the suggestion.

**Carry one variable, `BASE_REF`, holding the fully qualified `<remote>/<branch>`** — `origin/main`, never a
bare `main`. That is also what the git-map `Base ref` column stores. Every later comparison uses it: a bare
local name would let `cleanup` compare against a stale or absent local branch and conclude that a branch
holding unpushed commits is empty.

Fetch once per repository, here, before the batched prompt. Step 7 verifies rather than re-fetches.

#### 6. One batched prompt

Resolve the expected milestone first, from the spec's `milestone_branch` frontmatter field, and compare it
against the root workspace repo's live branch:

| Spec state | Behavior |
|---|---|
| Missing, empty, or still a placeholder | Treat as missing — the milestone line becomes a confirmation question |
| Present and matching the live root | The root line is informational only |
| Present and diverging | Raise the wrong-milestone warning with a remediation option |

The options are: STOP so the user switches the root themselves, or update the spec's `milestone_branch` to the
current branch as a deliberate act. That second option is a real scenario — a spec written before its
milestone branch existed, or a milestone that has since been merged. Never present a hard STOP with no way
forward.

Then ask **one** `AskUserQuestion` covering:

1. The root branch line, per the table above. Preflight never checks the root out.
2. The branch name suggestion — freely editable, no format enforcement, validated by the three layers.
   Read-only when a git-map record already locks it.
3. Each affected repository with its suggested base ref, confirmed or corrected line by line.

Do not ask per repository. Do not create anything silently.

Shape of the batched prompt for a two-repository project:

```json
{
  "questions": [
    {
      "question": "Root repository is on 'epic-1', matching the spec. Branch name for this task (edit freely):",
      "header": "Branch",
      "options": [
        {"label": "feature/sample-001", "description": "Suggested from spec frontmatter; edit via Other"},
        {"label": "Cancel", "description": "Stop before any branch is created"}
      ],
      "multiSelect": false
    },
    {
      "question": "Base ref for 'api' (apps/api)?",
      "header": "api base",
      "options": [
        {"label": "origin/main", "description": "featureEnv.mainBranch, verified on remote"},
        {"label": "origin/develop", "description": "Other branch present on remote"}
      ],
      "multiSelect": false
    },
    {
      "question": "Base ref for 'web' (apps/web)?",
      "header": "web base",
      "options": [
        {"label": "origin/develop", "description": "Remote default from origin/HEAD"},
        {"label": "origin/main", "description": "featureEnv.mainBranch"}
      ],
      "multiSelect": false
    }
  ]
}
```

When a git-map record locks the name, state that in the branch question text and drop the editable framing.

List the derived repository set in the prompt text and add an option to correct it, so a repository wrongly
included or missed by the path mapping in step 3 can be fixed before anything is created. Every question
carries a way out; cancelling any of them stops the run before the first branch exists.

**Write the git-map frontmatter immediately after this confirmation and before the first git command.** Write
`task_id`, the agreed `feature_branch`, the confirmed `milestone_branch`, and `created`, with an empty table. Deferring
`milestone_branch` to the end is unsafe: a crash after creating branches in some repositories leaves a file with
rows but no `milestone_branch`, so the resume check in step 1 has nothing to compare and the cross-epic guard is
skipped in silence. Should resume ever meet a git-map without `milestone_branch`, treat it as missing — confirm
and record it again. Do not skip the guard, and do not hard-STOP.

#### 7. Validate every repository, then create

Check all four conditions across the whole set before creating anything anywhere:

1. **Dirty working tree** — offer to stash and continue, to move to a worktree (which does not require a
   clean main checkout), or to STOP.
2. **Target branch already exists** — when it exists, is absent from git-map, and matches the expected name,
   offer to **adopt** it: accept the existing branch as this task's branch and record it. This is the escape
   hatch when a crash lost the record. A branch matching git-map is a resume, handled in step 1.

   **Verify the base before recording an adoption.** Run
   `git -C "$PROJECT_DIR/<path>" merge-base --is-ancestor "$BASE_REF" "$BRANCH"` and show
   `git -C "$PROJECT_DIR/<path>" log --oneline "$BASE_REF".."$BRANCH"` so the user sees what the branch actually
   contains. Skipping this accepts a stale same-named branch — left by an abandoned task or created by
   another tool at a different base — and runs the implementation on unexpected history.
3. **The fetch from step 5 succeeded** — `git -C "$PROJECT_DIR/<path>" fetch "$REMOTE"`. Verify here; do not fetch a second time.
4. **Busy repository** — the repository's current branch is neither `mainBranch` nor the target branch,
   meaning it sits on some other feature branch. Route it to step 8 *before* any create or checkout command.
   Never force a switch.

Once all four pass, create per repository:

```bash
git -C "$PROJECT_DIR/$SUB_PATH" branch -- "$BRANCH" "$BASE_REF"
git -C "$PROJECT_DIR/$SUB_PATH" checkout "$BRANCH" --
```

**Append the git-map row immediately after each repository succeeds.** Incremental rows are what make a
mid-run crash recoverable: the finished repositories carry records, and the next run resumes the remainder
instead of deadlocking. When repository *k* fails, STOP and report the state of each one — which have records,
which were never reached. Do not roll back automatically.

#### 8. Repository busy on another feature branch

Offer to delegate that repository to `tdk-repo-worktree`. Worktrees are opt-in. If the user declines both the
worktree and the switch, STOP.

**A worktree is a replacement working root, not a second declared path.** When sub-workspace `<sub>` has a
worktree, the paths declared in the phase file's `## Related Code Files` **stay workspace-logical**
(`apps/web/src/foo.ts`). Record the worktree in git-map's `Worktree path` column; the host injects it at
dispatch as a working-root override — "for sub-workspace `web`, the working root is
`_worktrees/web/feature-task-1/`" — and the agent translates `apps/web/src/foo.ts` to
`_worktrees/web/feature-task-1/src/foo.ts` when reading and writing. See
`references/git-map-contract.md` for how `<worktree-name>` is derived.

Worktree paths are not declared in phase files, for two independent reasons. A phase file is written at plan
time, while "is this repository busy" is implementation-time state, so the plan cannot know. And the plan
gate would reject it anyway: `/tdk-plan` runs the write-disjointness check in validate-only mode, that mode
includes the gitignore step, and `_worktrees/` must be gitignored — so a declared worktree path fails as an
ignored write path.

Two consequences to keep in mind: the branch re-verify command and the final `git diff` review must both
point at the **translated** root, not at `apps/web`. And the write-disjointness checker validates *declared*
paths, not the paths actually written — it is a cooperative policy backed by report review, not a filesystem
sandbox. The override therefore relies on agent compliance; nothing enforces it.

#### 9. Close the record

The frontmatter was written in step 6 and the rows were appended in step 7. Verify the file matches live git
state and fill the `Worktree path` column for any repository using an override.

### Delegation

Invoke `tdk-repo-worktree` with `PROJECT_DIR`, the task ID, the target sub-workspace, the agreed branch name,
and the already-confirmed base ref. A delegated call must not re-ask for the base ref — each base ref is
confirmed exactly once, either here or in the standalone worktree flow.

### Additional Resources

- **`references/git-map-contract.md`** — git-map.md file format, write ordering, hint semantics, and the
  shared worktree-name derivation rule.
