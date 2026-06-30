# Workspace Topology Proposal

## Evidence Inputs

| Source | Type | Status | Notes |
|---|---|---|---|
| `.specify/configurations/architecture/architecture-decision.md` | Architecture source | Replace with used/skipped/missing | Replace with evidence summary |
| `.specify/configurations/inception/project-inception.md` | Inception | Replace with used/skipped/missing | Replace with evidence summary |
| `.specify/configurations/inception/brownfield-onboarding.md` | Brownfield onboarding | Replace with used/skipped/missing | Replace with evidence summary |
| Scout or repo evidence | Repo structure | Replace with used/skipped/missing | Replace with evidence summary |

## Architecture Source

- Decision status: Replace with Accepted / Deferred / Recovery / Unknown
- Architecture type: Replace with runtime-backed architecture type when safe
- Key assumptions: Replace with explicit assumptions
- Constraints: Replace with non-negotiable constraints

## C4 And DDD Mapping

| Concept | Evidence | Proposed projection | Confidence |
|---|---|---|---|
| System | Replace with workspace/product | Root `.specify` project | Replace with High/Medium/Low |
| Container / sub-system | Replace with container evidence | `subWorkspaces[]` | Replace with High/Medium/Low |
| Bounded context | Replace with context evidence | `subWorkspaces[]` or `modules[]` | Replace with High/Medium/Low |
| Component / module | Replace with component evidence | `modules[]` | Replace with High/Medium/Low |

## Proposed Sub-Workspaces

| Name | Path | Boundary type | Owner | Runtime-backed? | Confidence | Evidence |
|---|---|---|---|---|---|---|
| app | apps/app | application | product-team | Yes | High | Replace with direct evidence |

## Proposed Modules

| Sub-workspace | Module | Path | Test path | Boundary type | Runtime-backed? | Confidence |
|---|---|---|---|---|---|---|
| app | api | src/api | tests/api | component | Yes | Medium |

## Runtime Projection

Runtime-backed fields intended for `workspace-layout-proposal.json`:

- `architecture.type`
- `subWorkspaces[].name`
- `subWorkspaces[].path`
- `subWorkspaces[].docs`
- `subWorkspaces[].testMapping`
- `subWorkspaces[].modules`

Parser safety checks:

- Paths are repo-relative.
- No path traversal or absolute paths.
- No duplicate sub-workspace or module names.
- No shell-like routing values.

## Report-Only Fields

These fields are review context only and are ignored for runtime config:

- `boundaryType`
- `owner`
- `contracts`
- `allowedDependencies`
- `routing`

| Field | Proposal value | Reason |
|---|---|---|
| boundaryType | Replace with application/domain/shared/infrastructure | Explain review intent |
| owner | Replace with owner or unknown | Explain source |
| contracts | Replace with public API/docs/events/etc. | Explain contract |
| allowedDependencies | Replace with allowed dependency names | Explain dependency direction |
| routing | Replace with next route | Explain handoff |

## Desired-State Deltas

Use this section for proposed future changes that should not enter JSON yet,
especially in `--from-existing` mode.

| Delta | Reason | Evidence | Required approval |
|---|---|---|---|
| Replace with desired-state delta | Replace with reason | Replace with evidence | Replace with owner/decision needed |

## Confidence

| Claim | Confidence | Basis | Downgrade trigger |
|---|---|---|---|
| Replace with topology claim | High/Medium/Low | Replace with evidence | Replace with missing proof |

## Risks

| Risk | Impact | Mitigation |
|---|---|---|
| Replace with risk | Replace with impact | Replace with mitigation |

## Recommended Next Route

Recommended: `/tdk-workflow-config-apply`

Only use the recommendation after unresolved questions are cleared and the JSON
proposal is reviewed.

## Unresolved Questions

- Replace with unresolved ownership, deployment, module, path, or architecture
  question.
