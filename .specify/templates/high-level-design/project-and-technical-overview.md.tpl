# Project & Technical Overview: {FEATURE_NAME}

<!--
  Parent epic system and technical design. Sections below marked (assumed)
  originate design detail; tag every originated entry `assumed`. Originated
  detail is NOT a requirement and must not mint UR-*/FR-*/SC-*/FS-* IDs.
-->

## System Context

<!-- From epic PRD context. Where this parent epic sits in the system. -->

{How the epic fits the existing system; upstream/downstream touchpoints}

## Slice Boundary Map

<!-- From epic-prd/slice-map.md plus HLD lens findings. -->

| Slice key | Boundary | Depends on | Shared concern |
|-----------|----------|------------|----------------|
| {slice-key} | {boundary} | {dependencies} | {concern} |

## Dependency Map

<!-- Cross-slice and external dependency assumptions. -->

| Dependency | Direction | Affected slice key(s) | Notes |
|------------|-----------|-----------------------|-------|
| {dependency} | {in/out} | {slice-key} | {source or `assumed`} |

## Interface Assumptions (assumed)

<!-- Originated design detail. Tag each `assumed`. -->

- {Interface assumption} `assumed`

## Security Posture (assumed)

<!-- Originated. Authn/authz, data sensitivity, exposure surface. -->

- {Security consideration} `assumed`

## Operability (assumed)

<!-- Originated. Observability, failure modes, rollout/rollback posture. -->

- {Operability consideration} `assumed`
