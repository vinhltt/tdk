---
name: tdk-ut-backfill-auto
description: "Automated Unit Test Full Workflow. This skill should be used when the user asks to 'run unit tests', 'generate tests', 'create UT', 'tdk-ut-backfill-auto', or when /tdk-implement-from-plan or /tdk-implement-task detects a UT phase WITHOUT existing ut/plan.md. Orchestrates: check rules → plan → generate → run → report."
metadata:
  version: "1.10.2"
---

# /tdk-ut-backfill-auto - Automated Unit Test Workflow

## Purpose

Orchestrate the complete UT workflow by sequentially activating individual `/tdk-ut-*` skills. Single command for end-to-end test creation: check rules → create rules → plan → generate → run → update plan.

---

## Critical Rules

**ORCHESTRATOR PATTERN** — This skill delegates to child skills. DO NOT inline child skill logic. Activate each skill via the `Skill` tool and evaluate its output before proceeding.

**AUTO-CREATE BEHAVIOR** (for UT-only tasks):
- Feature directory not found → **Auto-created** by script
- spec.md not found → **Optional** - continue without it

**MANDATORY STOP CONDITIONS** — When any child skill fails:
1. **STOP immediately** - Do NOT proceed to next step
2. **Report the error** to user with the suggested fix

---

## Usage

```bash
/tdk-ut-backfill-auto {feature-id}                                       # Full workflow
/tdk-ut-backfill-auto {feature-id} --sub-workspace {name}                # Target specific sub-workspace
/tdk-ut-backfill-auto {feature-id} --sub-workspace {sw} --module {name}  # Target module in specific sub-workspace
/tdk-ut-backfill-auto {feature-id} --skip-run                            # Skip running tests
/tdk-ut-backfill-auto {feature-id} --plan-only                           # Only run plan phase
/tdk-ut-backfill-auto {feature-id} --force                               # Overwrite existing
```

---

## Workflow Overview

```
[Step 0] Parse Args & Run tdk ut backfill auto
   ↓
[Step 1] Skill: /tdk-ut-backfill-check-rules  →  rules missing? → Skill: /tdk-ut-backfill-create-rules
   ↓
[Step 2] Skill: /tdk-ut-backfill-plan  (create or update)  ── if --plan-only → DONE
   ↓
[Step 3] Skill: /tdk-ut-backfill-impl
   ↓
[Step 4] Run Tests  ── if --skip-run → skip to Step 5
   ↓
[Step 5] Update ut/plan.md with results
   ↓
[Step 6] Output Summary
```

---

## Execution

### Step 0: Parse Arguments & Initialize

Parse user input for sub-workspace and module targeting:
1. Check if `--sub-workspace NAME` and/or `--module NAME` in command args
2. If not found in flags, check if user mentions sub-workspace or module name in natural language prompt
3. If still not resolved, auto-detect from CWD (if user is inside a sub-workspace/module directory)
4. If multi-sub-workspace and no sub-workspace resolved → Ask user which sub-workspace
5. **`--module` always requires `--sub-workspace`** — resolve SW first (via flags, NL, or CWD), then pass both to CLI
6. If CLI returns JSON error (has `error` field) → parse message and relay to user, then ask for correct flags

Run initialization script from workspace root:

```bash
# If sub-workspace specified:
cd $CLAUDE_PROJECT_DIR/.specify/scripts/ts && bun src/index.ts ut backfill auto <feature-id> --sub-workspace {SUB_WORKSPACE_NAME}

# If module specified (always include --sub-workspace):
cd $CLAUDE_PROJECT_DIR/.specify/scripts/ts && bun src/index.ts ut backfill auto <feature-id> --sub-workspace {SUB_WORKSPACE_NAME} --module {MODULE_NAME}

# Otherwise:
cd $CLAUDE_PROJECT_DIR/.specify/scripts/ts && bun src/index.ts ut backfill auto <feature-id>
```

Parse JSON output → Store paths and flags: `featureDir`, `hasPlan`, `hasUtRules`, `utPlanFile`, `utRulesFile`, `createdFeatureDir`

**VALIDATE OUTPUT:**
- Script exit code != 0 OR output contains "❌ Error" → **STOP**, report to user
- `createdFeatureDir == true` → Note: feature folder auto-created (UT-only task)

Store parsed `--sub-workspace`, `--module`, `--skip-run`, `--plan-only`, `--force` flags for forwarding to child skills.

