---
name: tdk-boundary-map
description: "Deprecated compatibility route for /tdk-workspace-layout-propose."
user-invocable: true
argument-hint: "[input|file] [--from-existing|--unknown]"
related-skills:
  - tdk-workspace-layout-propose
  - tdk-workflow-config-apply
metadata:
  version: "1.0.0"
  author: "VinhLTT"
  category: architecture-workflow
---

# tdk-boundary-map

This is a deprecated compatibility route for `/tdk-workspace-layout-propose`.

Trigger: `/tdk-boundary-map [input|file] [--from-existing|--unknown]`

Use `/tdk-workspace-layout-propose` for new work. During the transition window,
this route preserves the old command name for users and docs that still refer to
boundary maps.

Legacy artifact names remain readable by downstream tools:

- `.specify/configurations/workspace-topology/workspace-topology.md`
- `.specify/configurations/workspace-topology/workspace-topology.json`

Canonical new artifacts are written by `/tdk-workspace-layout-propose`:

- `.specify/configurations/workspace-layout/workspace-layout-proposal.md`
- `.specify/configurations/workspace-layout/workspace-layout-proposal.json`

Delegate execution to `/tdk-workspace-layout-propose` with the same arguments.
