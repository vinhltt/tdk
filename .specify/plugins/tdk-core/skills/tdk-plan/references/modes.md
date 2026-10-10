# Workflow Modes

Single source of truth for `/tdk-plan` flag dispatch. SKILL.md only routes; this file decides what each mode runs.

## Grammar

```
/tdk-plan <TASK_ID> [USER_CONTENT...] [--fast | --hard] [--tdd | --ut-backfill] [--sub-workspace <name>] [--module <name>] [--standalone] [--red-team | --validate | --migrate-artifacts | --refresh-routing] [USER_CONTENT...]
```

- `<TASK_ID>` — first argument token, mandatory. Regex: `^([a-zA-Z]+/)?([a-zA-Z]+)-([0-9]+)$`.
- `USER_CONTENT` — optional freeform text after `<TASK_ID>`. Preserve order after removing known flags.
- Known mode flags may appear anywhere after `<TASK_ID>`.
- Flags fall into three independent categories: speed (`--fast`, `--hard`), test (`--tdd`, `--ut-backfill`), action (`--red-team`, `--validate`, `--migrate-artifacts`, `--refresh-routing`). Flags within the same category are **mutually exclusive**. Multiple flags from the same category → STOP with error.
- `--fast` is incompatible with `--tdd` and `--ut-backfill` (fast prunes research/UT work). `--hard` and default (no speed flag) both compose with either test flag.
- `--migrate-artifacts` and `--refresh-routing` are action-only. Each conflicts with every speed, test, targeting, and other action flag, including one another. Reject conflicts before any mutation. Migration defaults to a mutation-free dry run; refresh requires an existing plan and explicit approval of a selected-phase preview.
- Any token beginning with `--` that is not an exact whitelisted mode flag → STOP with error.
- Backfill targeting flag values are not `USER_CONTENT`; parse and store them in `BACKFILL_TARGET`.
- No `--auto` flag. No auto-detection. No-flag invocation = default full flow.

## Test Mode Flags

`--tdd` and `--ut-backfill` select `test_mode` for the generated plan. They are independent of the speed mode (`--fast` / `--hard` / default) and independent of action flags (`--red-team` / `--validate`).

| test_mode | Flag | Behavior |
|---|---|---|
| `none` | (no flag) | Current non-test planning behavior. |
| `tdd` | `--tdd` | Canonical phases add tests-first sections (`## Tests Before`, `## Refactor / Implementation`, `## Tests After`, `## Test Quality Gate`, `## Regression Gate`). |
| `ut_backfill` | `--ut-backfill` | Canonical phases add backfill-focused sections (`## Code Summary`, `## Mocks & Fixtures Required`, `## Test Matrix`, `## Test Quality Gate`). |

TDD phases order `## Tests Before`, `## Refactor / Implementation`, `## Tests After`, `## Test Quality Gate`, `## Regression Gate`.

UT backfill phases order `## Code Summary`, `## Mocks & Fixtures Required`, `## Test Matrix`, `## Test Quality Gate`, then `## Delegate Skills` and `## Delegate Agents` when routing injects delegates. Each delegate section is omitted when its group is empty.

`--fast` is incompatible with `--tdd` and `--ut-backfill`. `--hard` and the default speed mode both compose with either test flag. Future rigor modes such as `--deep` or `--parallel`, if added to `/tdk-plan`, should compose with test modes the same way `--hard` does.

## Backfill Targeting Flags

Only valid when `--ut-backfill` is present. STOP if any of these appear without `--ut-backfill`, if `--sub-workspace` or `--module` is missing its value, or if `--module` appears without `--sub-workspace`.

| Flag | Requires | Purpose |
|---|---|---|
| `--sub-workspace <name>` | `--ut-backfill` | Target one sub-workspace for backfill phase generation. |
| `--module <name>` | `--sub-workspace <name>` | Narrow targeting to one module inside the sub-workspace. |
| `--standalone` | `--ut-backfill` | Backfill existing code without requiring `spec.md`. |

Store parsed targeting as:

```text
BACKFILL_TARGET = {
  sub_workspace: "<name>" | "",
  module: "<name>" | "",
  standalone: true | false
}
```

Natural-language sub-workspace/module mentions and CWD auto-detection remain acceptable fallback behavior when these flags are absent, per existing `/tdk-plan` project-context resolution (Step 0.1 `tdk-load-project-context`).

## USER_CONTENT Routing

