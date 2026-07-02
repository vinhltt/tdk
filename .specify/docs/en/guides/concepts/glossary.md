# Glossary

Use this glossary when TDK docs or generated files use terms that are new to you.

| Term | Meaning |
|---|---|
| TDK | Prefix for the workflow toolkit for Claude Code. |
| Slash command | A `/tdk-*` command typed in Claude Code chat. Internally, commands are plugin skills. |
| Spec file | `.specify/specs/<id>/spec.md`, the source of truth for one feature or child slice. |
| Requirement authority | The file that owns accepted requirements. For feature work, this is `spec.md`. |
| Clarify | The step that asks and records missing decisions in `spec.md`. |
| Plan file | `.specify/specs/<id>/plan.md`, the implementation sequence for the accepted spec. |
| Phase | One implementation chunk listed in `plan.md`. |
| Implement | The step that executes one or more phases from `plan.md`. |
| Artifact | A generated or maintained file in the TDK workflow. |
| Gate | A check that should pass before moving to the next command. |
| Epic | A broad body of work that should be broken into smaller child specs. |
| Child spec | A feature spec created from one slice of a broad epic. |
| Discovery | Optional context for a broad epic. It does not own requirements. |
| Epic PRD | Product alignment and slice-map context for an epic. |
| HLD | High-level design context, usually for parent epic decomposition. |
| Task breakdown | Child spec seed files generated from epic PRD and HLD context. |

## The Short Mental Model

```text
epic -> discovery -> epic-prd -> epic-hld -> task-breakdown -> child specs
```

For each child feature:

```text
specify -> clarify -> plan -> implement -> verify
```

## Source Of Truth Rules

- `spec.md` owns feature requirements.
- `plan.md` owns implementation order.
- Discovery and epic PRD provide context, not final requirements.
- HLD guides design and decomposition, not implementation tasks by itself.
- Generated files should be read through their manifest or index first.
