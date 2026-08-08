# Delegate Routing Reference

Instructions for loading, parsing, and injecting per-project delegate routing into `/tdk-plan` and UT phase bodies. A delegate is either a `/skill` or an `@agent`.

## File Resolution

1. Resolve exact path: `ROUTING_FILE = {docs.path}/custom-workflow/delegate-routing.md` (where `docs.path` comes from `.specify/.specify.json`, default `.specify/configurations`). If `docs.path` is relative, resolve it from the project root; if it is absolute (including a Windows drive path), preserve it.
2. Check existence by reading the exact resolved path. Use the Read tool on `ROUTING_FILE`, or a direct shell file test plus read such as `test -f "$ROUTING_FILE"` then `cat "$ROUTING_FILE"`.
3. **Do not use Search, Grep, Glob, or a pattern like `custom-workflow/delegate-routing.md` to prove absence.** Those tools search file contents or patterns and can return 0 results even when `{docs.path}/custom-workflow/delegate-routing.md` exists.
4. If exact-path read succeeds → parse (next section).
5. If exact-path read fails because the file is missing, first check the legacy name `{docs.path}/custom-workflow/plan-skill-routing.md` with the same exact-path read. If that legacy file exists, emit before continuing:

   ```text
   Legacy routing file detected; rename to delegate-routing.md and migrate @agent syntax
   ```

   Do not read routes out of the legacy file and do not rename it automatically.
6. Then **AskUserQuestion**:
   - Question: "No delegate-routing file found. Do you have custom skills or agents to assign per sub-workspace?"
   - Option A: "Yes, I want to create one" → show template path (`.specify/templates/plan/delegate-routing-template.tpl`) + instructions: copy to `{docs.path}/custom-workflow/delegate-routing.md`, add your `/skill` and `@agent` delegates, then re-run `/tdk-plan`. **STOP** — do not proceed with plan generation until file exists.
   - Option B: "No, skip delegate routing" → set `SKILL_ROUTING = empty`, proceed without injection.

**Never auto-create the routing file.** User must consciously opt in.

## Parsing Rules

**Input**: markdown file at `{docs.path}/custom-workflow/delegate-routing.md`.

Parse the markdown structure:
- Each `## heading` = sub-workspace name (lowercase match against `PROJECT_CONTEXT.subWorkspaces[].name`)
- `## global` = mandatory fallback section for monolith projects or unmatched sub-workspaces
- Each bullet line under a heading: `- {domain}: {delegate} [, {delegate}]`

A delegate token is one of two kinds, and both kinds may appear on the same route line:
- `/`-prefixed → a **skill** (toolset).
- `@`-prefixed → an **agent** (executor).

Normalize each token exactly as `delegate-routing-file-contract.md` specifies — four rules:
1. Trim the token; a delegate must be a single non-empty line.
2. A token starting with `@` is an agent name; every other token is a skill name and gets a leading `/` when it is missing.
3. A well-formed skill name matches `^/[A-Za-z0-9][A-Za-z0-9._:-]*$` and a well-formed agent name matches `^@[A-Za-z0-9][A-Za-z0-9._:-]*$`. A token matching neither is **not** rejected: keep it verbatim as an unrecognized delegate rather than dropping it, so a typo stays visible in `diff` output instead of silently disappearing from the route.
4. Deduplicate delegates within a route, preserving first-seen order.

**Example input** (markdown):
```markdown
## global
- research: (default - no special skill)
- test: /your-consumer-unit-test-skill

## backend
- implement: /your-backend-skill, @your-backend-agent
- database: /your-database-skill
- test: /your-backend-unit-test-skill
```

**Resulting conceptual map** (stored as `SKILL_ROUTING` — in-memory, not a file):
- `global.test` → `["/your-consumer-unit-test-skill"]`
- `backend.implement` → `["/your-backend-skill", "@your-backend-agent"]`
- `backend.database` → `["/your-database-skill"]`
- `backend.test` → `["/your-backend-unit-test-skill"]`

Domains are freeform strings (e.g. research, implement, test, database, design, clarify, styling). The built-in unit-test implementation lookup uses the single `test` domain only. Do not introduce separate `test-plan` or `test-implement` domains.

`/tdk-plan` itself resolves the matching `test` skill for TDD/backfill phases (via `--tdd` / `--ut-backfill`, see `references/modes.md`) and injects it into generated phase files. No separate planning adapter skill reads this file on `/tdk-plan`'s behalf.

