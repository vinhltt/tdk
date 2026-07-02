# Guide Page Type Rules

Use one dominant page type. A page may start with brief context, but split when it becomes half workflow and half reference.

## Page Types

| Type | Use for | Folder or file |
|---|---|---|
| Workflow | Doing one runnable task | `guides/scenarios/*.md` |
| Setup | Install/config tasks | `guides/setup/*.md` |
| Concept | Mental model and why | `guides/concepts/*.md` |
| Reference | Complete facts, tables, command details | `skills-guide.md`, future `reference/*.md` |
| Troubleshooting | Problem, cause, fix | End of workflow page or separate page after 5+ issues |

## Split Rules

- One workflow page owns one job.
- Put flow before detail.
- Each `/tdk-*` command step includes expected files and a gate.
- Keep command flags in a reference source; workflow pages show common path only.
- Link to concept/reference pages instead of explaining every artifact inline.
- Use tables for command, artifact, and reference facts.
- Use numbered steps only for execution order.
- Keep common mistakes near the workflow.

## Route Rules

- `guides/index.md` is the guide area route map.
- Do not keep `docs/en/index.md` as a guide landing or duplicate route map. Route English entry links directly to `docs/en/guides/index.md`.
- Subfolder landing pages should be named, not canonical `index.md`, unless renderer/link inventory requires shims.

## Language Rules

- English guide docs are canonical first-pass source for this skill.
- After English owner review/done, suggest sync steps for every language folder discovered under `projects/tdk/.specify/docs/`.
- Do not hard-code Vietnamese. Treat `vi`, `jp`, and future folders generically.
- Do not update non-English docs in v1 unless the user explicitly asks.
- When translating `docs/vi/`, use natural Vietnamese with full diacritics; keep commands, flags, file paths, code blocks, and identifiers unchanged.
