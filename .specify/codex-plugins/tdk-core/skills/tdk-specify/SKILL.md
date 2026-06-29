---
name: tdk-specify
description: "Create spec.md from a feature description, or replay --interview against existing spec.md. Supports --fast, discovery, memory, checklist."
argument-hint: "<id> [<desc>] [--fast] [--interview]"
metadata: 
  version: "5.10.0"
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
- `../_shared/interview-alignment-protocol.md` when `--interview` is set.

## Boundary Declaration

**This command produces:**
- Feature specification (spec.md) with 9 numbered sections + Clarifications
- Quality validation checklist
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
- A directory containing only `discovery/` is allowed for discovery-first specify.

Store: `FEATURE_DIR`, `SPEC_FILE`, `EXPECTED_BRANCH`, `CURRENT_BRANCH`.

### Step 0.2a - Optional Discovery Context

Follow `references/input-routing-and-mode-workflow.md` Step 0.2a.

Replay skips discovery context loading. Normal specify may read
`DISCOVERY_INDEX="$FEATURE_DIR/discovery/index.md"` as optional context only.
Discovery is not required and never mints `UR-*`, `FR-*`, or `SC-*`.

### Step 0.3 — Mode Detection

**This step owns ALL flag parsing and mode decision logic.**

Follow `references/input-routing-and-mode-workflow.md` Step 0.3.

Key invariants: `--fast --interview` is valid, `--interview` does not force full
mode, replay uses `SPEC_MODE=existing-artifact`, and unknown flags STOP before
specs are written.

Store: `SPEC_MODE`, `SPEC_INTERVIEW`, `MODE_SOURCE`, `PRELIMINARY_MODE` (only set during auto-detect).

### Step 0.memory: Memory Validation

Follow `references/input-routing-and-mode-workflow.md` Step 0.memory.

Only validate when `.specify/memory/memory-index.md` exists. Use
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

### Step 2: Specification Generation (9-Section Format)

Follow `references/spec-generation-and-validation-workflow.md` Step 2.

Normal creation writes the 9-section spec plus `## Clarifications` using
`.specify/templates/spec-template.md.tpl`. Replay skips spec generation, reads
current `spec.md`, then continues to Step 2.5. Emit frontmatter with `title`,
`status`, `branch`, `created`, `input`, `memory_context_loaded`, and
`schema_version: 1`; keep the H1 directly below closing `---`.

### Step 2.5: Optional Interview Alignment Gate

Follow `references/spec-generation-and-validation-workflow.md` Step 2.5 and
load `../_shared/interview-alignment-protocol.md`.

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

Create `FEATURE_DIR/checklists/requirements.md` from
`references/spec-quality-guidelines.md`, validate all checklist items, fix and
re-run up to 3 iterations, then document any remaining issues in checklist notes.

### Step 6: Report Completion

Follow `references/spec-generation-and-validation-workflow.md` Step 6.

Report branch, spec path, checklist summary, Impact Surface summary, unresolved
question count, mode, interview alignment (`creation`, `existing artifact`, or
`disabled`), and readiness for `/tdk-clarify` or `/tdk-plan`.
