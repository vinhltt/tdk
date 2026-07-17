# Legacy Artifact Migration

Use only for `/tdk-plan <TASK_ID> --migrate-artifacts`. This is an opt-in
action and never runs during create, rewrite, append, red-team, or validation.

## Preconditions

- Reject combinations with speed, test, targeting, red-team, or validate flags.
- Resolve `FEATURE_DIR` through project context; do not infer another feature.
- Do not let an agent choose among ambiguous owners.

## Dry run

Run first, without mutation:

```bash
(cd "$PROJECT_DIR/.specify/scripts/ts" && bun src/commands/util/migrate-plan-artifacts.ts "$FEATURE_DIR" --json)
```

Show every operation's source, kind, owner phase, target section, link files,
validations, and `deleteAfterValidation`. If `errors` is non-empty, STOP. If no
operations exist, report that migration is already complete and stop.

Legacy checklist removal requires an embedded quality gate written by
`/tdk-specify` or `/tdk-clarify`. Migration never fabricates that gate. Ask the
user to run `/tdk-clarify` when the dry run reports this blocker.

## Confirmation and apply

Ask one explicit confirmation after the user can review the full dry-run
manifest. Only an affirmative answer may run:

```bash
(cd "$PROJECT_DIR/.specify/scripts/ts" && bun src/commands/util/migrate-plan-artifacts.ts "$FEATURE_DIR" --apply --yes --json)
```

The utility writes manifest and backups before touching plan artifacts, stages
owner-phase/link updates, validates migration markers and phase statuses, then
deletes legacy files. Report the transaction directory and final state.

## Interrupted transaction

Normal reruns fail closed when an applying or failed manifest exists. Report
its exact path and wait for the user to choose:

- Resume from a clean rollback: `--resume <manifest> --yes --json`
- Roll back only: `--rollback <manifest> --json`

Rollback refuses to overwrite any file edited after the transaction write.
Do not delete `.tdk-tmp/migrate-artifacts/` recovery evidence automatically.
