# git-map.md Contract

`git-map.md` lives at `{FEATURE_DIR}/git-map.md` and records, for each sub-workspace repository, which
milestone it branches from, which branch a task uses, and which working root it runs in. It is the shared
contract between `tdk-branch-preflight`, `tdk-repo-worktree`, and `tdk-implement`.

## Topology: three roles that must stay separate

Every rule below depends on telling these three apart. They coincide on a single-repository project, which
is why conflating them goes unnoticed there and corrupts a polyrepo.

| Role | What it is | Who reads it | May its branch be changed? |
|---|---|---|---|
| **Builder root** | The directory a session happens to be launched from. Often an outer repository that merely contains the project | Nothing in the TDK workflow | Never |
| **Artifact host** | The directory holding `.specify/.specify.json` of type workspace. Specs, plans and this file are read and written here | spec / plan / git-map | Never |
| **Code repo** | A `subWorkspaces[].path`, or the artifact host itself on a single-repository project | A phase's `## Related Code Files` | Yes — anchored with `git -C "$PROJECT_DIR/$SUB_PATH"` |

On a single-repository project the artifact host **is** the code repo. On a polyrepo they are different
directories, and the builder root is neither.

**A milestone is a property of a code repository, not of the workspace that stores the artifacts.** An
earlier model treated the artifact host's branch as the milestone for the whole task; that model is
superseded. Each repository carries its own milestone, and the artifact host's own branch is not a
milestone for anything but itself.

## Semantics: a hint, not a source of truth

The file is committed alongside `spec.md` and `plan.md`, so it travels with the feature. But its contents
describe **per-machine state** — a local branch and a worktree path only exist on the machine that created
them.

Every consumer — resume, list, cleanup, dispatch — re-verifies against live git state before acting. A record
that disagrees with reality produces a question, never a destructive action.

The durable source of truth for a repository's milestone is the spec's `milestone_branch` field. The
`Milestone` column and the `base_commit_by_repo` frontmatter map are **hints**: operational copies that make
resume cheap, and that lose to the spec whenever the two disagree.

## Path rules

Every path stored here is **workspace-relative** (`apps/api`, `_worktrees/web/feature-sample-001`). Absolute
paths are never written: the file is committed, and a machine-local path breaks it for everyone else.

Consumers join their own `PROJECT_DIR` at execution time. That anchor is never persisted.

## Milestone resolution

A repository's milestone is resolved by precedence, first match wins:

| # | Source | Condition |
|---|---|---|
| 1 | `spec.milestone_branch[<sub-name>]` | map form, with a key for that repository |
| 2 | The row's `Milestone` column | the row exists and the column has a value |
| 3 | `spec.milestone_branch` as a scalar | **only** when that repository is the artifact host — the legacy model |
| 4 | missing | ask once, in the existing batched prompt |

A scalar `milestone_branch` means "the artifact host's milestone, legacy model". It is **not** implicitly
applied to every child repository.

### Migration from scalar to map, exactly once

When a spec carries a scalar `milestone_branch` and the project has a non-empty `subWorkspaces`,
`/tdk-implement` asks **one** question inside the batched confirmation it already shows: apply this
milestone to every repository, or declare them separately. The answer is written back to the spec in map
form.

- Declining the migration performs **no mutation at all**.
- A second run does not ask again.

## Ref kind and base commit

A bare `Base ref` does not identify anything uniquely. A tag `epic-1` and a local branch `epic-1` can exist
at different commits at the same time, and git's disambiguation may pick the tag. A local branch named
`release/epic-1` is indistinguishable by shape from a `<remote>/<branch>` pair.

Therefore:

- **Never infer a ref's kind from the presence of `/`.**
- Each repository carries **two** values: `Base ref`, fully qualified with its namespace, and
  `Base commit`, the object name resolved at the moment the ref was confirmed.
- Namespaces are explicit: local is `refs/heads/<milestone>`; remote is `refs/remotes/<remote>/<branch>`,
  where `<remote>` is the remote actually confirmed for that repository — never a hard-coded `origin`.
