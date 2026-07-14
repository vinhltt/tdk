---
name: tdk-module-boundary-policy
description: "Deprecated compatibility route for /tdk-workspace-dependency-policy."
user-invocable: true
argument-hint: "[topology|file] [--audit|--suggest]"
related-skills:
  - tdk-workspace-dependency-policy
  - tdk-workspace-layout-propose
  - tdk-workflow-config-apply
metadata:
  version: "1.0.0"
  author: "VinhLTT"
  category: architecture-workflow
---

# tdk-module-boundary-policy

This is a deprecated compatibility route for `/tdk-workspace-dependency-policy`.

Trigger: `/tdk-module-boundary-policy [topology|file] [--audit|--suggest]`

Use `/tdk-workspace-dependency-policy` for new work. During the transition window,
this route preserves the old command name for users and docs that still refer to
module boundary policy.

Legacy artifact names remain readable:

- `.specify/configurations/module-boundary-policy/module-boundary-policy.md`
- `.specify/configurations/module-boundary-policy/enforcement-snippets.md`

Canonical new artifacts are written by `/tdk-workspace-dependency-policy`:

- `.specify/configurations/workspace-dependency-policy/workspace-dependency-policy.md`
- `.specify/configurations/workspace-dependency-policy/enforcement-snippets.md`

Delegate execution to `/tdk-workspace-dependency-policy` with the same
arguments.