| Mode | Routing |
|---|---|
| default, `--fast`, `--hard` | Treat `USER_CONTENT` as planning instruction for Step 2/3 and append/update intent. |
| `--red-team` | Treat `USER_CONTENT` as red-team focus for reviewer prompts. |
| `--validate` | Treat `USER_CONTENT` as validation focus for question generation. |
| `--migrate-artifacts` | Ignore freeform planning intent; dry-run legacy artifact consolidation for the resolved feature. |
| `--refresh-routing` | Ignore freeform planning intent; preview delegate drift on the existing plan and ask before refreshing eligible phases. |

## Per-Mode Matrix

| Step | default (no flag) | `--fast` | `--hard` |
|---|---|---|---|
| Step 0 Validate TASK_ID | yes | yes | yes |
| Step 0.1 Project context | yes | yes | yes |
| Step 0.1b Skill routing | yes | yes | yes |
| Step 0.memory pre-load | yes | **yes** | yes |
| Step 0.scope (Phase 04) | yes | skip | yes |
| Step 0.deps (Phase 05) | yes | skip | yes |
| Step 1 Setup script | yes | yes | yes |
| Step 1.5 Existing plan | yes | yes | yes |
| Step 1.7 Mode dispatch | — | — | — |
| Step 2 Load context | yes | yes | yes |
| Step 3 Research | 1 researcher | skip | 2 parallel |
| Step 3 Design | yes | minimal | full |
| Step 3 Phase 0.guardian | yes | **skip** | yes |
| Step 3 Test-mode phase generation | when `test_mode != none` | unavailable (`--fast` conflicts) | when `test_mode != none` |
| Step 4 Report | yes | yes | yes |
| Step 4.5 Red team (Phase 06) | no | skip | yes |
| Step 4.7 Validate (Phase 07) | prompt | skip | prompt |

`--fast` keeps Step 0.memory and skips Phase 0.guardian. `mode: load` returns
content the plan is actually written from, so it stays; guardian spawns a second
full subagent pass over the drafted plan, making it the most expensive step in
the flow. Guardian skips zero binding coverage; unknown coverage blocks when
validation is selected rather than silently disabling the gate. See
`references/gates.md` Phase 0.guardian for that precondition, spawn details, and
NOT CHECKED handling and persistent blocking state. Only research / scope / deps / guardian / red-team /
validate are skipped in `--fast`; test modes are rejected before dispatch.

`--red-team` and `--validate` are subcommand-equivalent action flags. They short-circuit straight into Phase 06 / 07 over an existing plan; they do NOT run Steps 0–4 again. `--migrate-artifacts` and `--refresh-routing` short-circuit immediately after project context, before setup or generation: migration follows `migrate-artifacts-workflow.md`; refresh follows **Refresh Routing Only** in `delegate-routing-injection.md`. Neither runs the missing-routing opt-in question, memory, scope, dependencies, design, generation gates, or review workflows.

## Frontmatter Write Rules

- `mode: fast` — written only on `--fast`.
- `mode: hard` — written only on `--hard`.
- No-flag default → omit `mode:` (or leave the reserved default per `plan-output-contract.md`).
- `--red-team` / `--validate` invocations don't change `mode:`; they bump `red_team_session` / `validation_session`.
- `test_mode: tdd` — written only on `--tdd`.
- `test_mode: ut_backfill` — written only on `--ut-backfill`.
- No test flag → omit `test_mode:` (or leave the reserved default `none` per `plan-output-contract.md`).
- `--red-team` / `--validate` invocations don't change `test_mode:`.
- `--refresh-routing` changes no plan frontmatter or statuses; it uses the existing plan-level `test_mode` for resolver anchors and backfill test-only semantics.

## Conflict Handling