- Every git command that creates a branch or a worktree uses the **`Base commit`**, never the ref name.
- `Base ref` is a table column. `Base commit` is the frontmatter map `base_commit_by_repo`, keyed by
  sub-workspace name — not a column.

## Object name validation

`base_commit_by_repo` values come out of a committed file, so they are untrusted input. Describing them as
"a SHA" in prose is not enough, and the existing branch validator does not constrain them: it checks a
character allowlist and rejects `..`, which **lets `HEAD` through**.

That matters because the resume invariant is `merge-base --is-ancestor <base-commit> <branch>`. With
`base_commit_by_repo: {api: HEAD}` the check passes unconditionally while standing on the branch, including
right after the branch was recreated from a different milestone.

| Constraint | Value |
|---|---|
| Grammar | a full object name in the repository's object format: `^[0-9a-f]{40}$` (sha1) or `^[0-9a-f]{64}$` (sha256). Abbreviated names are rejected |
| Object kind | must be a commit: `git -C <repo> cat-file -e "<sha>^{commit}"` |
| Forbidden | `HEAD`, `@`, any branch or tag name, `<rev>~n`, `<rev>^`, `:/text`, any revision expression |
| Validator | a dedicated function, for example `isValidObjectName`. **Do not** reuse the branch-ref validator |

Validation has two halves, and both run **before any row is classified**, independently of that row's
`Branch` value, its lifecycle state, and any intent comparison:

| Half | Where | Catches |
|---|---|---|
| Grammar | while parsing frontmatter, no repository needed | `HEAD`, revision expressions, abbreviated names, anything not 40/64 hex |
| Object kind | in the repository-aware pre-gate, `cat-file -e <sha>^{commit}` | a well-formed name that is a ghost from another repository, or names a blob or a tree |

The second half is not optional. A nonexistent object passes the grammar and then fails at
`merge-base --is-ancestor`, where the failure is **indistinguishable from honest ancestry drift** — so
a poisoned record would be reported as `drifted` and the user told to fix the milestone instead of the
record. Every caller holding a repository path must therefore supply it.

A key present with an invalid value is a **blocking validation error**: STOP and reconfirm. It is never
degraded to a legacy fallback and never coerced to `undefined`.

A row with `Branch = -` and `base_commit_by_repo: {api: HEAD}` therefore stops, rather than being read as
`pending`; and one carrying a ghost SHA reports `invalid`, not `drifted`.

The offending value is **left in the file** so the user can see it. Removing the key is a user action, and
only then does the row become `realized-unverified`.

## Row states

Six states, distinguished by the value of `Branch` and of the three frontmatter maps — **not** by whether a
row exists.

Classification is **ordered**. Before any row is classified, the object-name validator above runs. For data
that clears that pre-gate, read top-down; the first matching row wins.

| # | Row state | Recognised by | Meaning |
|---|---|---|---|
| — | *not a row state* | `base_commit_by_repo[<sub>]` present with an invalid value — whatever `Branch` says | Blocking validation error, not a lifecycle state |
| 1 | `seed` | frontmatter has no `feature_branch` | Intent only; nothing has been created |
| 2 | `cleaning` | `cleaning_by_repo[<sub>]` has a value — whether or not `cleaned_by_repo[<sub>]` does | Cleanup was confirmed but has not finished |
| 3 | `cleaned` | `cleaned_by_repo[<sub>]` has a value **and** `cleaning_by_repo[<sub>]` is absent | Cleaned, and verified complete |
| 4 | `pending` | `Branch` is not a usable ref — `-`, empty, or a value the allowlist rejected | Confirmed, but this repository has not been realized |
| 5 | `realized` | `Branch` is usable and `base_commit_by_repo[<sub>]` is present and valid | Created, and the base can be checked |
| 6 | `realized-unverified` | `Branch` is usable and `base_commit_by_repo[<sub>]` key is **absent** | Created, but there is no base to check against |

The table is closed: every input matches exactly one outcome. No `feature_branch` gives 1; otherwise
`cleaning_by_repo` present gives 2; absent with `cleaned_by_repo` present gives 3; with both absent the
`Branch` value decides 4, 5 or 6. Row 4 is the catch-all for any unusable `Branch`, not only the literal `-`.

