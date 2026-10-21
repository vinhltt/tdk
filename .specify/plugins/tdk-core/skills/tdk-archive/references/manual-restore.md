# Manual restore

There is no un-archive command. Restoring an archived spec to active work is a manual procedure for the user. This file is the single source for it; guides link here instead of restating the steps. An agent that reads this file prints the steps and runs none of them.

Restore only when the spec needs more work. Nothing here undoes memory ingest: close-out rows and memory entries stay as they are.

## Steps

Run from the project root (`$PROJECT_DIR` is that directory), with `<specsRoot>`, `<folder>` and `<id>` as in the archived path `<specsRoot>/archive/<folder>/<id>`.

1. Move the folder back.

   ```bash
   mv <specsRoot>/archive/<folder>/<id> <specsRoot>/<folder>/<id>
   ```

   Use `git mv` instead of `mv` only when the archive move is already committed.
2. Edit `status:` in the frontmatter of both `plan.md` and `spec.md`: replace `archived` with the value of `archived_from` (`done` or `cancelled`), then delete the `archived_from:` line from each.
3. Reconcile the plan root status from its phases.

   ```bash
   (cd "$PROJECT_DIR/.specify/scripts/ts" && bun src/commands/util/update-phase-status.ts --reconcile-root "<plan.md path>")
   ```

4. Stage both paths so the removal under `archive/` and the restored folder are recorded together.

   ```bash
   git add -A <specsRoot>/archive/<folder>/<id> <specsRoot>/<folder>/<id>
   ```

## After restoring

- `close-out.md` stays in the restored folder. A later `/tdk-archive <task-id>` finds it, shows what differs from the new draft, and asks before overwriting; rows with an unchanged `id` and `content` keep their `ingested` or `skipped` status.
- Memory entries written from the earlier close-out stay in project memory. Keep the `Source:` lines; when new work changes them, update memory through `/tdk-memory-update`.
