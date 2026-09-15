---
name: tdk-branch-preflight
description: "Ensure every affected sub-workspace repository stands on the agreed feature branch before implementation writes anything.
  Maps plan files to sub-workspace repositories, confirms base ref and branch name in one batched prompt,
  validates all repositories before creating any branch, and records the result in git-map.md for resume.
  Called by: tdk-implement (Step 6A).
  NOT user-invocable."
user-invocable: false
metadata:
  version: "4.2.2"
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
- **Never create, checkout, or switch a branch in the builder root or in the artifact host.** The builder
  root is whatever outer directory the session was launched from; the artifact host is the directory
  holding `.specify/.specify.json`, where spec, plan and feature artifacts live. Both stay on whatever
  branch the user placed them on. Read-only probes are allowed. Branch mutation happens only in a **code
  repository** — a `subWorkspaces[].path`, or the artifact host itself on a single-repository project.
  The three roles are defined in `references/git-map-contract.md`; the identity gate that enforces this
  is in step 3, and a path that fails it is a STOP, not a warning.
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
them: `git branch -- "$BRANCH" "$BASE_COMMIT"`. For `git checkout` and `git switch`, everything *after* `--`
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

- **Artifact host branch.** Informational only. Report it, never compare it against a milestone: a
  milestone belongs to a code repository, and the artifact host is not one of them.
- **Each recorded sub-repository.** Classify its row using the six row states in
  `references/git-map-contract.md`, and evaluate in this order — the order matters, and it is the same
  precedence `status` uses for `milestoneState`:

  | Order | Row | Check | On divergence |
  |---|---|---|---|
  | 0 | `base_commit_by_repo[<sub>]` present but invalid | none — this is a blocking validation error | **STOP and reconfirm.** No mutation. Do not degrade to comparing `Branch`, do not coerce the value away; leave it in the file for the user to see |
  | 1 | intent differs from the row's `Milestone` (`realized`, `realized-unverified`) | reconcile the new intent against the record | One confirmation, three outcomes — see below. Never fast-return past a changed intent |
  | 2 | `realized` | `git -C "$PROJECT_DIR/<path>" merge-base --is-ancestor "$BASE_COMMIT" "$BRANCH"`, and the repository sits on `$BRANCH` at its working root | the three recovery paths below |
  | 3 | `realized-unverified` (base key absent) | compare `Branch` only, and **warn** that the base cannot be verified | Do not recreate, and do not backfill the base from the milestone's current tip — the tip is now, the base is then |
  | 4 | `cleaning` | read `cleaned_by_repo` to see how far the previous cleanup got | Continue from there using the original `worktree_path`, or cancel explicitly. Never fast-resume, never treat it as realized, and do not demand `reset` — an unfinished cleanup has nothing to reset yet |
  | 5 | `cleaned` | re-verify live before honouring the marker | Live really gone: require `reset`. Live still there, on `$BRANCH`, containing `$BASE_COMMIT`: ask once to reconcile. Never lock unconditionally |
  | 6 | `pending` (`Branch` unusable) | nothing to resume | Continue through steps 4 to 7, with the branch name read-only |

  Ancestry is checked against the recorded **base commit**, never against the milestone's current ref. A
  milestone that gained a commit after the branch was cut is normal, and comparing against its tip
  reports every such branch as broken.

  Branch metadata, ancestry and `worktree list` are read at the **repository root**; HEAD and dirty state
  are read at the **working root** — the recorded worktree when it still exists, otherwise the repository.
  A recorded worktree that has been deleted is a recoverable state, not a dead end.

  If every record matches and no intent has changed, reuse it, ask nothing, and return.

  **Reconciling a changed intent** has exactly three outcomes, and each one writes something, so the
  question is asked once rather than on every resume:

  | Choice | Written |
  |---|---|
  | Update the record to the spec | the row's `Milestone` becomes the new intent; `base_commit_by_repo` is left alone, because the base that was actually used is history |
  | Bring the spec back to the record | `spec.milestone_branch[<sub>]` becomes the row's `Milestone` |
  | STOP | nothing — and it is asked again next time, correctly, because nothing was decided |

  There is no "accept the difference and write nothing": that leaves a state the file cannot express
  and asks the same question forever.

**A partial record locks the branch name.** When git-map carries `feature_branch` in its frontmatter — the
mid-run crash case — repositories without a row continue through steps 4 to 7, but the branch name is no
longer an editable suggestion. Key this on the frontmatter field, never on row count: a plan seed has rows
too, and locking on those would freeze the name before the user ever saw it. Take it verbatim from the git-map frontmatter and display it **read-only** in the
batched prompt. Renaming requires `tdk-repo-worktree cleanup` followed by `tdk-repo-worktree reset`,
which returns the rows to `pending` and releases the task-level `feature_branch` once no realized row
remains. Without this lock, a
rename on the second run splits the task in two: one repository on the recorded branch, another on the new
name, while the frontmatter holds only a single `branch:` field. The adopt path dies with it, because adopt
keys on "matches the expected name" and the branch left by the crash no longer matches.

**A sub-repository that diverges from its record takes one of three recovery paths. Never force-recreate.**

| Situation | Action |
|---|---|
| Branch exists, repository sits elsewhere | Check the branch out again. Do not create. |
| Branch is genuinely gone | Offer to recreate it from the recorded **base commit**, warning that any history it held is lost. Never from the milestone's current ref. |
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

**Verify repository identity before anything may be mutated or dispatched.** Rejecting `..` and absolute
paths filters *strings*; it does not establish that a path is the repository it claims to be. A clean
relative path such as `apps/api` can be a symlink to the builder root, and a `Worktree path` can be an
independent clone that shares the branch name and the whole history. Both pass every check above, and
both end with commands running against the wrong repository.

