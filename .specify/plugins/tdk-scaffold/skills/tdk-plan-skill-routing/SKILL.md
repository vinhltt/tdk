---
name: tdk-plan-skill-routing
description: "Initialize, inspect, check, diff, register, verify, and optimize plan-skill-routing.md through the deterministic TDK routing helper."
user-invocable: true
argument-hint: "<init|inspect|check|diff|register|verify|optimize> [--project-root <root>] [--proposal <path>] [--yes]"
metadata:
  version: "2.1.1"
  author: "VinhLTT"
  category: scaffold
---

# tdk-plan-skill-routing

Manage the explicit `{docs.path}/custom-workflow/plan-skill-routing.md` workflow used by `/tdk-plan` (including `--tdd` / `--ut-backfill` test-mode phases) and `/tdk-implement`.

## When To Use

- Create the first route file after the user opts into custom skill routing.
- Inspect or check existing route mappings before planning or implementation.
- Review `plan-skill-routing-proposal.json` emitted beside an approved automation recommendation.
- Register approved route entries after diff review.
- Clean repeated entries after several reviewed updates.

## References

Load only the references needed for the requested action:

- `references/plan-skill-routing-file-contract.md`
- `references/plan-skill-routing-proposal-format.md`
- `references/workflow-init.md`
- `references/workflow-review-register.md`
- `references/update-and-conflict-policy.md`

## Commands

Run from `.specify/scripts/ts`:

```bash
bun src/index.ts routing plan-skill init --project-root <root>
bun src/index.ts routing plan-skill inspect --project-root <root>
bun src/index.ts routing plan-skill check --project-root <root>
bun src/index.ts routing plan-skill diff --project-root <root> --proposal <path>
bun src/index.ts routing plan-skill register --project-root <root> --proposal <path> --yes
bun src/index.ts routing plan-skill verify --project-root <root> --proposal <path>
bun src/index.ts routing plan-skill optimize --project-root <root>
bun src/index.ts routing plan-skill optimize --project-root <root> --yes
```

## Guardrails

- `inspect`, `check`, `diff`, and `verify` are read-only.
- `register` must have `--yes` and must not create a missing route file.
- `init` is the only first-file creation workflow.
- `optimize` is dry-run by default; it writes only with `--yes`.
- Never edit `plan-skill-routing.md` directly as a shortcut around this workflow.
