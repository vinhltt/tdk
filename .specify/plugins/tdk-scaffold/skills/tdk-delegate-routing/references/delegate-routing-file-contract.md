# Delegate Routing File Contract

Route file path:

```text
ROUTING_FILE = {docs.path}/custom-workflow/delegate-routing.md
```

Resolve `docs.path` from the raw project `.specify/.specify.json`; default is `.specify/configurations`. Paths resolve from the project root and must stay inside it. Do not search by filename or glob.

## Format

```markdown
## global

- research: (default - no delegate)
- implement: /project-implement-skill
- test: /project-unit-test-skill

## backend

- implement: /backend-implement-skill, @backend-agent
- test: /backend-unit-test-skill
```

- `## global` is fallback.
- Other `##` headings are sub-workspace names.
- Route lines use `- domain: <delegate>[, <delegate>]`.
- A delegate is either a skill (`/skill-name`) or an agent (`@agent-name`).
- `(default - no delegate)` is a no-op placeholder.
- HTML-commented examples are preserved but inactive.
- Unknown prose and comments must survive `register`.

## Normalize Rules

Consumers read this file directly with the Read tool. Apply these four rules, in order, when resolving a route:

1. **Skip HTML comment lines.** A line whose first non-whitespace characters are `<!--` is inactive — never treat it as a heading or a route.
2. **Skip placeholder tokens.** A token is a placeholder, not a delegate, when it is empty, `none`, `n/a`, or contains both `default` and `no delegate` — for example `(default - no delegate)`. Also accept the legacy text containing both `default` and `no special skill`, such as `(default - no special skill)`, written before the rename. Matching is case-insensitive. A route whose tokens are all placeholders has no delegates.
3. **Normalize the token prefix.** A token starting with `@` is an agent and stays verbatim. Any other token is a skill: if it does not already start with `/`, prepend `/`. A token that cannot be normalized into a well-formed name is **not** rejected — it is kept verbatim as an unrecognized delegate, so a typo stays visible in `diff` output instead of silently disappearing from the route.
4. **Match case-insensitively, first-wins.** Section names and domain names compare case-insensitively. When the same section/domain appears more than once, the first occurrence in file order wins.

## Duplicate Policy

- Identical duplicate section/domain/delegates entries produce warnings, surfaced by `diff`.
- Conflicting delegate lists for the same section/domain are errors; `diff`, `register`, and `verify` all refuse to run until a human resolves them by hand.