**Step 0b: Module detection** (after CLI output parsed, only when sub-workspace resolved):
- In the CLI JSON output, find the entry in `subWorkspaces[]` matching `subWorkspaceName` → read its `hasModules` flag
- If `hasModules` is falsy (false/absent):
  → Ask user: "Sub-workspace {name} doesn't have modules configured. Would you like to:"
    1. **Create a module** — add a module entry to `.specify.json`
    2. **Proceed at SW-level** — continue without module targeting (L2 path)
  → If user picks "Proceed at SW-level" → continue without `--module`
  → If user picks "Create a module":
    a. Ask for module name — validate format: `/^[a-zA-Z0-9._-]+$/` (reject if invalid, ask again)
    b. **Directory picker**: List directories inside the SW root path + a "Create new directory" option. If user picks existing dir → use that path. If user picks "Create new" → ask for directory name (validate: `/^[a-zA-Z0-9._-]+$/`, reject if invalid).
    c. testPath (optional): if SW has `testMapping.strategy` = `separate-project` or `mirror`, ask user to pick test directory too
    d. Read `.specify.json` from workspace root (`$CLAUDE_PROJECT_DIR/.specify/.specify.json`)
    e. Find the sub-workspace entry matching resolved SW name
    f. **Idempotency check**: if `modules[]` already contains entry with same `name` → skip, inform user
    g. If `modules` key absent/null on SW entry → create empty array first
    h. Build new module object: `{ "name": "{name}", "path": "{selected-dir-relative-path}" }` (add `"testPath"` if provided)
    i. Append module to `modules[]` and set `"hasModules": true` on same SW entry
    j. **Validate BEFORE writing**: Parse the modified in-memory JSON object. If validation fails → report error and DO NOT write to disk.
    k. Only if validation passes → write `.specify.json` back (preserve formatting with 2-space indent)
    l. **Verify**: RE-RUN CLI with `--sub-workspace {SW} --module {MODULE}` — if CLI returns success JSON, the config is valid. If CLI errors, report the error to user.
- If `hasModules=true` AND the matched SW's `modules[]` is empty/absent:
  → Ask user: "Sub-workspace {name} is configured for modules but none defined yet. Proceed at sub-workspace level? [Yes / No — I'll add modules first]"
  → If user says No → **STOP** and instruct user to add modules to `.specify.json`
  → If user says Yes → proceed without `--module` flag (SW-level)
- If `hasModules=true` AND `modules[]` has entries AND module not yet resolved (flag/NL/CWD):
  → Ask user: present list of module names from the matched SW's `modules[]` + "Sub-workspace level (apply to all modules)" option
  → If user picks a module → **RE-RUN CLI** with `--sub-workspace {SW} --module {MODULE}` flags
  → If user picks SW-level → **RE-RUN CLI** with `--sub-workspace {SW}` only (no --module)
