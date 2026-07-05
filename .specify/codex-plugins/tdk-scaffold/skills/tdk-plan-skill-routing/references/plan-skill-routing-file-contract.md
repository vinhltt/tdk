# Plan Skill Routing File Contract

Route file path:

```text
ROUTING_FILE = {docs.path}/custom-workflow/plan-skill-routing.md
```

Resolve `docs.path` from the raw project `.specify/.specify.json`; default is `.specify/configurations`. Paths resolve from the project root and must stay inside it. Do not search by filename or glob.

## Format

```markdown
## global

- research: (default - no special skill)
- implement: /project-implement-skill
- test: /project-unit-test-skill

## backend

- implement: /backend-implement-skill
- test: /backend-unit-test-skill
```

- `## global` is fallback.
- Other `##` headings are sub-workspace names.
- Route lines use `- domain: /skill-name[, /another-skill]`.
- `(default - no special skill)` is a no-op placeholder.
- HTML-commented examples are preserved but inactive.
- Unknown prose and comments must survive `register` and `optimize`.

## Duplicate Policy

- Identical duplicate section/domain/skills entries produce warnings.
- Conflicting skill lists for the same section/domain produce check errors.
- `optimize` may remove identical duplicates and dedupe repeated skills only.
