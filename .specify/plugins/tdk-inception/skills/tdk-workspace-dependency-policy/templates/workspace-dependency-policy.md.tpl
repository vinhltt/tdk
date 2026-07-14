# Workspace Dependency Policy

## Evidence Inputs

| Source | Type | Status | Notes |
|---|---|---|---|
| `.specify/configurations/workspace-layout/workspace-layout-proposal.json` | Layout JSON | Replace with used/skipped/missing | Replace with evidence summary |
| `.specify/configurations/workspace-layout/workspace-layout-proposal.md` | Layout report | Replace with used/skipped/missing | Replace with evidence summary |
| `.specify/configurations/workspace-topology/workspace-topology.json` | Legacy topology JSON | Replace with used/skipped/missing | Replace with evidence summary |
| `.specify/configurations/workspace-topology/workspace-topology.md` | Legacy topology report | Replace with used/skipped/missing | Replace with evidence summary |
| `.specify/.specify.json` | Runtime config | Replace with used/skipped/missing | Replace with evidence summary |
| Repo stack evidence | Tooling/imports/packages | Replace with used/skipped/missing | Replace with evidence summary |

## Boundary Inventory

| Boundary | Type | Path | Owner | Runtime-backed? | Confidence | Evidence |
|---|---|---|---|---|---|---|
| Replace with boundary | Replace with sub-workspace/module | Replace with path | Replace with owner or unknown | Yes/No | High/Medium/Low | Replace with evidence |

## Dependency Matrix

| From | To | Current evidence | Policy | Confidence | Notes |
|---|---|---|---|---|---|
| Replace with source boundary | Replace with target boundary | Replace with import/package/layout evidence | Allowed/Forbidden/Unresolved | High/Medium/Low | Replace with rationale |

## Allowed Edges

| From | To | Reason | Evidence | Review owner |
|---|---|---|---|---|
| Replace with source | Replace with target | Replace with reason | Replace with evidence | Replace with owner |

## Forbidden Edges

| From | To | Reason | Existing violation? | Review owner |
|---|---|---|---|---|
| Replace with source | Replace with target | Replace with reason | Yes/No/Unknown | Replace with owner |

## Unresolved Edges

| From | To | Missing evidence | Question |
|---|---|---|---|
| Replace with source | Replace with target | Replace with missing evidence | Replace with question |

## Stack Support

| Stack | Evidence | Recommendation | Limitation |
|---|---|---|---|
| Nx | Replace with detected/missing | Snippet/manual/deferred | Replace with limitation |
| Turborepo Boundaries | Replace with detected/missing | Snippet/manual/deferred | Replace with limitation |
| ESLint no-restricted-imports | Replace with detected/missing | Snippet/manual/deferred | Static imports only |
| TypeScript ESLint no-restricted-imports | Replace with detected/missing | Snippet/manual/deferred | Replace base rule when used |
| dependency-cruiser | Replace with detected/missing | Snippet/manual/deferred | Requires repo-local rule review |
| Non-JS candidates | Replace with detected/missing | Manual/deferred | Requires matching tool evidence |

## Enforcement Snippets

Snippet artifact: `.specify/configurations/workspace-dependency-policy/enforcement-snippets.md`

Status: Replace with written / deferred / not requested.

Every snippet is advisory and copy after human review. This policy does not make
enforcement active.

## Confidence

| Claim | Confidence | Basis | Downgrade trigger |
|---|---|---|---|
| Replace with policy claim | High/Medium/Low | Replace with evidence | Replace with missing proof |

## Risks

| Risk | Impact | Mitigation |
|---|---|---|
| Replace with risk | Replace with impact | Replace with mitigation |

## Recommended Next Route

Recommended: Replace with `/tdk-workflow-config-apply`, human
snippet review, `/tdk-workspace-dependency-policy --audit`, or manual docs only.

## Unresolved Questions

- Replace with unresolved ownership, layout, dependency, stack, or enforcement
  question.
