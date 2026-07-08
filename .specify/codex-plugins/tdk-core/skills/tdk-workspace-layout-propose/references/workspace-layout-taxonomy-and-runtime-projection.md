# Boundary Taxonomy And Runtime Projection

Use this taxonomy to keep architecture language clear while preserving the
current runtime config contract.

## Hierarchy

| Architecture altitude | Proposal term | Runtime-backed projection |
|---|---|---|
| System | Product/workspace | Root `.specify` project |
| Sub-system or C4 container | Sub-workspace | `subWorkspaces[]` |
| DDD bounded context | Sub-workspace or module | `subWorkspaces[]` when independently owned; `modules[]` when internal |
| Module or component | Module | `subWorkspaces[].modules[]` |
| Feature implementation unit | Future spec/plan work | Not owned by workspace-layout-propose |

## Runtime-Backed Fields

These fields can affect derived `.specify/.specify.json` dry-run output through
the existing topology parser:

- `architecture.type`
- `subWorkspaces[].name`
- `subWorkspaces[].path`
- `subWorkspaces[].docs.path`
- `subWorkspaces[].modules[].name`
- `subWorkspaces[].modules[].path`
- `subWorkspaces[].modules[].testPath`

Test skill routing is configured separately in `plan-skill-routing.md` and
executed from `## Delegate Skills`; it is not projected from workspace layout.

Supported `architecture.type` values are whatever the current parser accepts.
When unsure, omit the runtime field and explain the taxonomy in markdown.

## Report-Only Fields

These fields can clarify review intent but are not runtime config:

- `boundaryType`
- `owner`
- `contracts`
- `allowedDependencies`
- `routing`

Use them to capture proposal intent, team ownership, dependency direction, and
handoff route. The topology parser warns and strips these fields before runtime
config derivation.

## Mapping Rules

- Prefer direct evidence over naming inference.
- Keep desired-state boundaries out of JSON unless the current mode permits them.
- Use markdown to explain ambiguous boundaries, confidence, alternatives, and
  rejected mappings.
- Never rely on `routing` as a command execution plan; it is review prose only.
- Keep path strings repo-relative and aligned with the parser safety rules.

## DDD And C4 Guidance

- A bounded context with independent ownership, docs, tests, or deployment cues
  usually maps to a sub-workspace.
- A component inside one deployable/app boundary usually maps to a module.
- A shared library can be a sub-workspace only when it has clear ownership and
  lifecycle; otherwise record it as a module or unresolved question.
- Cross-cutting infrastructure and generated code should stay out of topology
  JSON unless the repo already treats them as workspaces.