**Cleaning intent outranks a partial result.** A half-finished cleanup writes *both* maps:
`cleaned_by_repo[<sub>] = worktree` because the worktree really is gone, while `cleaning_by_repo[<sub>]`
remains because the branch is not. Classifying on "has `cleaned_by_repo`" would report that failure as
finished, so state 2 is evaluated before state 3.

**`realized-unverified` covers an absent key only.** It arises from migrating an already-realized legacy
five-column map, which carries no object name to bring forward. Behaviour is to **degrade**: resume compares
`Branch` and warns that the base cannot be verified. It must not be silently treated as valid, must not
trigger a recreate, and must **not** be backfilled with the milestone's current tip — the tip is now, the
base is then, and filling it in manufactures a passing ancestry check.

`feature_branch` still locks the branch **name** for the task, but it no longer classifies individual rows.

## Base resolution

This table is the single definition. `/tdk-plan` Step 3e, `tdk-branch-preflight` and
`tdk-repo-worktree` all point here rather than restating it.

Each resolved tier yields the canonical triple `(Base ref, Base commit, kind)`. A configuration that has no
resolvable base yields no triple and stops for user resolution:

| # | Source | `kind` | `Base ref` | `Base commit` | Note |
|---|---|---|---|---|---|
| 1 | confirmed milestone **with an upstream** | `remote` | the **resolved upstream ref**, verbatim | that ref's commit | — |
| 2 | confirmed milestone, **local only** | `local` | `refs/heads/<milestone>` | that ref's commit | `local-only milestone` |
| 3 | **no** confirmed milestone, `<remote>/HEAD` resolves | `remote` | `refs/remotes/<remote>/<default>` | that ref's commit | — |
| 4 | no confirmed milestone, **no remote**, and local `featureEnv.mainBranch` resolves | `local` | `refs/heads/{featureEnv.mainBranch}` | that ref's commit | `no remote; seeded local mainBranch` |
| 5 | no confirmed milestone, no remote, and local `featureEnv.mainBranch` is absent | — | `refs/heads/{featureEnv.mainBranch}` | **omitted** | no canonical triple; require user resolution |
| 6 | no confirmed milestone, remote exists, and the fetch failed, HEAD is unset, or no deadline could be enforced | `remote` if the commit resolves; otherwise — | `refs/remotes/<remote>/{featureEnv.mainBranch}` | the commit if it resolves; otherwise **omitted** | per the Step 3e outcome table; an unresolved commit requires user resolution |

`base_commit_by_repo` serializes only resolved object names. It **never** stores `-`: omission means the
canonical triple is unresolved and requires confirmation before any mutation.

A milestone that **was** confirmed but resolves in neither local nor remote form is a **question for the
user**. It never falls through to tier 3 — tier 3 is only for a repository that never had a milestone.

### Tier 1 reads the remote *and* the branch name from the upstream

A local branch and its upstream need not share a name. Local `epic-1` may track
`refs/remotes/team/releases/epic-1`. Taking only the remote from the upstream and then re-joining it with
the local name produces `refs/remotes/team/epic-1` — and if the remote happens to have an unrelated branch
by that name, the base commit recorded is simply a different branch's commit. A fully qualified namespace
removes the tag-versus-branch ambiguity; it does not fix a wrong upstream mapping.

```
UPSTREAM=$(git -C <repo> rev-parse --symbolic-full-name "<milestone>@{upstream}" 2>/dev/null)

with UPSTREAM:
  Base ref    = $UPSTREAM                                  # verbatim, never re-joined
  <remote>    = git -C <repo> config "branch.<milestone>.remote"
  Base commit = git -C <repo> rev-parse "$UPSTREAM^{commit}"
  kind        = remote
without UPSTREAM:
  -> tier 2 (local-only). Never guess a remote ref of the same name.
```

`<remote>` is never hard-coded to `origin`. Without an upstream it is the repository's only remote; with
several, ask.

### The triple is derived, so resolve it after the intent is final

