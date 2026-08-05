---
name: tdk-repo-worktree
description: "Manage Git worktrees for sub-workspace repositories of a polyrepo TDK project.
  This skill should be used when the user asks to 'create a worktree for this task',
  'list task worktrees', 'clean up worktrees', or when a sub-workspace repository is busy on
  another feature branch and the task needs an isolated checkout.
  Also invoked by tdk-branch-preflight when it finds a busy repository.
  Operates on sub-workspace repositories only, never on the root workspace repository."
metadata:
  version: "4.1.0"
  category: "Git"
  input_format: "Mode (create|list|cleanup), task ID, optional --repo <sub-workspace-name>; PROJECT_DIR from the caller when delegated"
  output_format: "Worktree records written to git-map.md, or a status report per repository"
---

## Repository Worktree Lifecycle

Create, inspect, and remove Git worktrees for the sub-workspace repositories declared in
`PROJECT_CONTEXT.subWorkspaces[]`. A worktree lets a task proceed in a repository that is already busy on
another feature branch, without forcing a switch.

This skill manages **sub-workspace repositories inside a consumer project**. It is unrelated to any
builder-local worktree tooling that operates on the toolkit repository itself.

### Modes

| Mode | Invocation |
|---|---|
| create | `create <task-id> [--repo <sub-name>]` |
| list | `list [<task-id>]` |
| cleanup | `cleanup <task-id>` |

### Scope

- The root workspace repository is never a target.
- Confirm before every branch or worktree creation. Never create silently. When delegated, the confirmation
  already happened in the batched preflight prompt — do not ask twice; when invoked directly, ask here.
- Every removal — worktree or branch — goes through an explicit confirmation.
- Prompt-driven only. Do not add scripts under `.specify/scripts/`.
- Use generic prefixes such as `sample` in all examples.

### Path Anchoring

The same contract as `tdk-branch-preflight`. Take `PROJECT_DIR` from the caller when delegated; resolve it
the standard way when invoked directly. Do not derive the project root from the environment or the current
directory.

Anchor every command: `git -C "$PROJECT_DIR/<path>" …`, worktrees at
`"$PROJECT_DIR/_worktrees/<sub>/<worktree-name>"`, and `git check-ignore` against the anchored path.

Without the anchor, `git worktree add _worktrees/...` *succeeds* at whatever directory the agent occupies —
possibly inside a sub-workspace and beyond the reach of the root `.gitignore`.

git-map.md still stores workspace-relative paths. The anchor is joined at execution time and never written
into the file.

### Value Validation

Branch names, base refs, and `task_id` all pass through the same three layers defined in
`../tdk-branch-preflight/SKILL.md`:

1. Allowlist `^[A-Za-z0-9._/-]+$` — the actual shield against injection.
2. Quoted shell variables in every command. Never inline a literal.
3. `git check-ref-format "refs/heads/$BRANCH"` in full-refname mode, as secondary hygiene only.

Never use `check-ref-format --branch`: it resolves shorthand such as `@{-N}` instead of validating, and it
does not reject shell metacharacters in any mode.

`task_id` no longer reaches the worktree path — that path derives from the branch (see below) — but it still
passes the filter wherever it is interpolated.

### Worktree Path Convention

`_worktrees/<sub-workspace-name>/<worktree-name>/`, under the workspace root and outside every
`subWorkspaces[].path`, so it does not disturb the path mapping done by `tdk-branch-preflight`. Sanitize
`<sub-workspace-name>` (no `/`, no `..`) before use.

`<worktree-name>` derives from the **agreed branch**, never from the task ID. The rule and its rationale live
in `../tdk-branch-preflight/references/git-map-contract.md`, which is the single source of truth. The gloss
that follows is non-normative orientation, not a second definition — on any disagreement the contract wins,
and edits to the rule go there: replace every run of characters outside `[A-Za-z0-9]` with `-`, then trim `-`
from both ends, so `feature/task-1` becomes `feature-task-1`.

Three properties of that rule are what `list` and `cleanup` depend on:

- The result always matches `^[A-Za-z0-9-]+$` — no `/`, no `..`.
- The depth is always exactly two levels, whatever the branch contains, so globbing is safe.
- The name is **read from git-map's `Worktree path` column, never re-derived.** The branch name is an
  editable suggestion, so deriving again at a later moment can produce a name that does not exist on disk.

### Gitignore Enforcement

In `create`, run `git -C "$PROJECT_DIR" check-ignore _worktrees` before creating anything. When it is
not ignored, offer to add `_worktrees/` to the root `.gitignore` (a confirmed write) or STOP. A passive
reminder is not enough: the same workflow commits feature artifacts from the root, and a `git add -A` would
swallow an entire sub-repository checkout.

## create

1. **Resolve the task ID.** Use the standard validation idiom when invoked directly; accept it as given when
   delegated by `tdk-branch-preflight`.
2. **Load context.** When invoked directly, invoke `tdk-load-project-context` to obtain `PROJECT_CONTEXT`
   (`subWorkspaces[]`, `featureEnv.*`) and `FEATURE_DIR`. When delegated, both arrive from the caller.
3. **Pick the target repository** from `--repo`, or ask the user to choose among `subWorkspaces[]`. The root
   repository is excluded from the choice.
4. **Resolve the branch name** using the same source of truth as `tdk-branch-preflight`: the spec's
   `feature_branch` frontmatter (legacy key `branch` when absent), falling back to
   `<featureEnv.defaultFolder>/<task-id>`. Validate with the three layers above.
   The name is a suggestion and **no format is enforced** on what the user types. When invoked directly, let
   the user edit it at confirmation time; when delegated, use the name already agreed in preflight and
   recorded in git-map.
