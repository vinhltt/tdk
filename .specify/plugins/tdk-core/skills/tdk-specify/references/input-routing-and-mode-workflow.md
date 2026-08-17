# Input Routing And Mode Workflow

Use this reference for `/tdk-specify` Steps 0.2, 0.2a, 0.3, 0.memory, and 1.5.

## Step 0.2: Check Feature Description & Create Feature Directory

- Extract second argument onwards as description.
- Before the description-required check, scan only for standalone `--fast` and
  `--interview` so ID-only replay can be routed safely. This early parse does
  not replace Step 0.3 mode detection for normal creation.
- Unknown flags STOP before specs are read or written. Report:
  `Unknown flag: <flag>. Usage: /tdk-specify {task-id} [description] [--fast] [--interview]`.
- Strip `--fast` and `--interview` from the second argument onward and store the
  remaining text as the cleaned description.

Determine paths from PROJECT_CONTEXT:

- `SPECS_ROOT` = project's `.specify` root
- `FOLDER` = parsed from TASK_ID (prefix folder or defaultFolder)
- `TICKET_ID` = parsed ticket identifier (e.g. `tdk-001`)
- `FEATURE_DIR` = `$SPECS_ROOT/$FOLDER/$TICKET_ID`
- `SPEC_FILE` = `$FEATURE_DIR/spec.md`

Route missing-description and replay cases before duplicate-spec handling:

- If cleaned description is exactly `interview`, STOP before creation or replay routing:
  ```text
  positional `interview` is not a mode. Did you mean `--interview`?
  ```
- If cleaned description is empty and both `--fast` and `--interview` are present, STOP:
  ```text
  `--fast --interview` requires a feature description. Usage: /tdk-specify <id> <description> --fast --interview
  ```
- If cleaned description is empty and `--interview` is present:
  - If `spec.md` is missing, STOP:
    ```text
    Spec replay interview requires existing `spec.md`. Create the spec first with /tdk-specify <id> <description> --interview.
    ```
  - If `spec.md` exists, set `SPEC_INTERVIEW=true` and set `SPEC_REPLAY_INTERVIEW=true`; skip duplicate-spec STOP and continue with the existing artifact.
- If cleaned description is empty and replay is not active, ERROR:
  ```text
  Description required. Usage: /tdk-specify {task-id} {description} [--fast] [--interview]
  ```

Check duplicate spec file:

```bash
SPEC_FILE="$FEATURE_DIR/spec.md"
test -f "$SPEC_FILE" && echo "ERROR: Ticket spec already exists" || echo "OK"
```

If `spec.md` exists and `SPEC_REPLAY_INTERVIEW` is not true -> ERROR, STOP.
If `spec.md` is missing but `$FEATURE_DIR/discovery.md` exists, STOP before
writing:

```text
Discovery is parent epic context, not a direct predecessor for /tdk-specify. Continue with /tdk-epic-prd <id>, then /tdk-epic-hld, /tdk-task-breakdown, and a child /tdk-specify <child-id> "<seed>".
```

The replay path is the only case that may skip duplicate-spec STOP.

Check duplicate git branches as non-blocking warning:

```bash
git branch --list "$FOLDER/$TICKET_ID" 2>/dev/null
git ls-remote --heads origin "refs/heads/$FOLDER/$TICKET_ID" 2>/dev/null
```

Create feature directory when `SPEC_REPLAY_INTERVIEW` is not true:

```bash
mkdir -p "$FEATURE_DIR"
```

Note current branch for warning:

```bash
CURRENT_BRANCH=$(git rev-parse --abbrev-ref HEAD 2>/dev/null || echo "N/A")
EXPECTED_BRANCH="$FOLDER/$TICKET_ID"
```

If `CURRENT_BRANCH != EXPECTED_BRANCH`, print warning only.

Store: `FEATURE_DIR`, `SPEC_FILE`, `EXPECTED_BRANCH`, `CURRENT_BRANCH`.

## Step 0.2a: Reject Direct Discovery-To-Specify Routing

If `SPEC_REPLAY_INTERVIEW=true`, skip this step. Replay interviews the existing
`spec.md` only.