`(Base ref, Base commit, kind)` is a function of `(intent, remote)`. The batched confirmation can change
the milestone, the remote, or the local-versus-remote choice. If any of those change, discard the old
candidate and resolve the canonical triple from the final intent **before publishing it and before any
mutation**.

Without that rule the record carries the new milestone while `Base commit` still points into the old one.
The branch gets created from the old commit, and on the next resume both the spec and the `Milestone`
column read as the new value while the ancestry check still passes — so the guard accepts a branch built
from the wrong milestone and says nothing.

Accordingly, the create and adopt conditions check that `Base commit` is a commit **of the `Base ref`
resolved from the current intent**, not merely that it is some commit that exists. A missing base commit is
not a value to carry forward or substitute: stop for resolution.

### Acceptance conditions by kind

| `kind` | Condition to create, adopt, or add a worktree |
|---|---|
| `local` | `Base commit` resolves in the repository. **No fetch is required** |
| `remote` | the fetch on the chosen `<remote>` succeeded **and** `Base commit` resolves |

Requiring a successful fetch for every repository is what stopped a repository whose milestone is a valid
local branch — not yet pushed, or with the remote unreachable — from proceeding at all.

## Resume invariant

Resume compares against the recorded commit, never against a moving ref:

> The repository's branch must contain `Base commit` in its history —
> `git merge-base --is-ancestor <base-commit> <branch>`.

Checking "the branch's base is `Base ref`" breaks as soon as the milestone gains a commit: a feature branched
from commit A of `refs/remotes/origin/epic-1` fails an ancestry test against the milestone's new tip B even
though nothing is wrong with it.

A milestone that has advanced is information worth showing. It is not by itself a reason to recreate
anything.

## Write ordering

1. **Intent first**, immediately after the batched confirmation and **before the first git command that
   changes anything**: atomically publish `task_id`, the agreed `feature_branch`, the milestone map covering
   the **whole** confirmed set of repositories, `base_commit_by_repo` containing every and only resolved
   commits, and `created`, with an empty table. A missing base is an omitted map key and a STOP for user
   resolution, never `-`. The read-only work of earlier steps has necessarily already run, since the
   branch, milestones, and canonical triples must be settled before they can be recorded.
2. **Rows appended incrementally**, one immediately after each repository succeeds.
3. **Results last**: `cleaned_by_repo` is written only after the corresponding git command has succeeded
   **and** been verified. See *Cleanup state*.

A crash between 1 and 2 leaves intent complete, which is what lets resume work.

This applies to every writer, including `/tdk-plan` Step 3e reseed and `tdk-repo-worktree` create.

**Seed exception.** A plan seed is written in one pass and creates nothing, so it legitimately has rows with
no `feature_branch` and no milestone map. The rule that a realized file must never carry rows without
milestone information applies to the **realized** write only.

### Atomic publication

Each file is published atomically: build the complete new content, validate it, write a temporary file on
the **same** filesystem, `fsync`, then `rename`. A partially written `git-map.md` parses as `null` rather
than raising, so a torn write silently becomes "no record at all".

### Interrupted migration

A migration that edits two files — the spec and this one — cannot be made safe by ordering alone: both
parsers return `null` for a missing or malformed file instead of throwing, so a crash between the two writes
turns an existing branch-and-worktree record into "nothing was ever created", while the spec has already
changed and no longer meets the condition that would trigger the migration again.

The sequence is therefore fixed, with a marker:

1. Write `migration_pending: <migration-id>` into the git-map frontmatter.
2. Publish the spec.
3. Publish the git-map.
4. Remove the marker.

Reading the marker means the previous run was interrupted: the next run **completes or rolls back**, and
tells the user. It is never silently ignored.

A reader that parses `null` while there is evidence of an existing record — a live branch or worktree —
**stops and reports**. It does not conclude that nothing was created.

## Cleanup state

Cleanup keeps the row and keeps its `Milestone`. Dropping the row would drop the intent; keeping the row
unchanged would make resume offer to recreate exactly what the user just agreed to remove.

Two fields, because cleanup performs two independently failing git mutations — `worktree remove` can fail on
a locked or dirty worktree, and `branch -d` can be refused for an unmerged branch.

