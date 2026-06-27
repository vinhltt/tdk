# Apply Workflow

Apply mode runs only when the user invokes `/tdk-golden-path-scaffold --yes`.

`--yes` requires `golden-path-recipe.json` with `status: approved`.

## Preconditions

- Read `.specify/configurations/golden-path/golden-path-recipe.json`.
- Confirm `schemaVersion` is supported.
- Confirm `status` is `approved`.
- Confirm every action is in the allowed action set.
- Confirm every path passes the safety gates.
- Confirm no unresolved path ownership questions remain.

If any precondition fails, abort before writing.

## Allowed Effects

Apply may:

- create missing directories named in approved `mkdir` actions;
- add `.gitkeep` files named in approved `touch-gitkeep` actions;
- write `.specify` guidance docs named in approved `write-specify-doc` actions;
- write explicitly templated config files named in approved
  `write-config-template` actions;
- refresh `.specify/configurations/golden-path/generated-files-report.md`.

Existing non-empty directories are skipped unless the recipe marks them with
`expectedExisting: true`. Existing files are never overwritten unless the recipe
marks the path as existing-safe and the content is identical.

## Report Semantics

Classify every requested path as one of:

- created;
- skipped;
- existing;
- refused.

Refused paths must include the failed gate name. Redact sensitive values before
writing the report.
