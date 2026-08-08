---
name: tdk-delegate-routing
description: "This skill should be used when the user asks to \"diff a routing proposal\", \"register delegate routes\", \"verify delegate routing\", \"review delegate-routing-proposal.json\", \"set up delegate-routing.md\", or map a domain to a /skill or @agent for /tdk-plan and /tdk-implement. Provides the diff, register, and verify actions of the deterministic TDK delegate routing helper, plus the prompt-driven first-file setup step."
user-invocable: true
argument-hint: "<diff|register|verify> [--project-root <root>] [--proposal <path>] [--yes]"
metadata:
  version: "3.0.0"
  author: "VinhLTT"
  category: scaffold
---

# tdk-delegate-routing

Manage the explicit `{docs.path}/custom-workflow/delegate-routing.md` route file used by `/tdk-plan` (including `--tdd` / `--ut-backfill` test-mode phases) and `/tdk-implement`. A route maps a section/domain pair to one or more delegates — a `/skill` or an `@agent`.

## When To Use

- Review a `delegate-routing-proposal.json` emitted beside an approved automation recommendation.
- Register approved route entries after diff review.
- Verify that an already-registered proposal is still reflected in the route file.
- Guide a user through creating the route file for the first time.

## Commands

Run from `.specify/scripts/ts`:

```bash
bun src/index.ts routing delegate diff --project-root <root> --proposal <path>
bun src/index.ts routing delegate register --project-root <root> --proposal <path> --yes
bun src/index.ts routing delegate verify --project-root <root> --proposal <path>
```

There is no `init` action. Creating the route file is a prompt step — see § First-Time Setup.

## First-Time Setup

When `diff` reports `status: "missing"`, walk the user through creation instead of writing the file silently:

1. Read the project's `.specify/.specify.json` and take `docs.path` (default `.specify/configurations`).
2. Resolve `{docs.path}/custom-workflow/delegate-routing.md` and **print the resolved absolute path** so the user never has to infer `docs.path`.
3. Copy `.specify/templates/plan/delegate-routing-template.tpl` to that path, creating the `custom-workflow/` directory if needed.
4. Let the user edit the copied file, then rerun `diff`.

## Guardrails

- `diff` and `verify` are read-only. `register` mutates the route file and requires `--yes`.
- `register` does **not** create a missing route file. A missing file means the user has not opted into delegate routing — treat it as a prompt to run § First-Time Setup, never as a reason to auto-create.
- Hand-editing `delegate-routing.md` is legitimate. It is the official way to create the file, clean up duplicate routes, and resolve conflicting routes that `register` refuses to touch.
- The one remaining constraint: registering an entry **from a proposal** must go through `diff` → `register --yes`. Never hand-copy proposal entries into the route file.

## References

Load only the references needed for the requested action:

- `references/delegate-routing-file-contract.md` — route file path, line format, and the normalize rules for reading the file directly.
- `references/delegate-routing-proposal-format.md` — proposal JSON schema and entry rules.
- `references/workflow-review-register.md` — the diff → review → register → verify sequence.
- `references/update-and-conflict-policy.md` — what `register` changes, and how duplicates and conflicts are handled.
