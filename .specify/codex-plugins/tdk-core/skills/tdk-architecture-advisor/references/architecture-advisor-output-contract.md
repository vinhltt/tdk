# Architecture Advisor Output Contract

The advisor writes reports under:

```text
.specify/configurations/architecture/
```

Allowed artifacts:

- `architecture-options.md`
- `architecture-decision.md`
- `architecture-recovery.md`

No other writes are allowed. The advisor does not create specs, HLD artifacts,
plans, tasks, tracker issues, source code, topology files, ADR files, or
`.specify/.specify.json`. It does not create or update `.specify/.specify.json`
and does not write `workspace-topology.json`.

## Standard Mode Outputs

Standard mode writes:

- `architecture-options.md`
- `architecture-decision.md`

Use:

- `templates/architecture-options.md.tpl`
- `templates/architecture-decision.md.tpl`

Always write the decision artifact in standard mode. When evidence is not strong
enough for an accepted decision, set `## Status` to `Deferred`, state that no
architecture decision is accepted yet, and record the missing evidence in
unresolved questions and follow-up work.

## Recovery Mode Outputs

Recovery mode writes:

- `architecture-recovery.md`

Use:

- `templates/architecture-recovery.md.tpl`

Recovery mode may write or update `architecture-decision.md` only after explicit
user confirmation. Without confirmation, leave decision artifacts unchanged and
put desired-state guidance, constraints, trade-offs, kill criteria, and
consequences in `architecture-recovery.md`.

## Unknown Mode Output

Unknown mode should avoid a strong architecture decision. If a report is useful,
write only the artifact that matches the safe next route:

- standard readiness notes in `architecture-options.md`, or
- recovery readiness notes in `architecture-recovery.md`.

## Required Content

Reports must include, across the relevant artifacts:

- evidence inputs
- evaluated options
- at least two rejected options in standard mode
- quality attribute scenarios
- constraints
- trade-offs
- trust boundaries and data classification
- assumptions
- unresolved questions
- confidence
- kill criteria
- decision consequences
- follow-up work

## Redaction

Do not include raw secrets, tokens, cookies, session IDs, passwords, private keys,
connection strings, or private environment values. Replace values with
`[REDACTED]` and keep only safe key names or paths when useful.
