# High-Level Design Skill Routing

Copy this file to:

```text
{docs.path}/custom-workflow/high-level-design-skill-routing.md
```

This file is optional and HLD-only. `/tdk-high-level-design` reads it as advisory design routing before writing the six HLD artifacts. `/tdk-plan` does not consume this file.

Known lenses: `architecture`, `quality`, `security`, `data`, `api`, `ux`, `operability`, `domain`, `compliance`.

Line format:

```text
- {lens}: /skill-a, /skill-b
```

## global

- architecture: (default - built-in lenses only)
- quality: (default - built-in lenses only)
- security: (default - built-in lenses only)
- data: (default - built-in lenses only)
- ux: (default - built-in lenses only)
- operability: (default - built-in lenses only)

<!-- ## backend -->
<!-- - architecture: /your-backend-architecture-design-skill -->
<!-- - data: /your-data-lifecycle-design-skill -->
<!-- - api: /your-api-contract-design-skill -->
<!-- - security: /your-security-design-skill -->

<!-- ## frontend -->
<!-- - ux: /your-product-flow-design-skill -->
<!-- - quality: /your-frontend-quality-design-skill -->
<!-- - accessibility: /your-accessibility-design-skill -->

<!-- Add more sections matching sub-workspaces in project context. -->

Consumer HLD skills are advisory only. They may return design notes, risks, assumptions, or questions, but must not write files, create requirement IDs, create tasks/plans, or change tracker/config/status state.