- **IMPORTANT**: After asking, always RE-RUN the CLI command with resolved flags. Do NOT pass values through conversation memory — re-invoke CLI to ensure consistent state.
- Use `subWorkspaceName` from CLI output (not SKILL's internal resolved name) as the authoritative key to match (RT#11).

---

### Step 1: Check & Create UT Rules

**Activate** `/tdk-ut-backfill-check-rules` with the same `--sub-workspace` and `--module` flags from Step 0.

Evaluate output:
- **Rules found** → Log "✓ UT rules OK" + emit cascade summary line (see "Rule Loading (Merge Cascade)" below). Continue to Step 2.
- **Rules NOT found** → **Activate** `/tdk-ut-backfill-create-rules` with same `--sub-workspace` and `--module` flags
  - On success → Continue to Step 2
  - On failure → **STOP**, report error to user

**Cascade forwarding**: auto forwards `utRulesFiles[]` to child skills (`tdk-ut-backfill-plan`, `tdk-ut-backfill-impl`). The cascade summary line appears **once** here at orchestration start; merge work happens in child skills per their own SKILL.md contract.

---

### Step 2: Plan Phase (Create or Update)

**⚠️ NON-NEGOTIABLE — DO NOT SKIP**

Check `HAS_PLAN` from Step 0:

#### If ut/plan.md EXISTS → Update existing plan

1. Read existing `{UT_PLAN_FILE}` to understand current state
2. Analyze user's new request (what additional tests needed?)
3. Append new section with timestamp:
   ```markdown
   ---
   ## New Tests Added ({YYYY-MM-DD})
   ### Overview
   {description}
   | Service File | Test File | Tests | Status |
   |---|---|---|---|
   | `{source}` | `{source}.test.ts` | {N} | PENDING |
   ```
4. Create/update phase files for new suites
5. Log: "✓ Updated existing ut/plan.md"

#### If ut/plan.md NOT EXISTS → Create new plan

**Activate** `/tdk-ut-backfill-plan` with the same `{feature-id}` and `--sub-workspace` or `--module` flag.

- On success → Continue
- On failure → **STOP**, report error

**GATE**: Verify `{FEATURE_DIR}/ut/plan.md` exists before proceeding. If missing → STOP.

**If `--plan-only`** → Skip to Step 6 (summary).

---

### Step 3: Generate Test Files

**Activate** `/tdk-ut-backfill-impl` with the same `{feature-id}` and `--sub-workspace` or `--module` flag.

- On success → Continue to Step 4
- On failure → **STOP**, report error (plan artifacts preserved)

---

### Step 4: Run Tests

**If `--skip-run`** → Skip to Step 5.

Detect test command from project context or convention:

| Framework | Command |
|-----------|---------|
| Vitest/Jest | `npm test` / `yarn test` |
| Pytest | `pytest` |
| xUnit | `dotnet test` |
| PHPUnit | `php artisan test` / `./vendor/bin/phpunit` |
| Go | `go test ./...` |

Run tests and capture: total count, pass/fail, coverage, failed test details.

---

### Step 5: Update Plan with Results ⚠️ MANDATORY

**DO NOT SKIP** — even if tests pass.

1. Read current `{UT_PLAN_FILE}`
2. Update status: `PENDING` → `PASS` or `FAIL`
3. Append completion section:
   ```markdown
   ---
   ## Completion Log
   ### {YYYY-MM-DD} Session
   **Files Generated:**
   - `{path}` (N tests)
   **Test Results:**
   | Suite | Tests | Passed | Failed | Coverage |
   |---|---|---|---|---|
   **Status:** ✅ Completed / ⚠️ Partial / ❌ Failed
   ```
4. Write updated file
5. Log: "✓ ut/plan.md updated with results"

---

### Step 6: Output Summary

```
UT Auto Complete
=================

Feature: {feature-id}
Framework: {name version}

Steps Completed:
  1. UT Rules: ✓ {found / created}
  2. Plan: ✓ {created / updated}
  3. Generate: ✓ {N} test files
  4. Run: ✓ {passed} / ✗ {failed} of {total}
  5. Plan Updated: ✓

Test Results:
  - Total: {N} tests
  - Passed: {P}
  - Failed: {F}
  - Coverage: {X}%

Failed Tests: (if any)
  - {file}:{line} "{test name}"

Next Steps:
  1. Fix failing tests (if any)
  2. Run tests manually to verify
```

---

## Options

| Flag | Effect |
|------|--------|
| `--skip-run` | Steps 0-3 + 5-6 only, skip test execution |
| `--plan-only` | Steps 0-2 + 6 only |
| `--force` | Forward to child skills — overwrite existing artifacts |

---

## Rule Loading (Merge Cascade)

**Full contract**: `.specify/docs/guides/rule-cascade-merge-contract.md` — read before merging.

**Rules (titles only, see contract for bodies)**:
1. Match headings (normalized via `github-slugger` v2.x).
1b. Duplicate heading within file → last wins + warning.
2. Most specific wins — WHOLESALE (sub-sections under replaced `##` are discarded).
3. Unique heading → inherit.
4. Sub-section merge only when parent `##` NOT overridden at more-specific level.
5. Preamble concat base-first, blank-line separator.
6. Empty file = no-op, still listed in summary.

**Version-skew fallback**: if CLI JSON lacks `utRulesFiles` or entry `level === 'unknown'` → synthesize single-file entry, skip Rules 1b/2/3/4/5, emit warning `Note: older CLI detected — upgrade for full cascade merge. Running in single-file mode.`

**Cascade summary** (1 line to user after merge):
`Loaded N rule file(s): global → sw-parent → sw-own → module` (list only levels actually present, in read order).

**Orchestrator note**: auto emits the cascade summary once at orchestration start (Step 1). Child skills (`tdk-ut-backfill-plan`, `tdk-ut-backfill-impl`) receive the same `utRulesFiles[]` and perform their own merge per this contract.

**Canonical headings**: see `.specify/docs/guides/ut-rule-canonical-headings.md`.

---

## Error Handling

| Step | Condition | Action |
|------|-----------|--------|
| **0** | Script non-zero exit | **STOP** — report error |
| **0** | Sub-workspace not found | **STOP** — show available |
| **1** | `/tdk-ut-backfill-check-rules` → not found | Auto-activate `/tdk-ut-backfill-create-rules` |
| **1** | `/tdk-ut-backfill-create-rules` fails | **STOP** — report error |
| **2** | `/tdk-ut-backfill-plan` fails | **STOP** — report error |
| **2** | ut/plan.md still missing after step | **STOP** — gate failed |
| **3** | `/tdk-ut-backfill-impl` fails | **STOP** — plan preserved |
| **4** | Tests fail | Continue to Step 5 (report failures) |
| **4** | Test command not found | Suggest installing framework |
| **5** | Update fails | Warning only, show results in console |

---

## Related Skills

| Skill | Role in workflow |
|-------|-----------------|
| `/tdk-ut-backfill-check-rules` | Step 1 — validate rules exist |
| `/tdk-ut-backfill-create-rules` | Step 1 — create rules if missing |
| `/tdk-ut-backfill-plan` | Step 2 — create test plan |
| `/tdk-ut-backfill-impl` | Step 3 — generate test code |

---

## UT Phase Discovery — Source Parsing

Callers (`/tdk-implement-from-plan`, `/tdk-implement-task`) discover which phases are UT phases via the `## Phases` table in `plan.md`. Use the CLI wrapper:

```bash
cd $CLAUDE_PROJECT_DIR/.specify/scripts/ts && bun src/commands/util/parse-phases-table.ts "{planPath}" --json
```

Parse JSON output → `result.phases` array. Each entry: `{ number, file, fileLabel, status, blocks, blockedBy, rowLineNumber }`.

For each phase returned:
1. Read the phase file at `phases[i].file` (relative to plan.md location)
2. Extract the first H1 heading (`# ...`) as the phase title
3. Apply heuristic hints below to decide: **delegate to `/tdk-ut-backfill-auto`** vs **inline implementation**

If `parse-phases-table.ts` exits with code 1 (errors in JSON output), emit a warning but continue with the phases that parsed successfully.

---

## UT Phase Heuristic Hints

**Non-binding** — agent makes final call. These hints inform the decision; edge cases may warrant override.

### Signal Sources (OR-combine)

A phase is considered a UT phase if **either** of the following signals hits:

| Signal | Source | Stability |
|--------|--------|-----------|
| Keywords in phase file **H1 title** | User-edited content | Volatile (user may rename) |
| Keywords in phase **filename stem** | Plan file author | Stable (writer-controlled) |

OR-combine means: delegate if EITHER signal matches. This multi-signal approach is resilient to users editing H1 titles after plan creation.

### Keywords (case-insensitive)

Match any of these in the H1 title **or** filename stem:
- `unit test` (phrase)
- `ut` (word boundary — `ut-`, `-ut-`, `-ut`, or standalone `ut`)
- `test rules`
- `test plan`

### False-Positive Guard

**Integration Test phases → inline** (keyword `integration` in H1 or filename trumps `test`):
- Rationale: "Integration Test Plan" describes a different workflow — do not delegate to `/tdk-ut-backfill-auto`
- Exception: `phase-04-unit-test-integration-helpers.md` → **delegate** because `unit test` keyword is present before `integration` — UT keyword takes priority

### Examples

| Fixture | H1 Title | Expected | Rationale |
|---------|----------|----------|-----------|
| `phase-03-unit-test-rules-auth.md` | "Unit Test Rules: Auth" | **delegate** | UT keyword in both H1 and filename |
| `phase-02-database-migration.md` | "Database Migration" | **inline** | No UT keyword in either signal |
| `phase-04-unit-test-integration-helpers.md` | "Unit Test Integration Helpers" | **delegate** | `unit test` keyword present — UT trumps "integration" |
| `phase-05-test-coverage.md` | "Test Coverage Analysis" | **inline** | "test" alone insufficient; no `unit test` / `ut` keyword |
| `phase-06-ut-validation.md` | "Random Feature" | **delegate** | Filename has `ut-` prefix → matches despite bland H1 |

> Fixture baselines documented in `fixtures/expected-decisions.md` for regression reference.

---

## Called By

| Caller | When | Delegates to |
|--------|------|-------------|
| `/tdk-plan` | UT phase in plan output | Mentions `/tdk-ut-backfill-plan` (plan only, no code) |
| `/tdk-implement-from-plan` (primary) | UT phase detected + NO ut/plan.md | `/tdk-ut-backfill-auto` (this skill — full workflow) |
| `/tdk-implement-from-plan` (primary) | UT phase detected + ut/plan.md EXISTS | `/tdk-ut-backfill-impl` (generate only, skips this skill) |
| `/tdk-implement-task` (legacy fallback) | Same logic as `/tdk-implement-from-plan` | Same delegation |
| User | Direct invocation | `/tdk-ut-backfill-auto {feature-id}` |
