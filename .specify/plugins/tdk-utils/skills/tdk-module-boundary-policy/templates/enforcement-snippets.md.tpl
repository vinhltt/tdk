# Module Boundary Enforcement Snippets

All snippets are advisory. Copy after human review only.

## Evidence Summary

| Stack | Evidence | Snippet status |
|---|---|---|
| Nx | Replace with detected/missing | Replace with included/deferred |
| Turborepo Boundaries | Replace with detected/missing | Replace with included/deferred |
| ESLint | Replace with detected/missing | Replace with included/deferred |
| TypeScript ESLint | Replace with detected/missing | Replace with included/deferred |
| dependency-cruiser | Replace with detected/missing | Replace with included/deferred |
| Manual docs only | Replace with reason | Replace with included/deferred |

## Nx

```json
{
  "sourceTag": "scope:replace-source",
  "onlyDependOnLibsWithTags": ["scope:replace-target"]
}
```

Limitation: Nx snippets require repo-local project tags and review against the
current Nx project graph.

## Turborepo Boundaries

```json
{
  "tags": {
    "replace-package": ["replace-tag"]
  },
  "boundaries": {
    "replace-tag": { "dependencies": ["replace-allowed-tag"] }
  }
}
```

Limitation: Turborepo Boundaries are package-level and package-manager-aware.

## ESLint no-restricted-imports

```json
{
  "rules": {
    "no-restricted-imports": ["error", {
      "patterns": ["replace-forbidden-pattern"]
    }]
  }
}
```

Limitation: base ESLint `no-restricted-imports` covers static imports.

## TypeScript ESLint no-restricted-imports

```json
{
  "rules": {
    "no-restricted-imports": "off",
    "@typescript-eslint/no-restricted-imports": ["error", {
      "patterns": ["replace-forbidden-pattern"]
    }]
  }
}
```

Limitation: use the TypeScript extension when type-only imports matter.

## dependency-cruiser

```js
module.exports = {
  forbidden: [
    {
      name: "replace-boundary-rule",
      from: { path: "replace/source" },
      to: { path: "replace/forbidden" }
    }
  ]
};
```

Limitation: dependency-cruiser path patterns need repo-local validation.

## Manual Docs Only

Use this when no matching enforcement stack is detected or evidence is too weak.

| Boundary | Guidance | Owner | Review cadence |
|---|---|---|---|
| Replace with boundary | Replace with guidance | Replace with owner | Replace with cadence |