## Sub-workspace Matching

- Use `PROJECT_CONTEXT.subWorkspaces[].name` to match `## heading` names (case-insensitive).
- If phase targets a sub-workspace not in the routing file → fall back to `## global`.
- If no `subWorkspaces` configured (monolith project) → use `## global` only.
- If phase targets multiple sub-workspaces → merge skill sets from all matched sections (deduplicate).

## Injection Format

Split the resolved delegates by token prefix into two groups, then inject `## Delegate Skills` first and `## Delegate Agents` immediately after it:

```markdown
## Delegate Skills
- `/{skill-name}` - {brief purpose}

## Delegate Agents
- `@{agent-name}` - {brief purpose}
```

Position of the `## Delegate Skills` heading depends on phase shape; `## Delegate Agents` always follows it directly:

- Non-test phases inject `## Delegate Skills` after `## Key Insights` and before `## Requirements`.
- TDD phases inject `## Delegate Skills` after `## Test Quality Gate` and before `## Regression Gate`.
- UT backfill phases inject `## Delegate Skills` immediately after `## Test Quality Gate`.

One bullet per delegate, ordered as listed in the routing file. Keep each section concise (max 10 lines).

Omit a section entirely when its group is empty. A domain routed to skills only produces exactly the phase body it produces today — no empty `## Delegate Agents` heading.

## Idempotency

Both sections are idempotent, independently and by the same rule.

When injecting into a phase that already has `## Delegate Skills` or `## Delegate Agents` (rewrite/append mode):
- **Replace** the existing section content — do not append a duplicate.
- Detect by scanning for the `^## Delegate Skills$` heading and the `^## Delegate Agents$` heading. Replace everything from that heading until the next `^## ` heading (or EOF).
- When a section exists in the phase but its group is now empty, delete the heading and its body rather than leaving an empty section.
- When only one of the two sections exists, keep the surviving one in place and insert the missing one so the file ends with `## Delegate Skills` before `## Delegate Agents`.

## Red-team / Validate Inline Load

`--red-team` and `--validate` short-circuit Steps 0-4 (per `modes.md`). They do NOT run Step 0.1b.

Instead, these modes inline-load the routing file inside their own workflows:
- **Red-team (Phase 06)**: re-read `{docs.path}/custom-workflow/delegate-routing.md` into `SKILL_ROUTING` so reviewers can assess delegate-assignment quality per phase.
- **Validate (Phase 07)**: load routing file so validation interview can include delegate-routing questions (e.g. "Are skills and agents correctly assigned to sub-workspaces?").

This is a lightweight exact-path read (not full Step 0.1b) — parse the file if present, skip silently if the exact resolved file is missing. Do not AskUserQuestion and do not use Search/Grep/Glob for this inline load.

## EC-11 Mismatch Warning

After parsing, compare `PROJECT_CONTEXT.subWorkspaces[].name` against `## heading` sections in the routing file.

For each sub-workspace with no corresponding section → emit advisory warning:
```
Warning: Sub-workspace '{name}' has no skill routing section - using global defaults.
```

Non-blocking — plan generation continues. Emitted once per plan (not per phase).

Test reference: `sample_spec_kit` has 3 subWorkspaces (SampleWebPage, SampleWebApi, SampleWebSrv) — a mismatch warning should fire if any of these are missing from the routing file.

## Pre-injection Refresh

Before injecting delegates in Step 3b, re-read `{docs.path}/custom-workflow/delegate-routing.md` to refresh `SKILL_ROUTING`. Intermediate steps (memory, research, cross-plan deps) loaded between Step 0.1b and 3b can drift context. Low cost (~15 lines read), prevents stale routing data.

## Unit Test Phase Routing

`/tdk-plan {TASK_ID} --tdd` or `/tdk-plan {TASK_ID} --ut-backfill` generate TDD/backfill canonical phases directly (see `references/design-phase.md` Test Mode Phase Generation). The generated phase files receive `## Delegate Skills` — and `## Delegate Agents` when the entry routes an `@agent` — from the matched `test` entry:

1. Prefer the matched sub-workspace section's `test` entry.
2. Fall back to `global.test`.
3. If neither exists, emit a warning during planning and generate the phase without a `test` delegate; `/tdk-implement` still STOPs at implementation time when a test-like phase has no usable delegate.

This keeps test planning and test implementation delegate resolution inside `/tdk-plan`, with implementation execution handled by `/tdk-implement`.
