---
source_epic: "{{TASK_ID}}"
artifact_type: "index"
status: draft
created: "{{CREATED_AT}}"
---

# Epic PRD Index

> Altitude: Epic-level product alignment. Child specs own requirements.

## Source Discovery

- Discovery index: `../discovery/index.md`
- Problem: `../discovery/problem.md`
- Personas: `../discovery/personas.md`
- MVP scope: `../discovery/mvp-scope.md`

## Artifact Map

| Artifact | Purpose |
|---|---|
| [prd.md](./prd.md) | Product intent, outcomes, appetite, assumptions, and risks |
| [slice-map.md](./slice-map.md) | Slug-keyed child spec candidates and suggested build order |
| [open-questions.md](./open-questions.md) | Blocking and non-blocking ambiguity |

## Readiness Gate

- [ ] Discovery source reviewed
- [ ] MVP appetite reviewed
- [ ] Slice map has no catch-all slice
- [ ] Blocking Questions is empty
- [ ] Ready to seed child `/tdk-specify` commands

## Next Commands

Use `slice-map.md` seeds to create child specs:

```text
/tdk-specify <child-id> "<slice seed>"
```