| Field | Kind | Written | Content |
|---|---|---|---|
| `cleaning_by_repo: {<sub>: {intent, worktree_path}}` | **intent**, recoverable | **before** the first git command | `intent` is `worktree` or `worktree+branch`; `worktree_path` is the original path, kept so a retry can find it |
| `cleaned_by_repo: {<sub>: worktree \| worktree+branch}` | **result**, verified | **after** each corresponding command succeeds and is verified | only what was actually removed |

Rules:

- `Worktree path` becomes `-` only **after** the removal is verified — `worktree list` no longer shows it.
- A failed `branch -d` records `cleaned_by_repo[<sub>] = worktree` and **keeps** `cleaning_by_repo[<sub>]`.
  The row stays `cleaning`.
- A crash mid-cleanup leaves a `cleaning` row that can be reconciled: the original `worktree_path` is still
  in `cleaning_by_repo`, and a rerun reads `cleaned_by_repo` to see how far it got and **continues from
  there** — without repeating completed work, recreating what was removed, or claiming something is gone
  while it is still live.

`cleaning_by_repo[<sub>]` is removed at exactly two moments:

| Moment | Condition | Result |
|---|---|---|
| **Completion** | every operation in `intent` succeeded and was verified | remove `cleaning_by_repo[<sub>]`; `cleaned_by_repo[<sub>]` holds the completed intent, so the row becomes `cleaned` |
| **Cancel** | the user abandons an unfinished cleanup | remove `cleaning_by_repo[<sub>]`, and remove `cleaned_by_repo[<sub>]` when it only holds a partial result; the row returns to whatever live state is true, and the user is told which removals cannot be undone |

Cancel is not a separate operation: it is `reset` applied to a `cleaning` row.

### The cleanup marker is a local hint, not a global lock

This file is committed, so a `cleaned_by_repo` entry written on one machine travels to every other. Treating
its mere presence as authority would let a cleanup on machine A block machine B, whose worktree is still
there, on the right branch, at the right base commit.

`cleaned_by_repo` stays a hint. A `cleaned` row is handled by **re-verifying first**:

| Marker | Live state on this machine | Behaviour |
|---|---|---|
| present | worktree/branch really gone | honour it: no fast-resume, require `reset` |
| present | worktree still there, on `Branch`, containing `Base commit` | **ask once** to reconcile: reuse this checkout, or `reset`. Never lock unconditionally, never fast-resume silently |

## Reset operation

`reset` is the only way out of a `cleaned` row **and** of an unfinished `cleaning` row, so it is a real mode,
not a name in prose. It is the fourth mode of `tdk-repo-worktree`, prompt-driven like the others.

| Item | Contract |
|---|---|
| Entrypoint | `tdk-repo-worktree` mode `reset <task-id> [--repo <sub-name>]` |
| Default scope | **per repository**: remove `cleaned_by_repo[<sub>]` / `cleaning_by_repo[<sub>]`, return the row to `pending`, keep `Milestone`, keep `feature_branch` |
| `feature_branch` (task-level scalar) | removed **only** when every row of the task is `seed`, `pending` or `cleaned` — no `realized` or `realized-unverified` row remains. Checked across the whole task before writing |
| Confirmation | one `AskUserQuestion` naming the repository, the resulting row state, and whether `feature_branch` is removed |
| Refusal | resetting one repository while a sibling is still `realized` does not remove the scalar |

The whole-task precondition exists because every repository in a task shares one `feature_branch`, and the
guard stops when a row carries a different name. Releasing the scalar while a realized row remains would
allow a rename that the same invariant then rejects for the entire task.

## Sub-workspace name uniqueness

`spec.milestone_branch`, `base_commit_by_repo`, `cleaning_by_repo` and `cleaned_by_repo` are all keyed by
`subWorkspaces[].name`. The config schema only requires that name to be non-empty.

So `[{name: api, path: apps/api-v1}, {name: api, path: apps/api-v2}]` is accepted today, and every per-repo
map would share one slot: the later entry overwrites the earlier one, resume compares one repository against
the other's commit, and cleaning one marks both. No concurrency is needed for this — a plain sequential loop
does it.