Apply the identity gate from `references/git-map-contract.md` — containment in the workspace, the
repository root being neither the builder root nor the artifact host, a shared `--git-common-dir`
between working root and repository root, and registered membership in `worktree list --porcelain`.
A failure here is a **STOP**, not a warning, and nothing is mutated.

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

#### 5. Prepare per-repository intent candidates

Treat a plan seed's `Base ref` as a prompt hint, not as a verified base. Resolve each repository's
milestone by the precedence in `references/git-map-contract.md`, then prepare the source choices that the
single prompt must confirm:

- For a confirmed milestone with an upstream, retain the upstream's full ref verbatim. Never rebuild it
  from the local branch name, and never assume the remote is `origin`.
- For a confirmed milestone without an upstream, offer its fully qualified local branch. This is a
  local-only candidate and needs no network operation.
- With no confirmed milestone, identify the candidate remote explicitly. A seed may suggest it; otherwise
  use the sole configured remote, or ask when several exist. With no remote, offer
  `refs/heads/{featureEnv.mainBranch}` only when it resolves locally; otherwise mark the base unresolved.

Do not carry a mutable `BASE_REF` through later steps. Do not fetch merely to make a prompt suggestion, and
never call `fetch` or `symbolic-ref refs/remotes/...` with an empty remote. Every candidate is rendered with
its full namespace so a local branch, an upstream, and a remote default cannot be confused.

#### 6. Confirm intent, resolve the canonical triples, and publish it atomically

Ask **one** `AskUserQuestion` covering:

1. The artifact host's branch, labelled plainly as the artifact host and marked informational. Preflight
   never checks it out and never treats it as a child repository's milestone.
2. The branch name suggestion — freely editable, with no format enforcement beyond the three validation
   layers. Keep it read-only when an existing git-map record locks it.
3. Every affected repository, named by sub-workspace and path, with its milestone and its source choice
   (upstream, local-only branch, selected remote, or no-remote local `mainBranch`). Include a correction
   path for the derived repository set and an exit path for the whole batch.

Do not ask per repository. Do not create anything silently. A no-remote repository whose local `mainBranch`
does not resolve has no selectable canonical base: require the user to resolve it in this batch or STOP.

After the user confirms the final intent, discard all earlier candidates and resolve the canonical
`(Base ref, Base commit, kind)` triple for **every** repository using the Base resolution table. For a
`remote` triple, fetch the explicitly selected non-empty remote exactly once with
`GIT_TERMINAL_PROMPT=0`, then resolve the fully qualified ref and its commit. For a `local` triple, resolve
the local ref without fetching. A confirmed upstream remains verbatim, including a non-`origin` remote.
Any ref or commit that fails to resolve is a STOP for user resolution; do not write a `-` base commit and do
not substitute a different ref.

**Before the first git command that mutates anything, atomically publish the complete intent.** Publish
`task_id`, the agreed `feature_branch`, the milestone map for the **whole** confirmed repository set,
`base_commit_by_repo` containing every resolved commit, and `created`, with an empty table. Use the atomic
publication rule in `references/git-map-contract.md`: build and validate the complete content, write a
same-filesystem temporary file, `fsync`, then rename. A missing commit is an omitted map key only while the
run is stopped awaiting resolution; it is never serialized as `-`.

#### 7. Validate every repository, then create

Check all four conditions across the whole set before creating anything anywhere:

1. **Dirty working tree** — offer to stash and continue, to move to a worktree (which does not require a
   clean main checkout), or to STOP.
2. **Target branch already exists** — when it exists, is absent from git-map, and matches the expected name,
   offer to **adopt** it: accept the existing branch as this task's branch and record it. This is the escape
   hatch when a crash lost the record. A branch matching git-map is a resume, handled in step 1.

   **Verify the base before recording an adoption.** Run
   `git -C "$PROJECT_DIR/<path>" merge-base --is-ancestor "$BASE_COMMIT" "$BRANCH"` and show
   `git -C "$PROJECT_DIR/<path>" log --oneline "$BASE_COMMIT".."$BRANCH"` so the user sees what the branch actually
   contains. Skipping this accepts a stale same-named branch — left by an abandoned task or created by
   another tool at a different base — and runs the implementation on unexpected history.
3. **The canonical base is usable**, as established from the triple published in step 6:

   | `kind` | Condition |
   |---|---|
   | `local` | The published Base commit still resolves in the repository. **No fetch is required** |
   | `remote` | The single step 6 fetch of the selected non-empty remote succeeded and the published Base commit still resolves from its published Base ref |

   Verify here; do not fetch a second time. Demanding a successful fetch for every repository is what
   stopped a repository whose milestone is a perfectly valid local branch — never pushed, or with an
   unreachable remote — from proceeding at all.

   The Base commit must be a commit of the Base ref resolved from the **current** intent. Step 6 already
   discarded every pre-prompt candidate, re-resolved the triple after confirmation, and atomically published
   it before this check. A missing base is a STOP, not a fallback or a `-` value.
4. **Busy repository** — the repository's current branch is none of `mainBranch`, the target branch, or
   **its own confirmed milestone**. A repository sitting on the milestone this task branches from is in
   the expected state, not a busy one; classifying it as busy stops the normal case. Anything else means
   it sits on some other feature branch: route it to step 8 *before* any create or checkout command.
   Never force a switch.

   This narrows the **branch** condition only. The dirty-working-tree condition in 1 is unchanged and
   still blocks — a repository on the right milestone with uncommitted changes is still not safe to
   branch from.

Once all four pass, create per repository. The start point is the **base commit**, never the ref name: a
ref can move, and a bare name can resolve to a tag.

```bash
git -C "$PROJECT_DIR/$SUB_PATH" branch -- "$BRANCH" "$BASE_COMMIT"
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
