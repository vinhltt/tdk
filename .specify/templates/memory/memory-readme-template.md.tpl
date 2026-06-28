---
title: "Memory README"
aliases:
  - "Memory guide"
type: memory-readme
id: "memory.readme"
status: active
authority: memory
binding: false
related:
  - path: memory-index.md
    rel: index
tags:
  - memory/readme
created_at: "{YYYY-MM-DD}"
updated_at: "{YYYY-MM-DD}"
updated_by: tdk-memory-init
---

# Memory

This folder contains project memory. The root contains control files only:

- `README.md`
- `constitution.md`
- `memory-index.md`
- `memory.yaml`
- `memory-map.canvas`
- `CHANGELOG.md`

Typed memory files are created lazily by `tdk-memory-update` when there is
evidence or an accepted user request. Do not create empty placeholder folders.

## Route Summary

Use `memory-index.md` as the source of truth for route and template selection.

## Binding Rules

- Files with `binding: true` are canonical evidence for agents and Guardian.
- Files with `binding: false` are summaries or read-models.
- `arc42/` summaries are non-binding unless they link to typed binding facts.