5. **Derive `<worktree-name>` from the agreed branch**, only after step 4 has settled it — after the user's
   edit when direct, from the caller when delegated. An empty result is a STOP. The full path is
   `"$PROJECT_DIR/_worktrees/<sub>/<worktree-name>"`.
6. **Fetch and confirm the base ref**, unless preflight already confirmed it. Each base ref is confirmed
   exactly once — either in preflight or here, never twice.

   ```bash
   # Branch does not exist yet
   git -C "$PROJECT_DIR/$SUB_PATH" worktree add "$PROJECT_DIR/_worktrees/$SUB/$WORKTREE_NAME" -b "$BRANCH" "$BASE_REF"

   # Branch already exists (preflight created it, or this is a resume) — no -b
   git -C "$PROJECT_DIR/$SUB_PATH" worktree add "$PROJECT_DIR/_worktrees/$SUB/$WORKTREE_NAME" "$BRANCH"
   ```

   Before attaching to an existing branch, verify it matches the recorded base:

   ```bash
   git -C "$PROJECT_DIR/$SUB_PATH" merge-base --is-ancestor "$BASE_REF" "$BRANCH"
   ```

   When `worktree add` fails with "already checked out", run
   `git -C "$PROJECT_DIR/$SUB_PATH" worktree list` to locate it. A stale entry — directory deleted by hand
   while git still tracks it — warrants an offer to run `git -C "$PROJECT_DIR/$SUB_PATH" worktree prune` and retry. A live checkout
   elsewhere means reporting its location and offering to use it instead. Never force.
7. **Record it.** Append or update the row in `{FEATURE_DIR}/git-map.md`, writing the path derived in step 5
   in workspace-relative form, immediately after the worktree is created.

   That column is a **working-root override, not a second declared path.** Phase files keep declaring
   `apps/web/...`; `tdk-implement` reads this column at dispatch and tells the agent that the working root
   for that sub-workspace is the worktree. Do not rewrite `## Related Code Files` to point at
   `_worktrees/...`: `/tdk-plan` runs the write-disjointness check in validate-only mode, that mode includes
   the gitignore step, and `_worktrees/` must be gitignored — so such a path is rejected as an ignored write
   path.

### Worked example: delegated from preflight

Task `sample-001`, agreed branch `feature/sample-001`, sub-workspace `web` at `apps/web` already sitting on
`feature/sample-014`. Preflight passes the task ID, the target repository, the agreed branch, and the
already-confirmed base ref `origin/develop`, so `create` does not ask for a base ref again.

Deriving from `feature/sample-001` gives `feature-sample-001`, so the worktree lands at
`_worktrees/web/feature-sample-001`:

```bash
# SUB_PATH=apps/web  SUB=web  BRANCH=feature/sample-001
# WORKTREE_NAME=feature-sample-001  BASE_REF=origin/develop
git -C "$PROJECT_DIR/$SUB_PATH" worktree add \
  "$PROJECT_DIR/_worktrees/$SUB/$WORKTREE_NAME" -b "$BRANCH" "$BASE_REF"
```

The resulting git-map row, with the path stored workspace-relative:

```markdown
| web | apps/web | feature/sample-001 | origin/develop | _worktrees/web/feature-sample-001 |
```

Phase files still declare `apps/web/src/...`; the agent translates those onto
`_worktrees/web/feature-sample-001/src/...` when it reads and writes.

## list

Read `git-map.md` from the relevant feature directories and reconcile each record against
`git -C "$PROJECT_DIR/<repo>" worktree list`. Report divergence — a missing worktree, a branch deleted by
hand — rather than failing.

## cleanup

Read `git-map.md` for the task and take each worktree path **verbatim from the `Worktree path` column**. Do
not re-derive it from the branch: the branch may have been edited after the worktree was created, so a fresh
derivation would point at a path that does not exist and would miss the real worktree.

Records are hints. Re-verify live git state on this machine before touching anything:

1. **Worktree absent locally** — report it and do nothing. The record was made on another machine.
2. **Worktree present** — check for a dirty tree first. Dirty means STOP for that repository, with a report
   to the user. Otherwise `git -C "$PROJECT_DIR/$SUB_PATH" worktree remove "$PROJECT_DIR/$WORKTREE_PATH"`.
3. **Empty branch** — when `git -C "$PROJECT_DIR/$SUB_PATH" log "$BASE_REF".."$BRANCH"` is empty, the branch carries no work (a skipped
   phase). Offer to delete it, confirming once per group. Delete with `git -C "$PROJECT_DIR/$SUB_PATH" branch
   -d -- "$BRANCH"`, never `-D`, so Git refuses anything unmerged as a last line of defence.

   **Warn when the branch has not been pushed.** Determine that by checking for an upstream:
   `git -C "$PROJECT_DIR/$SUB_PATH" rev-parse --verify --quiet "$BRANCH@{upstream}"`. No upstream means no
   remote copy, so any local commit would be lost for good — say so plainly in the confirmation.
4. **Update git-map.md** — drop the worktree row, keeping branch history when the branch itself survives.

## Additional Resources

- **`../tdk-branch-preflight/references/git-map-contract.md`** — git-map.md format, write ordering, hint
  semantics, and the worktree-name derivation rule (source of truth).
- **`../tdk-branch-preflight/SKILL.md`** — the preflight flow that delegates here.
