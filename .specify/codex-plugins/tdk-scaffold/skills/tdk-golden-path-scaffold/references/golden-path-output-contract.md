# Golden Path Output Contract

The golden-path scaffold writes reviewable artifacts under:

```text
.specify/configurations/golden-path/
```

Evidence may come from the canonical workspace layout proposal:

- `.specify/configurations/workspace-layout/workspace-layout-proposal.json`
- `.specify/configurations/workspace-layout/workspace-layout-proposal.md`

Legacy topology evidence remains readable for compatibility:

- `.specify/configurations/workspace-topology/workspace-topology.json`
- `.specify/configurations/workspace-topology/workspace-topology.md`

Dry-run writes review artifacts only. It does not create skeleton folders outside
the golden-path configuration directory.

Allowed dry-run artifacts:

- `.specify/configurations/golden-path/golden-path-scaffold-plan.md`
- `.specify/configurations/golden-path/golden-path-recipe.json`
- `.specify/configurations/golden-path/generated-files-report.md`

Apply mode may create only the paths explicitly listed in an approved recipe and
validated by the safety gates. Apply also refreshes
`.specify/configurations/golden-path/generated-files-report.md`.

## Non-Goals

This workflow does not generate fake business code, does not mutate
`.specify/.specify.json`, does not run shell commands, and does not install
package dependencies.

It also does not change layout, dependency policy, package manager, lint,
runtime routing, migration, environment, CI secret, or tracker issue files.

## Required Report Content

Every dry-run and apply report must include:

- evidence inputs used;
- selected preset, if any;
- target skeleton summary;
- allowed actions;
- created paths;
- skipped paths;
- existing paths;
- refused paths;
- risks;
- assumptions;
- unresolved questions.

## Redaction

Reports must redact values from fields whose keys include token, secret,
password, credential, private, cookie, session, key, auth, or similar sensitive
terms. Do not include absolute local machine paths in reports.