**Unique names are a config invariant**, enforced at the config read boundary before any seed, migration or
mutation. A duplicate is reported with the conflicting paths and **stops**. Names are never merged,
rewritten, or given generated suffixes.

## Format

Seed, written by `/tdk-plan`:

```markdown
---
task_id: sample-001
created: 2026-08-03
---

# Git Map

| Sub-workspace | Repo path | Milestone | Branch | Base ref | Worktree path |
|---|---|---|---|---|---|
| api | apps/api | epic-1 | - | refs/remotes/origin/main | - |
| web | apps/web | epic-2 | - | refs/remotes/origin/develop | - |
```

Realized, after `/tdk-implement` confirmed and created:

```markdown
---
task_id: sample-001
feature_branch: feature/sample-001
created: 2026-08-03
base_commit_by_repo:
  api: 9f2c1b7ad4e60835c1f0a27b6d95e3814cc07a12
  web: 3ab41d09e7c5286fb0a1d4e83729cf60518bd94e
---

# Git Map

| Sub-workspace | Repo path | Milestone | Branch | Base ref | Worktree path |
|---|---|---|---|---|---|
| api | apps/api | epic-1 | feature/sample-001 | refs/remotes/origin/epic-1 | - |
| web | apps/web | epic-2 | feature/sample-001 | refs/heads/epic-2 | _worktrees/web/feature-sample-001 |
```

`web` branches from a local milestone that was never pushed, so its `Base ref` is under `refs/heads/`. `api`
branches from a remote-tracking ref. The kind is recorded, never inferred.

### Columns

| Column | Meaning |
|---|---|
| `Sub-workspace` | `subWorkspaces[].name`, sanitized, unique |
| `Repo path` | `subWorkspaces[].path`, workspace-relative |
| `Milestone` | The milestone branch **for this repository**; a hint, with the spec winning on disagreement |
| `Branch` | The agreed `feature_branch`, identical across every row of a task; `-` in a seed |
| `Base ref` | Fully qualified: `refs/heads/<branch>` or `refs/remotes/<remote>/<branch>` |
| `Worktree path` | Working-root override, or `-` when the main checkout is used |

### Frontmatter

| Key | Meaning |
|---|---|
| `base_commit_by_repo` | `{<sub>: <object-name>}` — intent, written before mutation, validated at the read boundary |
| `cleaning_by_repo` | `{<sub>: {intent, worktree_path}}` — outstanding cleanup intent |
| `cleaned_by_repo` | `{<sub>: worktree \| worktree+branch}` — verified result |
| `migration_pending` | a migration id; present only while a multi-file migration is in flight |

A row is assembled from **two** sources: its table columns and the frontmatter maps. A sub-workspace absent
from `base_commit_by_repo` yields an `undefined` base commit — that is neither `-` nor a layout error.

### Recognised header sets

Exactly two header sets are valid. A reader looks columns up **by name**, never by position.

| Set | Header |
|---|---|
| Target, 6 columns | `Sub-workspace \| Repo path \| Milestone \| Branch \| Base ref \| Worktree path` |
| Legacy, 5 columns | `Sub-workspace \| Repo path \| Branch \| Base ref \| Worktree path` |

Anything else — a missing header, a duplicate header, an unrecognised name — is `malformed`. A reader never
guesses an index: reading the six-column set positionally makes `Milestone` look like `Branch` and produces
a plausible, entirely wrong row.

## The `Worktree path` column is a working-root override

When the column holds a value, it is the **replacement working root** for that sub-workspace during phase
dispatch — not a second declared path running in parallel.

Paths in a phase file's `## Related Code Files` stay workspace-logical (`apps/web/...`). The consumer
translates them onto this root when reading and writing. A value of `-` means the main checkout is used.

Declaring `_worktrees/...` in a phase file does not work: `/tdk-plan` runs the write-disjointness check in
validate-only mode, that mode includes the gitignore step, and `_worktrees/` must be gitignored — so the path
is rejected as an ignored write path.

### Two roots: where metadata is read, and where HEAD is read

