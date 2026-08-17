---
name: tdk-specify
description: "Create spec.md from a feature or child-slice description, or replay --interview against existing spec.md. Supports --fast, memory, and an embedded quality gate."
argument-hint: "<id> [<desc>] [--fast] [--interview]"
metadata:
  version: "13.0.1"
---

# tdk-specify

## ⛔ CRITICAL: Error Handling

**If ANY script returns an error, you MUST:**
1. **STOP immediately** - Do NOT attempt workarounds or auto-fixes
2. **Report the error** - Show the exact error message to the user
3. **Wait for user** - Ask user how to proceed before taking any action

**DO NOT:**
- Try alternative approaches when scripts fail
- Create branches manually when script validation fails
- Guess or assume what the user wants after an error
- Continue with partial results

---

## User Input

```text
$ARGUMENTS
```

You **MUST** consider the user input before proceeding (if not empty).

Supported forms:

```text
/tdk-specify <id> <description> [--fast] [--interview]
/tdk-specify <id> --interview
```

## Skill References

Load references only when their step is reached:

- `references/input-routing-and-mode-workflow.md` for Steps 0.2, 0.2a, 0.3, 0.memory, and 1.5.
- `references/spec-generation-and-validation-workflow.md` for Steps 2, 2.5, 3, 5, and 6.
- `references/spec-writing-principles.md` before Step 2 for YAGNI/KISS/DRY and embedded brainstorming.
- `references/spec-quality-guidelines.md` before Step 2 and Step 5 for section/checklist requirements.
- `.specify/_shared/skills/interview-alignment-protocol.md` when `--interview` is set.

## Boundary Declaration

