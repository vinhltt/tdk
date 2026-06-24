# Boundary Map Output Contract

Boundary-map writes proposal artifacts under:

```text
.specify/configurations/workspace-topology/
```

Allowed artifacts:

- `workspace-topology.md`
- `workspace-topology.json`

No other writes are allowed. The command does not create or update
`.specify/.specify.json`, does not create directories, does not move or rename
source folders, does not scaffold source, does not enforce module boundaries,
does not write tracker issues, and does not write ADR files.

If `.specify/configurations/workspace-topology/` is missing, stop and report the
required setup path. Do not create it in this slice.

## Standard Mode Outputs

Standard mode writes:

- `workspace-topology.md`
- `workspace-topology.json`

Use:

- `templates/workspace-topology.md.tpl`
- `templates/workspace-topology.json.tpl`

Only write JSON when the architecture source and evidence are strong enough to
name concrete repo-relative paths. Otherwise write markdown readiness notes and
list the missing evidence.

## From Existing Mode Outputs

From existing mode writes the same artifacts, but with an observe-first rule:

- JSON contains observed real folders or packages by default.
- Desired boundaries, ownership shifts, deployment changes, and future folders
  stay in `workspace-topology.md` until explicitly accepted.

## Unknown Mode Outputs

Unknown mode writes `workspace-topology.md` as a readiness and sufficiency
report. It writes `workspace-topology.json` only when available evidence is
sufficient and user-provided constraints remove ambiguity.

## Required Markdown Content

`workspace-topology.md` must include:

- evidence inputs
- architecture source
- C4 and DDD mapping
- proposed sub-workspaces
- proposed modules
- runtime projection
- report-only fields
- confidence
- risks
- recommended next route
- unresolved questions

## JSON Handoff Shape

`workspace-topology.json` must stay compatible with the existing topology parser.
Runtime-backed fields:

- `architecture.type`
- `subWorkspaces[].name`
- `subWorkspaces[].path`
- `subWorkspaces[].docs`
- `subWorkspaces[].testMapping`
- `subWorkspaces[].modules`

Report-only fields may appear in proposal artifacts and are ignored by runtime
config derivation:

- `boundaryType`
- `owner`
- `contracts`
- `allowedDependencies`
- `routing`

Use safe repo-relative paths only. Do not include traversal, absolute paths,
null bytes, shell-like routing values, raw secrets, private logs, tokens,
cookies, passwords, private keys, or environment values.
