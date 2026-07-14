# Brownfield Onboarding Output Contract

Write exactly one artifact:

```text
.specify/configurations/inception/brownfield-onboarding.md
```

Use `templates/brownfield-onboarding.md.tpl` as the report skeleton.

## Required Fields

- selected mode: `full`, `config-only`, or `unknown`
- readiness status: `ready`, `ready-with-assumptions`, or `not-ready`
- recommendation confidence: `high`, `medium`, or `low`
- observed evidence table with confidence labels
- inferred recommendations separated from observed evidence
- current `.specify` config status
- risks, redactions, refusals, and unsafe evidence skipped
- assumptions separated from evidence
- unresolved repo questions
- recommended next route and do-not-proceed guidance

## Readiness Rules

- `ready`: evidence is sufficient for the recommended safe next route.
- `ready-with-assumptions`: evidence supports a route only if listed assumptions are accepted.
- `not-ready`: missing or conflicting evidence makes the next route unreliable.

## Completion Check

Before reporting completion, verify:

- no source folder was created, moved, renamed, formatted, scaffolded, or refactored;
- `.specify/.specify.json` was not created or updated;
- raw secrets, tokens, private keys, passwords, cookies, and connection strings are absent;
- product-scope questions are not included except as a later route recommendation;
- recommendations are phrased as follow-up commands, not completed work.