After `FEATURE_DIR` is resolved, check for parent discovery context:

```bash
DISCOVERY_MANIFEST="$FEATURE_DIR/discovery.md"
test -f "$DISCOVERY_MANIFEST" && echo "PARENT_DISCOVERY_CONTEXT=$DISCOVERY_MANIFEST" || echo "NO_PARENT_DISCOVERY_CONTEXT"
```

If `discovery.md` exists and `SPEC_REPLAY_INTERVIEW` is not true, STOP with the
same parent-epic routing message from Step 0.2. Do not read discovery as
optional spec context. Normal feature-sized work skips discovery and starts with
an explicit feature description. Child epic work starts from a
`tasks-breakdown` seed and a new child ID.

Only `tdk-specify` mints `UR-*`, `FR-*`, and `SC-*`, but it must mint them from
the feature description or child seed, not directly from parent discovery.

## Step 0.3: Mode Detection

If `SPEC_REPLAY_INTERVIEW=true`, read current `spec.md`, keep
`SPEC_INTERVIEW=true`, set `SPEC_MODE=existing-artifact`, and skip normal mode
detection. Replay must not generate or overwrite the spec before the interview.

Flag parsing:

- Scan `$ARGUMENTS` for standalone `--fast` and `--interview`.
- If `--fast` found: set `SPEC_MODE = fast`, `MODE_SOURCE = "user-specified"`, strip flag from description.
- If `--interview` found: set `SPEC_INTERVIEW=true`, strip flag from description.
- `--fast --interview` is valid; `--interview` does not force full mode or change `SPEC_MODE`.
- Unknown flags STOP before specs are written. Report:
  `Unknown flag: <flag>. Usage: /tdk-specify {task-id} [description] [--fast] [--interview]`.
- If `--fast` is not found, proceed to auto-detect. Default is full mode.

Auto-detect from cleaned description when no flag:

- Count words excluding task ID.
- Count distinct actors (roles/users mentioned).
- Count distinct actions (verbs/operations).
- Word count <=15 AND single actor AND single action -> `PRELIMINARY_MODE = fast`.
- Otherwise -> `PRELIMINARY_MODE = full`.
- Set `MODE_SOURCE = "auto-detected"`.

Print mode and confirm:

- If `MODE_SOURCE = "user-specified"`, print `Mode: fast (user-specified via --fast)` and proceed.
- If `MODE_SOURCE = "auto-detected"`, use AskUserQuestion:
  - Question: "Detected mode: [fast|full] (reason: [N words, M actors, K actions]). Proceed with this mode?"
  - Options: "Yes, proceed" / "Switch to [other mode]"
  - If user switches, update `SPEC_MODE`.

Store: `SPEC_MODE`, `SPEC_INTERVIEW`, `MODE_SOURCE`, `PRELIMINARY_MODE`.

## Step 0.memory: Memory Validation

Only if `.specify/memory/memory-index.md` exists, check silently and non-blocking:

0. **Binding-coverage precondition.** Read the `Binding coverage:` line from
   `.specify/memory/memory-index.md` and keep the result as `BINDING_COVERAGE`
   for the rest of this skill:
   - line absent, or the index tables have no `Binding` column → `unknown`
   - `Binding coverage: 0 of N typed files` → `none`
   - otherwise → the reported count

   When `BINDING_COVERAGE` is `unknown` or `none`, skip this whole step and log
   one line. Do not ask the user — with no `binding: true` evidence the guardian
   cannot produce an admissible conflict, so the question has no meaningful
   answer:
   `Memory validation skipped — memory-index reports no binding: true coverage. Run /tdk-memory-update if memory was recently updated.`

   This step runs before Step 1.5, so it is gated on coverage only. The
   task-lifecycle `memory_validation` decision is made later, in
   Step 1.6, once `IMPACT_SURFACE` exists to supply its default.
1. Spawn `tdk-memory-agent` agent with `--mode validate` and the raw feature description.
   Ask it to detect only high-signal business contradictions; ambiguity and completion checks stay for `/tdk-clarify`.
