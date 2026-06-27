# Dry-Run Workflow

Dry-run is the default mode for `/tdk-golden-path-scaffold`.

## Evidence Check

Require at least one topology or runtime config source:

- `.specify/configurations/workspace-topology/workspace-topology.json`
- `.specify/configurations/workspace-topology/workspace-topology.md`
- `.specify/.specify.json`

Prefer architecture context when present:

- `.specify/configurations/architecture/architecture-decision.md`
- `.specify/configurations/architecture/architecture-recovery.md`

Use module-boundary policy as optional guidance only:

- `.specify/configurations/module-boundary-policy/module-boundary-policy.md`

If evidence is insufficient to name safe repo-relative skeleton paths, write a
readiness-oriented scaffold plan and leave the recipe empty with `status:
draft`.

## Dry-Run Writes

Write or refresh only:

- `.specify/configurations/golden-path/golden-path-scaffold-plan.md`
- `.specify/configurations/golden-path/golden-path-recipe.json`
- `.specify/configurations/golden-path/generated-files-report.md`

Use:

- `templates/golden-path-scaffold-plan.md.tpl`
- `templates/golden-path-recipe.json.tpl`
- `templates/generated-files-report.md.tpl`

## Recipe Derivation

Derive actions from named topology/config boundaries only. Do not invent
modules, owners, dependencies, or implementation files.

Recommended derivation:

1. map each named workspace/module to a candidate folder;
2. keep only paths that pass safety gates;
3. add `mkdir` for approved empty skeleton directories;
4. add `touch-gitkeep` only for empty skeleton directories;
5. add `write-specify-doc` for review notes under golden-path config;
6. add `write-config-template` only for explicitly reviewable templates.

## Dry-Run Report

The generated report must show zero live project writes outside the golden-path
configuration directory and list blocked apply reasons when any required
evidence is missing.
