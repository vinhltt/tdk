# Skill Routing Reference

Instructions for loading, parsing, and injecting per-project skill routing into `/tdk-plan` and UT phase bodies.

## File Resolution

1. Resolve path: `{docs.path}/custom-workflow/plan-skill-routing.md` (where `docs.path` comes from `.specify.json`, default `.specify/configurations`).
2. If file exists → read and parse (next section).
3. If file missing → **AskUserQuestion**:
   - Question: "No skill-routing file found. Do you have custom skills to assign per sub-workspace?"
   - Option A: "Yes, I want to create one" → show template path (`.specify/templates/plan/plan-skill-routing-template.tpl`) + instructions: copy to `{docs.path}/custom-workflow/plan-skill-routing.md`, add your `/tdk-*` or project-specific skills, then re-run `/tdk-plan`. **STOP** — do not proceed with plan generation until file exists.
   - Option B: "No, skip skill routing" → set `SKILL_ROUTING = empty`, proceed without injection.

**Never auto-create the routing file.** User must consciously opt in.

## Parsing Rules

**Input**: markdown file at `{docs.path}/custom-workflow/plan-skill-routing.md`.

Parse the markdown structure:
- Each `## heading` = sub-workspace name (lowercase match against `PROJECT_CONTEXT.subWorkspaces[].name`)
- `## global` = mandatory fallback section for monolith projects or unmatched sub-workspaces
- Each bullet line under a heading: `- {domain}: {skill-name} [, {skill-name}]`

**Example input** (markdown):
```markdown
## global
- research: (default - no special skill)
- test: /your-consumer-unit-test-skill

## backend
- implement: /your-backend-skill
- database: /your-database-skill
- test: /your-backend-unit-test-skill
```

**Resulting conceptual map** (stored as `SKILL_ROUTING` — in-memory, not a file):
- `global.test` → `["/your-consumer-unit-test-skill"]`
- `backend.implement` → `["/your-backend-skill"]`
- `backend.database` → `["/your-database-skill"]`
- `backend.test` → `["/your-backend-unit-test-skill"]`

Domains are freeform strings (e.g. research, implement, test, database, design, clarify, styling). The built-in unit-test implementation lookup uses the single `test` domain only. Do not introduce separate `test-plan` or `test-implement` domains.

`/tdk-ut-backfill-plan` is not listed in the routing file. It is the TDK planning adapter that reads this file, resolves the matching `test` skill, and writes that consumer implementation skill into generated `ut/phases/*.md` files.

## Sub-workspace Matching

- Use `PROJECT_CONTEXT.subWorkspaces[].name` to match `## heading` names (case-insensitive).
- If phase targets a sub-workspace not in the routing file → fall back to `## global`.
- If no `subWorkspaces` configured (monolith project) → use `## global` only.
- If phase targets multiple sub-workspaces → merge skill sets from all matched sections (deduplicate).

## Injection Format

Inject `## Delegate Skills` into phase body (after `## Key Insights`, before `## Requirements`):

```markdown
## Delegate Skills
- `/{skill-name}` - {brief purpose from routing file context}
- `/{skill-name}` - {brief purpose}
```

One bullet per skill, ordered as listed in routing file. Keep section concise (max 10 lines).

## Idempotency

When injecting into a phase that already has `## Delegate Skills` (rewrite/append mode):
- **Replace** the existing section content — do not append a duplicate.
- Detect by scanning for `^## Delegate Skills$` heading. Replace everything from that heading until the next `^## ` heading (or EOF).

## Red-team / Validate Inline Load

`--red-team` and `--validate` short-circuit Steps 0-4 (per `modes.md`). They do NOT run Step 0.1b.

Instead, these modes inline-load the routing file inside their own workflows:
- **Red-team (Phase 06)**: re-read `{docs.path}/custom-workflow/plan-skill-routing.md` into `SKILL_ROUTING` so reviewers can assess skill-assignment quality per phase.
- **Validate (Phase 07)**: load routing file so validation interview can include skill-routing questions (e.g. "Are skills correctly assigned to sub-workspaces?").

This is a lightweight read (not full Step 0.1b) — parse the file if present, skip silently if missing.

## EC-11 Mismatch Warning

After parsing, compare `PROJECT_CONTEXT.subWorkspaces[].name` against `## heading` sections in the routing file.

For each sub-workspace with no corresponding section → emit advisory warning:
```
Warning: Sub-workspace '{name}' has no skill routing section - using global defaults.
```

Non-blocking — plan generation continues. Emitted once per plan (not per phase).

Test reference: `erc_spec_kit` has 3 subWorkspaces (ErcWebPage, ErcWebApi, ErcWebSrv) — a mismatch warning should fire if any of these are missing from the routing file.

## Pre-injection Refresh

Before injecting skills in Step 3b, re-read `{docs.path}/custom-workflow/plan-skill-routing.md` to refresh `SKILL_ROUTING`. Intermediate steps (memory, research, cross-plan deps) loaded between Step 0.1b and 3b can drift context. Low cost (~15 lines read), prevents stale routing data.

## Unit Test Phase Routing

`/tdk-plan` may delegate UT artifact creation to `/tdk-ut-backfill-plan {TASK_ID}` when unit-test planning is required. The generated UT phase files then receive `## Delegate Skills` from the matched `test` entry:

1. Prefer the matched sub-workspace section's `test` entry.
2. Fall back to `global.test`.
3. If neither exists, emit a warning and generate UT phase files without an implementation delegate.

This keeps UT planning inside TDK and UT implementation inside the consumer project skill selected by `plan-skill-routing.md`.