2. Parse the Guardian Report and store it as `MEMORY_VALIDATE_REPORT`.
   - `Action required: BLOCK_IMPL` -> ask one `AskUserQuestion` round for business-conflict resolution. Include conflicts and any warnings as non-blocking review notes. Store accepted answers as `MEMORY_RESOLUTIONS`.
   - `Action required: REVIEW` -> record warnings as review notes for spec writing; do not block.
   - `Action required: CLEAR` -> continue normally.
   - `STATUS: MCP_UNAVAILABLE`, memory not initialized, no relevant memory, or agent failure -> skip validation without prompting or failing.
3. Frontmatter semantics:
   - In Step 2.4, set `memory_context_loaded: true` only when a usable Guardian Report was returned.
   - Otherwise set `memory_context_loaded: false`.
4. When writing `spec.md`, persist accepted `MEMORY_RESOLUTIONS` in `## Clarifications` or as explicit constraints in the relevant section.
   Do not ask later stages the same resolved business-conflict again.

This step MUST NOT block or error. If `tdk-memory-agent` fails for any reason, skip and continue.

## Step 1.5: Impact Surface Detection

1. Read `PROJECT_CONTEXT.subWorkspaces[]` from loaded project config.
2. Parse feature description -> extract actors, actions, data entities.
3. Match each entity against `subWorkspaces[].name` and `subWorkspaces[].modules[].name`:
   - API/endpoint/service keywords -> backend-type subworkspace.
   - UI/page/form/component keywords -> frontend-type subworkspace.
   - Database/model/schema keywords -> data-layer modules.
4. Build Impact Surface table:
   `| Subworkspace | Module | Impact Type | Description |`
5. Present table through AskUserQuestion:
   - Question: "Detected impact areas. Confirm or edit:"
   - Options: "Confirm as-is" / "I'll edit the table after spec is generated"
6. Store confirmed table as `IMPACT_SURFACE` for Steps 2-3.

Monolith fallback:

- If no subWorkspaces, show modules only when defined.
- If no modules either: `## 3. Impact Surface` shows "N/A — monolith project". Set `IMPACT_SURFACE = empty`.
- Skip `[sw/module]` tagging on UR/FR when `IMPACT_SURFACE` is empty.
- Checklist items for tags become conditional: only check when `IMPACT_SURFACE` is non-empty.

Edge case: Feature touches unknown area -> add row with Impact Type = "[TBD]".

Mode upgrade check:

- If `PRELIMINARY_MODE = fast` AND `MODE_SOURCE = "auto-detected"` AND Impact Surface has >=2 subworkspaces, upgrade `SPEC_MODE` to `full`.
- Print: "Mode upgraded: fast -> full (Impact Surface spans 2+ subworkspaces)".
- User flag override (`--fast`) is NOT upgraded.

## Step 1.6: Memory Validation Scope Gate

Decides memory validation **once for the whole task lifecycle**. `/tdk-clarify`,
`/tdk-plan`, and `/tdk-consistency-check` read the result and must not ask again.
Runs here because it needs `IMPACT_SURFACE` from Step 1.5 to compute its default.

1. When `BINDING_COVERAGE` from Step 0.memory is `unknown` or `none`: skip this
   gate, do not ask, and do not emit `memory_validation` at all. An absent key
   means "never decided", which downstream skills treat differently from
   `disabled`. Log:
   `Memory validation skipped — memory-index reports no binding: true coverage. Run /tdk-memory-update if memory was recently updated.`
2. Otherwise ask exactly once with `AskUserQuestion`, header `"Memory Validation"`,
   question `"Validate this task against project memory?"`. Preselect the default
   from `IMPACT_SURFACE`: one distinct subworkspace, or empty (`N/A — monolith`),
   defaults to the skip option; two or more distinct subworkspaces defaults to the
   validate option. This reuses the existing `>=2 subworkspaces` threshold from the
   Step 1.5 mode-upgrade check rather than inventing a second rule.
3. Store the answer as `MEMORY_VALIDATION` (`enabled` or `disabled`) and emit it to
   `spec.md` frontmatter in Step 2.
4. Non-interactive context, or `--fast`: use the computed default without
   prompting. Never block on this gate.