| Input | Result |
|---|---|
| `<TASK_ID>` | dispatch default |
| `<TASK_ID> <content>` | dispatch default with `USER_CONTENT` as planning instruction |
| `<TASK_ID> --fast` | dispatch fast |
| `<TASK_ID> --fast <content>` | dispatch fast with `USER_CONTENT` as planning instruction |
| `<TASK_ID> --hard` | dispatch hard |
| `<TASK_ID> <content> --hard` | dispatch hard with `USER_CONTENT` as planning instruction |
| `<TASK_ID> --red-team` | dispatch red-team subcommand |
| `<TASK_ID> <content> --red-team` | dispatch red-team subcommand with `USER_CONTENT` as red-team focus |
| `<TASK_ID> --validate` | dispatch validate subcommand |
| `<TASK_ID> --validate <content>` | dispatch validate subcommand with `USER_CONTENT` as validation focus |
| `<TASK_ID> --migrate-artifacts` | dispatch migration dry-run; ask before apply |
| `<TASK_ID> --migrate-artifacts --hard` | STOP — `Error: --migrate-artifacts cannot combine with planning or review modes.` |
| `<TASK_ID> --refresh-routing` | dispatch existing-plan all-phase scan, selected-phase preview, approval-bound apply; no generation |
| `<TASK_ID> --refresh-routing --hard` | STOP — `Error: --refresh-routing cannot combine with planning, targeting, or review modes.` |
| `<TASK_ID> --refresh-routing --tdd` | STOP — `Error: --refresh-routing cannot combine with planning, targeting, or review modes.` |
| `<TASK_ID> --refresh-routing --standalone` | STOP — `Error: --refresh-routing cannot combine with planning, targeting, or review modes.` |
| `<TASK_ID> --refresh-routing --red-team` | STOP — `Error: --refresh-routing cannot combine with planning, targeting, or review modes.` |
| `<TASK_ID> --migrate-artifacts --refresh-routing` | STOP — `Error: --migrate-artifacts and --refresh-routing are mutually exclusive action flags.` |
| `<TASK_ID> --fast --hard` | STOP — `Error: --fast and --hard are mutually exclusive.` |
| `<TASK_ID> --tdd` | dispatch default with `test_mode: tdd` |
| `<TASK_ID> --hard --tdd` | dispatch hard with `test_mode: tdd` |
| `<TASK_ID> --ut-backfill` | dispatch default with `test_mode: ut_backfill` |
| `<TASK_ID> --hard --ut-backfill` | dispatch hard with `test_mode: ut_backfill` |
| `<TASK_ID> --tdd --ut-backfill` | STOP — `Error: --tdd and --ut-backfill are mutually exclusive.` |
| `<TASK_ID> --fast --tdd` | STOP — `Error: --fast is incompatible with --tdd and --ut-backfill.` |
| `<TASK_ID> --fast --ut-backfill` | STOP — `Error: --fast is incompatible with --tdd and --ut-backfill.` |
| `<TASK_ID> --ut-backfill --sub-workspace api` | dispatch default with `test_mode: ut_backfill`, sub-workspace `api` |
| `<TASK_ID> --ut-backfill --sub-workspace api --module orders` | dispatch default with `test_mode: ut_backfill`, sub-workspace `api`, module `orders` |
| `<TASK_ID> --ut-backfill --standalone` | dispatch default with `test_mode: ut_backfill`, standalone (no `spec.md` required) |
| `<TASK_ID> --sub-workspace api` | STOP — `Error: --sub-workspace requires --ut-backfill.` |
| `<TASK_ID> --ut-backfill --sub-workspace` | STOP — `Error: --sub-workspace requires a value.` |
| `<TASK_ID> --ut-backfill --module orders` | STOP — `Error: --module requires --sub-workspace.` |
| `<TASK_ID> --ut-backfill --sub-workspace api --module` | STOP — `Error: --module requires a value.` |
| `<TASK_ID> --foo` | STOP — `Error: unknown flag --foo. Allowed: --fast, --hard, --tdd, --ut-backfill, --red-team, --validate, --migrate-artifacts, --refresh-routing.` |
| `<TASK_ID> --foo=bar` | STOP — `Error: unknown flag --foo=bar. Allowed: --fast, --hard, --tdd, --ut-backfill, --red-team, --validate, --migrate-artifacts, --refresh-routing.` |
| `<TASK_ID> --phase=02` | STOP — `Error: unknown flag --phase=02. Allowed: --fast, --hard, --tdd, --ut-backfill, --red-team, --validate, --migrate-artifacts, --refresh-routing.` |
| `<TASK_ID> --fast=true` | STOP — `Error: unknown flag --fast=true. Allowed: --fast, --hard, --tdd, --ut-backfill, --red-team, --validate, --migrate-artifacts, --refresh-routing.` |
| `<TASK_ID> --fast --foo <content>` | STOP — `Error: unknown flag --foo. Allowed: --fast, --hard, --tdd, --ut-backfill, --red-team, --validate, --migrate-artifacts, --refresh-routing.` |
| `<content> <TASK_ID>` | STOP — `Error: TASK_ID must be the first argument; known mode flags must appear after TASK_ID.` |

## Banner Output

When mode is non-default, print one line at the start of Step 4 Report:

```
Mode: fast — research / scope / deps / guardian / red-team / validate skipped; test modes unavailable.
Mode: hard — full research, scope challenge, cross-plan deps, red-team review.
```
