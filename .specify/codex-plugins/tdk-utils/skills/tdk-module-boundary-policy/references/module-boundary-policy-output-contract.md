# Module Boundary Policy Output Contract

Module-boundary-policy writes advisory artifacts under:

```text
.specify/configurations/module-boundary-policy/
```

Allowed artifacts:

- `module-boundary-policy.md`
- `enforcement-snippets.md`

No other writes are allowed. The command does not create or update
`.specify/.specify.json`, does not modify source folders, does not update lint,
workspace, package manager, dependency analysis, routing, topology, or ADR files,
and does not enforce module boundaries directly.

## Evidence Requirements

Policy output must be grounded in at least one topology or runtime source:

- `workspace-topology.json`
- `workspace-topology.md`
- existing `.specify/.specify.json`

When topology evidence is missing or weak, write a readiness finding instead of
inventing boundaries, modules, or dependency edges.

Report-only topology fields stay advisory until a future schema expansion:

- `boundaryType`
- `owner`
- `contracts`
- `allowedDependencies`
- `routing`

## Required Policy Report Sections

`module-boundary-policy.md` must include:

- evidence inputs
- boundary inventory
- dependency matrix
- allowed edges
- forbidden edges
- unresolved edges
- stack support
- enforcement snippets summary
- confidence
- risks
- recommended next route
- unresolved questions

## Snippet Contract

`enforcement-snippets.md` is Markdown only. Every stack-specific block must be
marked as copy after human review and must state the detection evidence and
limitation.

Supported initial snippet families:

- Nx module boundary rules when Nx evidence exists
- Turborepo Boundaries when Turborepo evidence exists
- ESLint `no-restricted-imports` when ESLint evidence exists
- typescript-eslint `no-restricted-imports` when TypeScript ESLint evidence exists
- dependency-cruiser rules when dependency-cruiser or JS/TS dependency graph
  evidence exists
- manual docs only when no configured enforcement tool is detected

Non-JS ecosystem tools are cataloged as manual/deferred unless matching repo
evidence exists.

## Safety Rules

- Do not edit config files.
- Do not move, rename, scaffold, or create source modules.
- Do not change package dependencies.
- Do not write `plan-skill-routing.md`.
- Do not write ADR files by default.
- Do not claim enforcement has been enabled until a human applies and validates it.
