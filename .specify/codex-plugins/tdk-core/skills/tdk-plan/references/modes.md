# Workflow Modes

Single source of truth for `/tdk-plan` flag dispatch. SKILL.md only routes; this file decides what each mode runs.

## Grammar

```
/tdk-plan <TASK_ID> [USER_CONTENT...] [--fast | --hard | --red-team | --validate] [USER_CONTENT...]
```

- `<TASK_ID>` — first argument token, mandatory. Regex: `^([a-zA-Z]+/)?([a-zA-Z]+)-([0-9]+)$`.
- `USER_CONTENT` — optional freeform text after `<TASK_ID>`. Preserve order after removing known flags.
- Known mode flags may appear anywhere after `<TASK_ID>`.
- Action flags are **mutually exclusive**. Multiple → STOP with error.
- Any token beginning with `--` that is not an exact whitelisted mode flag → STOP with error.
- No `--auto` flag. No auto-detection. No-flag invocation = default full flow.

## USER_CONTENT Routing

| Mode | Routing |
|---|---|
| default, `--fast`, `--hard` | Treat `USER_CONTENT` as planning instruction for Step 2/3 and append/update intent. |
| `--red-team` | Treat `USER_CONTENT` as red-team focus for reviewer prompts. |
| `--validate` | Treat `USER_CONTENT` as validation focus for question generation. |

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
| Step 3 Phase 0.guardian | yes | **yes** | yes |
| Step 3 UT auto-inclusion | yes | **skip** | yes |
| Step 4 Report | yes | yes | yes |
| Step 4.5 Red team (Phase 06) | no | skip | yes |
| Step 4.7 Validate (Phase 07) | prompt | skip | prompt |

`--fast` keeps Step 0.memory **and** Phase 0.guardian per Key Constraint #2 — memory-guardian is binding-invariant cheap and the regression risk of bypassing it dwarfs the ~500-token cost. See `references/gates.md` Phase 0.guardian for spawn details and MCP_UNAVAILABLE handling. Only research / scope / deps / red-team / validate / UT are skipped in `--fast`.

`--red-team` and `--validate` are subcommand-equivalent action flags. They short-circuit straight into Phase 06 / 07 over an existing plan; they do NOT run Steps 0–4 again. See `red-team-workflow.md` and `validate-workflow.md`.

## Frontmatter Write Rules

- `mode: fast` — written only on `--fast`.
- `mode: hard` — written only on `--hard`.
- No-flag default → omit `mode:` (or leave the reserved default per `plan-output-contract.md`).
- `--red-team` / `--validate` invocations don't change `mode:`; they bump `red_team_session` / `validation_session`.

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
| `<TASK_ID> --fast --hard` | STOP — `Error: --fast and --hard are mutually exclusive.` |
| `<TASK_ID> --foo` | STOP — `Error: unknown flag --foo. Allowed: --fast, --hard, --red-team, --validate.` |
| `<TASK_ID> --foo=bar` | STOP — `Error: unknown flag --foo=bar. Allowed: --fast, --hard, --red-team, --validate.` |
| `<TASK_ID> --phase=02` | STOP — `Error: unknown flag --phase=02. Allowed: --fast, --hard, --red-team, --validate.` |
| `<TASK_ID> --fast=true` | STOP — `Error: unknown flag --fast=true. Allowed: --fast, --hard, --red-team, --validate.` |
| `<TASK_ID> --fast --foo <content>` | STOP — `Error: unknown flag --foo. Allowed: --fast, --hard, --red-team, --validate.` |
| `<content> <TASK_ID>` | STOP — `Error: TASK_ID must be the first argument; known mode flags must appear after TASK_ID.` |

## Banner Output

When mode is non-default, print one line at the start of Step 4 Report:

```
Mode: fast — research / scope / deps / red-team / validate / UT skipped.
Mode: hard — full research, scope challenge, cross-plan deps, red-team review.
```
