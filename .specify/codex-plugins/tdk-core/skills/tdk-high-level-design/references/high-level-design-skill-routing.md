# High-Level Design Skill Routing

This reference defines optional consumer skill routing for `/tdk-high-level-design`.

HLD routing is design-stage enrichment only. `/tdk-high-level-design` remains the sole writer of the six HLD artifacts.

## Routing File

Resolve this optional file from project context:

```text
{docs.path}/custom-workflow/high-level-design-skill-routing.md
```

Missing file behavior: continue with built-in lenses.

If the file exists, read it before artifact generation and treat matching consumer skills as advisory design lenses.

## Format

Sections match sub-workspace names from project context. `## global` is the fallback for monoliths and unmatched sub-workspaces.

Line format:

```text
- {lens}: /skill-a, /skill-b
```

Known lens vocabulary:

- `architecture`
- `quality`
- `security`
- `data`
- `api`
- `ux`
- `operability`
- `domain`
- `compliance`

Unknown lenses are allowed but should be treated as advisory labels, not execution domains.

## Example

```markdown
## global

- architecture: /your-consumer-architecture-skill
- security: /your-security-design-skill
- ux: /your-product-flow-skill

## backend

- data: /your-data-lifecycle-skill
- api: /your-api-design-skill
```

## Missing Skill Behavior

When a routed skill is unavailable or cannot be read, warn in the final report and continue with built-in lenses.

Do not block HLD generation solely because a routed consumer skill is missing.

## Consumer Skill Contract

Consumer HLD skills provide advisory output only.

They must:

- read existing project/spec/HLD context only;
- return design notes, risks, assumptions, or questions;
- include lens name, intended HLD artifact target, confidence, and treatment;
- cite existing `UR-*`, `FR-*`, or `SC-*` identifiers when requirement-derived.

They must not write files.
They must not create new requirement IDs.
They must not create tasks, plans, tracker issues, source code, runtime config, or status changes.

Recommended note shape:

```markdown
- Lens: security
  Artifact: project-and-technical-overview.md
  Confidence: medium
  Treatment: assumption
  Note: `assumed` session boundaries need confirmation for FR-3.
```

## Artifact Integration

Fold advisory findings into the existing six artifacts only:

- assumptions and technical context -> `project-and-technical-overview.md`
- flow implications -> `data-flow.md` or `screen-flow.md`
- decisions, risks, rejected options, and follow-ups -> `decisions-and-risks.md`
- source reference coverage -> `requirement-overview.md`

Do not add a delegate-skills section to any HLD artifact.