**This command produces:**
- Feature specification (spec.md) with 9 numbered sections + Clarifications
- Embedded `## Specification Quality Gate`
- Unresolved questions (## 9. Unresolved Questions) presented to user for resolution

**This command does NOT:**
- Create implementation plans (use /tdk-plan)
- Generate tasks
- Write code

## Quality Gates

### Before Writing Spec
- [ ] Feature description provided
- [ ] Task_id validated
- [ ] Project context loaded (if available)

### Before Completion
- [ ] All 9 sections filled (## 4. Evaluated Approaches and ## 8. Risks & Mitigations may be marked N/A if genuinely not applicable)
- [ ] No inline [NEEDS CLARIFICATION] markers (all migrated to ## 9. Unresolved Questions)
- [ ] Success criteria are measurable and tech-agnostic
- [ ] No implementation details in spec
- [ ] `[sw/module]` tags on all UR/FR (unless monolith with no modules)

## Execution Steps

### Step 0 — Validate Task ID
Invoke `tdk-validate-task-id` with `$ARGUMENTS` and host skill name `/tdk-specify`.
If STOP → halt execution.
Store: `TASK_ID`, `TASK_ID_SOURCE`.

### Step 0.1 — Load Project Context
Invoke `tdk-load-project-context` with validated `TASK_ID`.
Store: `PROJECT_CONTEXT`, `FEATURE_DIR`.

### Step 0.2: Check Feature Description & Create Feature Directory

Load `references/input-routing-and-mode-workflow.md` and execute Step 0.2.

Must preserve these routing invariants:

- Unknown flags STOP before reads/writes.
- Positional `interview` is not a mode; hint `--interview`.
- `--fast --interview` requires a feature description.
- ID-only `--interview` requires existing `spec.md`, then sets `SPEC_INTERVIEW=true` and `SPEC_REPLAY_INTERVIEW=true`.
- Duplicate `spec.md` STOP applies only when `SPEC_REPLAY_INTERVIEW` is not true.
- A directory containing `discovery.md` but no `spec.md` is a parent epic
  discovery directory. STOP and route to `/tdk-epic-prd <id>` instead of
  creating a spec from discovery.

Store: `FEATURE_DIR`, `SPEC_FILE`, `EXPECTED_BRANCH`, `CURRENT_BRANCH`.

### Step 0.2a - Reject Direct Discovery-To-Specify Routing

Follow `references/input-routing-and-mode-workflow.md` Step 0.2a.

Replay skips this check because it reads an existing `spec.md`. Normal specify
must not read `discovery.md` as direct context. Discovery is parent epic context
for `/tdk-epic-prd`; child specs start from explicit descriptions or
`tasks-breakdown` seed text.

### Step 0.3 — Mode Detection

**This step owns ALL flag parsing and mode decision logic.**

Follow `references/input-routing-and-mode-workflow.md` Step 0.3.

Key invariants: `--fast --interview` is valid, `--interview` does not force full
mode, replay uses `SPEC_MODE=existing-artifact`, and unknown flags STOP before
specs are written.

Store: `SPEC_MODE`, `SPEC_INTERVIEW`, `MODE_SOURCE`, `PRELIMINARY_MODE` (only set during auto-detect).

### Step 0.memory: Memory Validation

Follow `references/input-routing-and-mode-workflow.md` Step 0.memory.

Only validate when `.specify/memory/memory-index.md` exists **and** its
`Binding coverage:` line reports a non-zero count; resolve that line into
`BINDING_COVERAGE` here and skip the step when it is `none` or `unknown`. Use
`tdk-memory-agent --mode validate`, store `MEMORY_VALIDATE_REPORT`, persist
accepted `MEMORY_RESOLUTIONS`, and set `memory_context_loaded` in Step 2. This
step MUST NOT block or error.

### Step 1: Load `.specify/templates/spec-template.md.tpl` to understand required sections.

If `SPEC_REPLAY_INTERVIEW=true`, skip this step.

### Step 1.5 — Impact Surface Detection

Follow `references/input-routing-and-mode-workflow.md` Step 1.5.

Store confirmed `IMPACT_SURFACE` for spec generation. If monolith has no
modules, `## 3. Impact Surface` is "N/A — monolith project" and UR/FR
`[sw/module]` tags are skipped. Auto-detected fast mode upgrades to full only
when impact spans >=2 subworkspaces; explicit `--fast` is not upgraded.

### Step 1.6 — Memory Validation Scope Gate

Follow `references/input-routing-and-mode-workflow.md` Step 1.6.

Asks once whether this task is validated against project memory — only when
`BINDING_COVERAGE` is non-zero. Default comes from `IMPACT_SURFACE`
(1 subworkspace or monolith → skip; >=2 → validate). Store `MEMORY_VALIDATION`.

Scope: this gate governs `/tdk-clarify`, `/tdk-plan`, and
`/tdk-consistency-check`, which honor it and must not ask again. It does **not**
govern this skill's own Step 0.memory validation — that runs earlier, gated on
`BINDING_COVERAGE` alone, because Step 1.6 needs `IMPACT_SURFACE` from Step 1.5
to compute its default and Step 0.memory must finish before spec generation.

Non-interactive uses the default; never blocks.

### Step 2: Specification Generation (9-Section Format)

Follow `references/spec-generation-and-validation-workflow.md` Step 2.

Normal creation writes the 9-section spec plus `## Clarifications` using
`.specify/templates/spec-template.md.tpl`. Replay skips spec generation, reads
current `spec.md`, then continues to Step 2.5. Emit frontmatter with `title`,
`status`, `feature_branch`, `milestone_branch`, `created`, `input`, `memory_context_loaded`,
`memory_validation` (emit only when Step 1.6 produced a decision; omit the key otherwise), and
`schema_version: 1`; keep the H1 directly below closing `---`.

Set `feature_branch` to the starting value `<defaultFolder>/<TICKET_ID>`, and seed `milestone_branch` from
`git -C "$PROJECT_DIR" branch --show-current`. Both are recorded only — this skill creates no branch and
switches to none.

`feature_branch` is the branch created FOR this task; the base ref it is created FROM is settled per
repository at `/tdk-implement`. `milestone_branch` is the milestone/epic the task belongs to, used at
implement time to catch work landing under the wrong milestone. Confirm `milestone_branch` with one
`AskUserQuestion` when `PROJECT_CONTEXT.subWorkspaces` is non-empty; skip it when empty or absent.

### Step 2.5: Optional Interview Alignment Gate

Follow `references/spec-generation-and-validation-workflow.md` Step 2.5 and
load `.specify/_shared/skills/interview-alignment-protocol.md`.

Run after draft `spec.md` is written for creation, or after current `spec.md` is
read for `SPEC_REPLAY_INTERVIEW=true`. Ask 4-6 artifact-grounded questions;
record classification: `aligned`, `mismatch`, or `unclear`. Do not persist a
raw transcript. Continue to Step 3 after interview integration.

### Step 3: Handle Unresolved Questions

Follow `references/spec-generation-and-validation-workflow.md` Step 3.

Resolve `## 9. Unresolved Questions` through AskUserQuestion rounds, integrate
answers into relevant sections, and repeat until questions read "None" or the
user explicitly accepts remaining questions.

### Step 5: Specification Quality Validation

Follow `references/spec-generation-and-validation-workflow.md` Step 5.

Validate against `references/spec-quality-guidelines.md`, write or replace only
the heading-bounded `## Specification Quality Gate` block in `spec.md`, fix and
re-run up to 3 iterations, then list any remaining blockers in that block.

### Step 6: Report Completion

Follow `references/spec-generation-and-validation-workflow.md` Step 6.

Report branch, spec path, quality-gate summary, Impact Surface summary, unresolved
question count, mode, interview alignment (`creation`, `existing artifact`, or
`disabled`), and readiness for `/tdk-clarify` or `/tdk-plan`.
