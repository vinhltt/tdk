---
source_epic: "{{TASK_ID}}"
artifact_type: "discovery"
status: draft
created: "{{CREATED_AT}}"
---

# Discovery Manifest

> Altitude: Epic-level. Product-wide facts belong in the constitution plus typed memory routes, not this epic artifact.

## Artifact Manifest

| Artifact | Purpose |
|---|---|
| [problem.md](./discovery/problem.md) | Epic-level problem context |
| [personas.md](./discovery/personas.md) | Epic-level persona context |
| [mvp-scope.md](./discovery/mvp-scope.md) | Epic-level MVP boundary context |

## Summary

{{SUMMARY}}

## Product-level signals

Candidate checklist only. Humans decide whether any item belongs in the
constitution or typed memory routes through `/tdk-constitution --update`.

- [ ] Durable market context candidate:
- [ ] Durable business model candidate:
- [ ] Durable audience/persona candidate:
- [ ] Durable competitive context candidate:
- [ ] Durable product constraint candidate:

## Ready For Epic PRD

Advisory only. This checklist is a human readiness read; it never gates
`/tdk-epic-prd`, which runs regardless of how many items are checked.

- [ ] Problem context reviewed (problem, affected users, constraints clear)
- [ ] Persona context reviewed (primary personas + jobs-to-be-done captured)
- [ ] MVP cutline reviewed (items tagged Must/Should/Could/Won't, with at least one Won't)
- [ ] Open questions triaged (deliberate omissions justified inline)
- [ ] No requirement IDs were minted during discovery
