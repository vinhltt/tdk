# Golden Path Recipe Schema

`golden-path-recipe.json` is a small human-reviewed action list, not a general
template engine.

## Top-Level Shape

```json
{
  "schemaVersion": 1,
  "status": "draft",
  "preset": "modular-monolith",
  "evidence": [],
  "actions": []
}
```

Allowed status values:

- `draft`: dry-run output, not eligible for apply.
- `approved`: human-reviewed and eligible for `--yes` apply.
- `applied`: apply completed and report written.

## Allowed Actions

The only allowed action names are:

- `mkdir`
- `touch-gitkeep`
- `write-specify-doc`
- `write-config-template`

Unknown actions fail closed.

## Action Contracts

`mkdir`:

```json
{
  "action": "mkdir",
  "path": "apps/api",
  "reason": "Named boundary from approved topology"
}
```

`touch-gitkeep`:

```json
{
  "action": "touch-gitkeep",
  "path": "apps/api/.gitkeep",
  "reason": "Keep approved empty skeleton folder visible"
}
```

`write-specify-doc`:

```json
{
  "action": "write-specify-doc",
  "path": ".specify/configurations/golden-path/golden-path-notes.md",
  "template": "golden-path-notes",
  "reason": "Document boundary assumptions for review"
}
```

`write-config-template`:

```json
{
  "action": "write-config-template",
  "path": ".specify/templates/project-structure.md",
  "template": "project-structure",
  "reason": "Reviewable project structure guidance"
}
```

## Required Fields

Each action requires:

- `action`
- `path`
- `reason`

Template-writing actions also require `template`.

Allowed template values:

- `golden-path-notes` -> `templates/golden-path-notes.md.tpl`
- `project-structure` -> `templates/project-structure.md.tpl`

## Validation Rules

- Paths are repo-relative.
- Paths pass every safety gate.
- Actions are idempotent and create-only by default.
- Existing non-empty directories require `expectedExisting: true` to be listed
  as existing instead of refused.
- Template content must be explicit in the recipe or come from this skill's
  templates.
