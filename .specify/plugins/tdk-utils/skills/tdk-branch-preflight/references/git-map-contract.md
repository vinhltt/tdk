# git-map.md Contract

`git-map.md` lives at `{FEATURE_DIR}/git-map.md` and records which branch and which working root each
sub-workspace repository uses for a task. It is the shared contract between `tdk-branch-preflight`,
`tdk-repo-worktree`, and `tdk-implement`.

## Semantics: a hint, not a source of truth

The file is committed alongside `spec.md` and `plan.md` on the current root branch, so it travels with the
feature. But its contents describe **per-machine state** — a local branch and a worktree path only exist on
the machine that created them.

Every consumer — resume, list, cleanup, dispatch — re-verifies against live git state before acting. A record
that disagrees with reality produces a question, never a destructive action.

The durable source of truth for the wrong-milestone check is the spec's `milestone_branch` field. This file
only hints at it.

## Path rules

Every path stored here is **workspace-relative** (`apps/api`, `_worktrees/web/feature-sample-001`). Absolute
paths are never written: the file is committed, and a machine-local path breaks it for everyone else.

Consumers join their own `PROJECT_DIR` at execution time. That anchor is never persisted.

## Two lifecycle states

The file has two distinct states, told apart by whether `feature_branch` is present in the frontmatter.

| State | Written by | Frontmatter | Rows |
|---|---|---|---|
| **Seed** | `/tdk-plan` Step 3e | `task_id`, `created` — **no `feature_branch`** | Affected repos with `Base ref` filled; `Branch` and `Worktree path` are `-` |
| **Realized** | `/tdk-implement` Step 6A | adds `feature_branch` and `milestone_branch` | `Branch` filled per repo as each one succeeds |

A seed records **intent**: which repositories the plan touches and which base ref each is expected to branch
from. It creates nothing and fetches nothing.

`feature_branch` is the signal for both readers, and it is the presence of that field — never the row count —
that decides whether the branch name is still editable:

- **Absent** → this is a plan seed. The branch name is still an open suggestion; `/tdk-implement` presents it
  editable. Base refs are suggestions to confirm, not settled values.
- **Present** → a previous implement run got past its confirmation. The branch name is locked to the recorded
  value, and rows describe branches that may actually exist on disk.

Row count cannot carry this signal: a seed has rows too, so keying on it would lock the branch name before
the user ever saw it.

Every seeded value is still re-verified against live git before use. A base ref that has since been deleted
on the remote is caught at implement time, where the fetch happens.

## Write ordering

Applies to the **realized** write at implement time. A plan seed is written in one pass and creates nothing.

1. **Frontmatter first**, immediately after the batched confirmation and **before the first git command that
   changes anything** — the read-only work of earlier steps (`fetch`, `rev-parse`, `symbolic-ref`) has
   necessarily already run, since the feature branch and the milestone must be settled before they can be recorded.
   Write `task_id`, the agreed `feature_branch`, the confirmed `milestone_branch`, and `created`, with an empty table.
2. **Rows appended incrementally**, one immediately after each repository succeeds.

The `Worktree path` column has exactly one writer per row: whichever component created the worktree. When
preflight delegates to `tdk-repo-worktree`, that skill writes the row and preflight leaves it alone; preflight
fills the column itself only for worktrees it set up directly. The closing verification never rewrites a row
another component already wrote.

A file must never exist with rows but no `milestone_branch`. That combination silently disables the
wrong-milestone guard on resume, because there is nothing to compare the root repo's live branch against.

## Format

Seed, written by `/tdk-plan`:

```markdown
---
task_id: sample-001
created: 2026-08-03
---

# Git Map

| Sub-workspace | Repo path | Branch | Base ref | Worktree path |
|---|---|---|---|---|
| api | apps/api | - | origin/main | - |
| web | apps/web | - | origin/main | - |
```

Realized, after `/tdk-implement` confirmed and created:

```markdown
---
task_id: sample-001
feature_branch: feature/sample-001
milestone_branch: epic-1
created: 2026-08-03
---

# Git Map

| Sub-workspace | Repo path | Branch | Base ref | Worktree path |
|---|---|---|---|---|
| api | apps/api | feature/sample-001 | origin/main | - |
| web | apps/web | feature/sample-001 | origin/develop | _worktrees/web/feature-sample-001 |
```

The `web` base ref differs between the two: the plan seeded `origin/main` from config, the user corrected it
to `origin/develop` at the batched confirmation. Seeds are suggestions.

| Column | Meaning |
|---|---|
| `Sub-workspace` | `subWorkspaces[].name`, sanitized |
| `Repo path` | `subWorkspaces[].path`, workspace-relative |
| `Branch` | The agreed `feature_branch`, identical across every row of a task; `-` in a seed |
| `Base ref` | `<remote>/<branch>`; seeded by the plan, confirmed at implement, then the ref the branch was created from. Cleanup compares against it |
| `Worktree path` | Working-root override, or `-` when the main checkout is used |

## The `Worktree path` column is a working-root override

When the column holds a value, it is the **replacement working root** for that sub-workspace during phase
dispatch — not a second declared path running in parallel.

Paths in a phase file's `## Related Code Files` stay workspace-logical (`apps/web/...`). The consumer
translates them onto this root when reading and writing. A value of `-` means the main checkout is used.

Declaring `_worktrees/...` in a phase file does not work: `/tdk-plan` runs the write-disjointness check in
validate-only mode, that mode includes the gitignore step, and `_worktrees/` must be gitignored — so the path
is rejected as an ignored write path.

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