`Worktree path` is a probe point for HEAD and dirty state. It is **not** where branch metadata is read.

| Concept | Value | Used for |
|---|---|---|
| `repositoryRoot` | `"$PROJECT_DIR/<sub-path>"`, identity-verified | branch existence, ancestry, `worktree list`, `worktree prune`, `worktree add`, all branch metadata |
| `workingRoot` | the `Worktree path` when the column has a value **and** that path exists; otherwise `repositoryRoot` | current HEAD, dirty check, and where phase dispatch writes |

A `Worktree path` that is recorded but no longer exists is a valid, recoverable state — not an error.
Recovery is needed exactly then, and reading branch metadata at the missing path would make it
impossible: every `git -C <missing>` fails, so nothing can tell whether the branch still exists or run
the `worktree list`/`prune` that the re-attach path depends on. `workingRoot` falls back to
`repositoryRoot`, the guard reports that the worktree is gone, and re-attach proceeds.

### Repository identity gate

Applied before every create, checkout, worktree operation, cleanup and phase dispatch.

| Check | How |
|---|---|
| `repositoryRoot` is inside the workspace | `realpathSync.native(repositoryRoot)` must be a descendant of `realpath(PROJECT_DIR)` |
| `repositoryRoot` is neither the builder root nor the artifact host | compare real paths against both; equal means STOP |
| `workingRoot` belongs to that repository | `git -C <workingRoot> rev-parse --git-common-dir`, resolved, must equal the same value at `repositoryRoot`. The same branch and the same history prove nothing — an independent clone has both |
| `workingRoot` is a registered worktree | it appears in `git -C <repositoryRoot> worktree list --porcelain` |
| Git environment is controlled | every command goes through the env-sanitizing runner. `GIT_DIR`/`GIT_WORK_TREE` override `-C` and would defeat all of the above |

`--git-common-dir` answers relative to the repository, so it must be resolved against the root it was
read from rather than against the caller's working directory.

## Worktree name derivation

The worktree directory name derives from the **agreed branch** (the `feature_branch` frontmatter field), never from
`task_id`:

```
WORKTREE_NAME = branch, with every run of characters outside [A-Za-z0-9] replaced by "-", then "-" trimmed from both ends
```

```bash
WORKTREE_NAME=$(printf '%s' "$BRANCH" | sed -E 's/[^A-Za-z0-9]+/-/g; s/^-+//; s/-+$//')
```

| Branch | Worktree name |
|---|---|
| `feature/task-1` | `feature-task-1` |
| `feature/sample-001` | `feature-sample-001` |
| `fix/ABC_123.v2` | `fix-ABC-123-v2` |

Full path: `_worktrees/<sub-workspace-name>/<worktree-name>/`, under the workspace root and outside every
`subWorkspaces[].path` so it does not disturb path mapping.

Constraints:

- **Derive from the branch, not from `task_id`.** A valid task ID may contain `/` (the `[folder/]prefix-number`
  form permits `sub/feat-123`), which would push the worktree to a third level and break every consumer that
  assumes a fixed depth.
- **The result always matches `^[A-Za-z0-9-]+$`** — no `/`, no `..`. This is the real path-traversal barrier
  for this segment. The `^[A-Za-z0-9._/-]+$` allowlist used for branch and ref values permits both `.` and
  `/`, so on its own it does not stop `..` from reaching a filesystem path.
- **Depth is always two levels**, whatever the branch contains, which keeps `list` and `cleanup` safe to glob.
- **An empty result** — a branch made entirely of special characters — is a STOP. Never fall back silently.
- **Derive exactly once**, right after the branch is agreed, then write it into the `Worktree path` column.
  Consumers read that column and do not re-derive: the branch name is an editable suggestion, so deriving
  again later can produce a different name than the one on disk.
- **Collisions fail loud.** Two different branches can sanitize to the same name (`feature/task-1` and
  `feature.task-1`). Within one task a single branch name is shared by every repository, so a collision only
  arises across tasks in the same sub-workspace — where `git worktree add` fails with "already exists". Never
  overwrite, and do not add anti-collision suffixes.
