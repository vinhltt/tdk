# Enforcement Snippet Catalog

Use this catalog to write reviewable snippet blocks. Snippets are examples for
humans to copy after review; they are not applied by this skill.

## Nx

Evidence required:

- `nx.json`, `project.json`, `workspace.json`, or `@nx/*` package evidence

Use when project boundaries are already modeled as Nx projects or tags. Mention
that Nx enforcement is JS/TS/Nx-specific and depends on project graph tags.

Source references:

- https://nx.dev/docs/features/enforce-module-boundaries
- https://nx.dev/docs/technologies/eslint/eslint-plugin/guides/enforce-module-boundaries

## Turborepo Boundaries

Evidence required:

- `turbo.json`, package manager workspaces, or `turbo` package evidence

Use for package-level workspace boundaries, not arbitrary source-folder modules.
Label the snippet experimental when the repo has not already adopted Turborepo
Boundaries.

Source references:

- https://turborepo.com/docs/reference/boundaries
- https://turborepo.com/docs/core-concepts/internal-packages

## ESLint no-restricted-imports

Evidence required:

- ESLint config and JS/TS import evidence

Use for static import restrictions. State that dynamic imports and non-import
dependency edges are outside the base rule's scope.

Source reference:

- https://eslint.org/docs/latest/rules/no-restricted-imports

## typescript-eslint no-restricted-imports

Evidence required:

- TypeScript ESLint config or `@typescript-eslint/*` package evidence

Prefer the TypeScript extension when type-only imports matter. Snippet text must
state that the base ESLint rule should be disabled when the extension rule
replaces it.

Source reference:

- https://typescript-eslint.io/rules/no-restricted-imports/

## dependency-cruiser

Evidence required:

- dependency-cruiser config/package evidence, or JS/TS dependency graph evidence
  strong enough to propose a future dependency-cruiser block

Use for path/module dependency graph constraints. State that rule patterns need
repo-local review before application.

Source reference:

- https://github.com/sverweij/dependency-cruiser/blob/main/doc/rules-reference.md

## Manual Docs Only

Use when no matching enforcement stack is detected or when topology evidence is
too weak. The report should still produce boundary guidance, risks, and next
questions without writing any config.
