---
name: tdk-golden-path-scaffold
description: "Turn approved architecture/topology evidence into a guarded golden-path scaffold recipe, then optionally apply safe skeleton artifacts after review."
user-invocable: true
argument-hint: "[topology|file] [--dry-run|--yes] [--preset <name>]"
related-skills:
  - tdk-architecture-advisor
  - tdk-boundary-map
  - tdk-workspace-topology-apply
  - tdk-module-boundary-policy
metadata:
  version: "1.2.0"
  author: "VinhLTT"
  category: scaffold
---

# tdk-golden-path-scaffold

Create a reviewable golden-path scaffold plan from approved architecture and
topology evidence. The skill is for consumer-project skeletons only: empty
folders, `.gitkeep`, `.specify` guidance, and explicitly templated config files.

This skill does not generate fake business code, does not mutate
`.specify/.specify.json`, does not run shell commands, and does not install
package dependencies.

Trigger: `/tdk-golden-path-scaffold [topology|file] [--dry-run|--yes] [--preset <name>]`

## Args

| Flag | Behavior |
|---|---|
| `topology|file` | Optional topology JSON/Markdown, architecture decision/recovery, or recipe path. Defaults to workspace topology/config evidence. |
| `--dry-run` | Preview and write review artifacts only. dry-run is the default. |
| `--yes` | Apply an already approved recipe. Fails unless `golden-path-recipe.json` has `status: approved`. |
| `--preset <name>` | Optional recipe shaping hint, such as `monolith`, `modular-monolith`, `monorepo`, or `docs-tooling`. |

If both `--dry-run` and `--yes` are present, stop and ask the user to choose one
mode.

## Required Resources

Load shared references before writing:

- `references/golden-path-output-contract.md`
- `references/golden-path-recipe-schema.md`
- `references/safety-gates.md`
- `templates/golden-path-scaffold-plan.md.tpl`
- `templates/golden-path-recipe.json.tpl`
- `templates/generated-files-report.md.tpl`
- `templates/golden-path-notes.md.tpl`
- `templates/project-structure.md.tpl`

Load exactly one workflow reference after mode selection:

- dry-run/default: `references/workflow-dry-run.md`
- apply: `references/workflow-apply.md`

Do not write artifacts until the shared references, selected workflow, and
templates are loaded.

## Execution Steps

### Step 1 - Resolve Input

Resolve the project root from the active coding session. If the first non-flag
argument is a file, require it to be workspace-local and non-secret-like.

Prefer evidence in this order:

1. `.specify/configurations/workspace-topology/workspace-topology.json`
2. `.specify/configurations/workspace-topology/workspace-topology.md`
3. `.specify/.specify.json`
4. `.specify/configurations/architecture/architecture-decision.md`
5. `.specify/configurations/architecture/architecture-recovery.md`
6. optional `.specify/configurations/module-boundary-policy/module-boundary-policy.md`

Dry-run may proceed with incomplete policy evidence, but apply must not proceed
when path ownership or topology intent is unresolved.

### Step 2 - Select Mode And Load References

Default to dry-run when no mode flag is supplied. Load shared references before
writing, then load exactly one workflow reference for the selected mode.

### Step 3 - Dry-Run Plan

Follow `references/workflow-dry-run.md`:

- validate evidence sufficiency;
- derive a small recipe from named topology/config boundaries;
- write review artifacts only under `.specify/configurations/golden-path/`;
- mark the recipe as `status: draft`;
- list assumptions, refused paths, risks, and unresolved questions.

### Step 4 - Apply Approved Recipe

Follow `references/workflow-apply.md` only when `--yes` is present:

- read `.specify/configurations/golden-path/golden-path-recipe.json`;
- require `status: approved`;
- validate all actions and paths against `references/golden-path-recipe-schema.md`
  and `references/safety-gates.md`;
- create only allowed skeleton artifacts;
- write `.specify/configurations/golden-path/generated-files-report.md`.

### Step 5 - Report Completion

Report:

- selected mode and evidence inputs;
- scaffold plan and recipe paths;
- created, skipped, existing, and refused path counts;
- optional module-boundary policy evidence status;
- next safe route;
- unresolved questions, if any.

## Quality Gates

- [ ] dry-run is the default.
- [ ] Architecture/topology evidence is required before recipe creation.
- [ ] Dry-run writes review artifacts only under `.specify/configurations/golden-path/`.
- [ ] `--yes` requires an approved recipe.
- [ ] Unknown actions fail closed.
- [ ] Absolute paths, traversal, symlink escapes, and secret-like files are refused.
- [ ] No source implementation, dependency, migration, endpoint, UI, or domain model files are produced.
