# Workspace Layout Proposal Output Contract

Workspace layout proposal writes proposal artifacts under:

```text
.specify/configurations/workspace-layout/
```

Allowed artifacts:

- `workspace-layout-proposal.md`
- `workspace-layout-proposal.json`

No other writes are allowed. The command does not create or update
`.specify/.specify.json`, does not create source directories, does not move or rename
source folders, does not scaffold source, does not enforce dependency policy,
does not write tracker issues, and does not write ADR files.

If `.specify/configurations/workspace-layout/` is missing, create only that
configuration directory. Do not create source directories or scaffold
application code.

## Standard Mode Outputs

Standard mode writes:

- `workspace-layout-proposal.md`
- `workspace-layout-proposal.json`

Use:

- `templates/workspace-layout-proposal.md.tpl`
- `templates/workspace-layout-proposal.json.tpl`

Only write JSON when the architecture source and evidence are strong enough to
name concrete repo-relative paths. Otherwise write markdown readiness notes and
list the missing evidence.

## From Existing Mode Outputs

From existing mode writes the same artifacts, but with an observe-first rule:

- JSON contains observed real folders or packages by default.
- Desired boundaries, ownership shifts, deployment changes, and future folders
  stay in `workspace-layout-proposal.md` until explicitly accepted.

## Unknown Mode Outputs

Unknown mode writes `workspace-layout-proposal.md` as a readiness and sufficiency
report. It writes `workspace-layout-proposal.json` only when available evidence is
sufficient and user-provided constraints remove ambiguity.

## Required Markdown Content

`workspace-layout-proposal.md` must include:

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

`workspace-layout-proposal.json` must stay compatible with the existing topology parser.
Runtime-backed fields:

- `architecture.type`
- `subWorkspaces[].name`
- `subWorkspaces[].path`
- `subWorkspaces[].docs`
- `subWorkspaces[].modules`

Test skill routing is not part of workspace layout JSON. It is configured in
`plan-skill-routing.md` and injected into implementation phases as
`## Delegate Skills`.

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
