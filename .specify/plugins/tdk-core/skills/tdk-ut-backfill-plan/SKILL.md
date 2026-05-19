---
name: tdk-ut-backfill-plan
description: "Generate unit test plan using templates. Creates `ut/plan.md` + phase files at `ut/phases/{module}.md` for implementation by `/tdk-ut-backfill-impl`."
metadata:
  version: "1.2.2"
---

# /tdk-ut-backfill-plan - Create Unit Test Plan

## Purpose

Generate unit test plan using templates. Creates `ut/plan.md` + phase files at `ut/phases/{module}.md` for implementation by `/tdk-ut-backfill-impl`.

---

## Usage

```bash
/tdk-ut-backfill-plan {feature-id}                                                     # Create new plan
/tdk-ut-backfill-plan {feature-id} --sub-workspace {name}                              # Target specific sub-workspace
/tdk-ut-backfill-plan {feature-id} --sub-workspace {sw} --module {name}                # Target specific module
/tdk-ut-backfill-plan {feature-id} --sub-workspace {sw} --module {name} --standalone   # Module + standalone
/tdk-ut-backfill-plan {feature-id} --review                                            # Review and update existing plan
/tdk-ut-backfill-plan {feature-id} --force                                             # Overwrite without asking
/tdk-ut-backfill-plan {feature-id} --standalone                                        # Skip feature spec, analyze codebase directly
```

### Standalone Mode (Smart Auto-Detection)

**You don't need to remember `--standalone` flag!**

When spec.md is not found, the command will **automatically ask**:
```
⚠️ Feature spec not found: .specify/specs/al-223/spec.md

How would you like to proceed?
○ Create feature spec first (recommended)
○ Continue without spec (analyze codebase directly)
```

**Explicit flag still works** for automation/scripting:
```bash
/tdk-ut-backfill-plan AL-223 --standalone  # Skip prompt, go straight to standalone mode
```

In standalone mode:
- Feature directory auto-created if not exists
- spec.md NOT required
- Test requirements derived from user input + codebase analysis

---

## Output

Creates in `.specify/specs/{feature-id}/ut/`:

1. **plan.md** - Master test plan with tracking table (from template)
2. **phases/{module1}.md** - Per-module phase file (P1 modules)
3. **phases/{module2}.md** - Per-module phase file (P2-P3 modules, if needed)

UT rules file location depends on sub-workspace targeting:
- **With --sub-workspace**: `{sub-workspace-root}/{docs-path}/rules/test/ut-rule.md`
- **Without**: `{workspace-root}/{docs-path}/rules/test/ut-rule.md`

---

## Templates

| Template | Location |
|----------|----------|
| Plan | `.specify/templates/ut/ut-plan-template.md` |
| Phase | `.specify/templates/ut/ut-phase-template.md` |

---

## Execution

### Step 0: Parse Arguments & Sub-Workspace Selection

Parse user input for targeting:
1. Check if `--sub-workspace NAME` and/or `--module NAME` in command args
2. If not in flags, extract sub-workspace/module name from natural language prompt
3. If still not resolved, auto-detect from CWD
4. If multiple sub-workspaces and none resolved → Ask user which sub-workspace
5. `--module` requires `--sub-workspace` — resolve SW first, then pass both flags to CLI
6. If CLI returns JSON error → parse and relay message to user
Also extract `--standalone` flag if present. Store all flags for use in Steps 0.1+.

**Run bash script with appropriate flags**:

```bash
# Standard mode:
cd $CLAUDE_PROJECT_DIR/.specify/scripts/ts && bun src/index.ts ut backfill plan <feature-id>

# With sub-workspace:
cd $CLAUDE_PROJECT_DIR/.specify/scripts/ts && bun src/index.ts ut backfill plan <feature-id> --sub-workspace {SUB_WORKSPACE_NAME}

# With module (always include --sub-workspace):
cd $CLAUDE_PROJECT_DIR/.specify/scripts/ts && bun src/index.ts ut backfill plan <feature-id> --sub-workspace {SUB_WORKSPACE_NAME} --module {MODULE_NAME}

# Combined module + standalone:
cd $CLAUDE_PROJECT_DIR/.specify/scripts/ts && bun src/index.ts ut backfill plan <feature-id> --sub-workspace {SUB_WORKSPACE_NAME} --module {MODULE_NAME} --standalone

# Standalone mode (no spec required):
cd $CLAUDE_PROJECT_DIR/.specify/scripts/ts && bun src/index.ts ut backfill plan <feature-id> --standalone

# Combined:
cd $CLAUDE_PROJECT_DIR/.specify/scripts/ts && bun src/index.ts ut backfill plan <feature-id> --sub-workspace {NAME} --standalone
```

Parse JSON output -> Store all fields including `needsStandalonePrompt`, `hasSpecFile`, `standaloneMode`

**If needsStandalonePrompt = true** (spec.md not found, auto-detected):
- Use **AskUserQuestion** with options:
  - **Option 1**: "Create feature spec first" → STOP, instruct `/feature:specify {feature-id}`
  - **Option 2**: "Continue without spec (standalone)" → Set standaloneMode = true, continue
- This provides smart UX: user doesn't need to know `--standalone` flag exists

If error -> STOP and report to user

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

### Step 0.1: Check UT Rules

**Run check-rules script**:

```bash
# If sub-workspace specified:
cd $CLAUDE_PROJECT_DIR/.specify/scripts/ts && bun src/index.ts ut check-rules --sub-workspace {SUB_WORKSPACE_NAME}

# If module specified:
cd $CLAUDE_PROJECT_DIR/.specify/scripts/ts && bun src/index.ts ut check-rules --sub-workspace {SUB_WORKSPACE_NAME} --module {MODULE_NAME}

# Otherwise:
cd $CLAUDE_PROJECT_DIR/.specify/scripts/ts && bun src/index.ts ut check-rules
```

Parse JSON output → Store `exists`, `rulesFile`, `framework`

**If exists = false**:
- Show warning:
  ```
  ⚠️ UT Rules not found: {rulesFile}
  ```
- Ask via AskUserQuestion:
  - **Option 1**: "Run `/tdk-ut-backfill-create-rules` first" (recommended)
  - **Option 2**: "Continue with defaults"

- If Option 1 → STOP, instruct to run create-rules
- If Option 2 → Continue with framework auto-detection

**If exists = true**:
- Log: "✓ Using rules: {rulesFile}"
- Store framework for later steps

---

### Step 0.5 — Load Sub-Workspace Context (Optional)

Invoke `tdk-load-project-context` with `require_feature_dir: false` and `require_prefix_validation: false`.
Store: `PROJECT_CONTEXT`.

If `PROJECT_CONTEXT.configFound` is true, extract for later steps:
- **Test Framework**: `METADATA.testFramework` (vitest, jest, pytest, etc.)
- **Test Command**: `COMMANDS.test` for execution
- **Rules**: Load testing conventions from `RULES_FILES`
- **Language**: `METADATA.language` for syntax patterns

If `PROJECT_CONTEXT.configFound` is false: Auto-detect from sub-workspace files (existing behavior).

---

### Step 1: Load Templates

**Read**:
- `.specify/templates/ut/ut-plan-template.md` -> PLAN_TEMPLATE
- `.specify/templates/ut/ut-phase-template.md` -> PHASE_TEMPLATE

If missing -> STOP: "Templates not found. Check `.specify/templates/ut/`"

---

### Step 2: Load UT Rules (Cascade Merge)

**Check**: Rules already validated in Step 0.1

- **If `hasUtRules = true`** → iterate `utRulesFiles[]` from CLI JSON (base→specific) and apply the cascade merge contract (see "Rule Loading (Merge Cascade)" section below). Merged rules feed plan generation (naming, coverage, mocking).
- **If `hasUtRules = false`** → User chose to continue with defaults in Step 0.1.

---

### Step 3: Detect Framework (AI)

**Scan config files using Read tool**:

| File | Framework |
|------|-----------|
| `package.json` -> devDependencies | vitest, jest, mocha, jasmine |
| `pyproject.toml` / `requirements.txt` | pytest, unittest |
| `Gemfile` | rspec, minitest |
| `pom.xml` / `build.gradle` | junit, testng |
| `composer.json` | phpunit, pest |
| `*.csproj` | xunit, nunit, mstest |
| `go.mod` | go test, testify |

**Confirm with user** via AskUserQuestion if unsure.

---

### Step 4: Analyze Feature Spec (or User Input in Standalone Mode)

**If standaloneMode = false** (standard mode):
- **Read**: `.specify/specs/{feature-id}/spec.md`
- **Extract**:
  - Feature name and summary
  - Functional requirements (FR-*) -> Test scenarios
  - User stories -> Critical paths
  - Edge cases -> Boundary tests
  - Success criteria -> Coverage goals

**If standaloneMode = true** (standalone mode):
- **Ask user** via AskUserQuestion:
  - What modules/files should be tested? (e.g., "org api, org service, org repository")
  - What are the main test scenarios? (optional - can derive from code)
  - Any specific edge cases to consider? (optional)
- **Derive requirements** from Step 5 (codebase scan):
  - Public APIs -> Test scenarios
  - Method signatures -> Input/output tests
  - Error handling patterns -> Edge cases
  - Dependencies -> Mock requirements

---

### Step 5: Scan Codebase for Testable Units (AI)

**Use Glob tool to find source files**:
```
src/**/*.{ts,js,tsx,jsx}
lib/**/*.py
app/**/*.rb
**/*.go
```

**For each file, identify**:
- Functions (exported/public)
- Classes and methods
- Complexity level (simple/medium/complex)

**Use Grep to find existing tests**:
```
**/*.test.{ts,js}
**/*.spec.{ts,js}
**/test_*.py
**/*_test.go
```

**Determine test organization**:
- **>70% pattern found** -> Use automatically
- **Mixed patterns** -> Ask user preference
- **No tests found** -> Recommend framework convention

---

### Step 6: Generate UT Plan

**Read**: PLAN_TEMPLATE

**Fill placeholders**:

| Placeholder | Source |
|-------------|--------|
| `[FEATURE NAME]` | From spec.md title |
| `{feature-id}` | From bash script |
| `[DATE]` | Current date |
| `[FRAMEWORK]` | From Step 3 |
| `[VERSION]` | From config file |
| Summary | From spec.md |
| Test Organization | From Step 5 |
| Coverage Goals | From ut-rule.md or defaults |
| Critical Paths | From spec.md user stories |
| Edge Cases | From spec.md |
| Mocking Strategy | AI analysis of dependencies |
| Implementation Phases | Generated phase list |

**Write**: `.specify/specs/{feature-id}/ut/plan.md`

---

### Step 6.5: Assign Test Case IDs (Semantic ID Format)

Before generating phase files, determine the ID format for all test cases in this phase set.

#### ID Format

| Scope | Format | Example |
|---|---|---|
| Function (single-file phase) | `<func>__<slug>` | `parse_email__happy` |
| Class method (single-file phase) | `<Class>.<method>__<slug>` | `OrderService.charge__gateway_timeout` |
| Function (multi-file phase) | `<source_basename>_<func>__<slug>` | `routes_parse_email__happy` |
| Class method (multi-file phase) | `<source_basename>_<Class>.<method>__<slug>` | `services_OrderService.charge__timeout` |

**Slug rules:** snake_case, 1–3 words, no `test_` prefix.

**Validation regex** (anchored, applied per ID cell):
```
^[a-z][a-z0-9_]*(\.[A-Z][a-zA-Z0-9]*)?__[a-z0-9_]+$
```

#### Multi-file Invariant

> CRITICAL: If a phase covers ≥2 source files (i.e., the Test Matrix `Source` column has ≥2 distinct values), ALL IDs MUST use the multi-file form (`<source_basename>_<func>__<slug>`). NO mixing of single-file form and multi-file form within the same phase. Validator MUST fail loud on mixed format — surface the violation immediately, do not silently accept partial compliance.

Detection: count distinct values in the `Source` column of the Test Matrix. If ≥2 → enforce prefix on every row.

#### Uniqueness Check

After generating all IDs for a phase, assert no duplicates within that phase scope. If a collision is found, append a disambiguating suffix to the slug (e.g. `__empty_a`, `__empty_b`).

#### Grep Helper

IDs with dot-notation (Class.method form) require an extended pattern:
```
grep -oE '[a-zA-Z_][a-zA-Z0-9_.]*__[a-z0-9_]+'
```

---

### Step 7: Generate Phase Files

One phase file per module. NO setup phase (cross-module shared fixtures → flag in `ut/plan.md` Open Questions).

For each module identified in Step 5:

1. **Read**: PHASE_TEMPLATE
2. **Fill placeholders**:

| Placeholder | Source |
|-------------|--------|
| `{MODULE NAME}` | Module/component name |
| `{module-name}` | Kebab-case module identifier |
| `{path/to/module/}` | Source directory |
| Test Matrix rows | From spec.md requirements + codebase scan |
| Mocks & Fixtures | From dependency analysis |

3. **Write**: `.specify/specs/{feature-id}/ut/phases/{module-name}.md`

**Naming convention**:
- `ut/phases/{module-name}.md` — one file per module (e.g. `auth.md`, `org-service.md`)

---

### Step 8: Output Summary

```
UT Plan Created
===================

Framework: {name} {version}
Test Organization: {pattern}

Files created:
  - .specify/specs/{id}/ut/plan.md
  - .specify/specs/{id}/ut/phases/{module1}.md
  - .specify/specs/{id}/ut/phases/{module2}.md
  ...

Modules: {n} total
  - P1 Critical: {n}
  - P2-P3: {n}

Next: /tdk-ut-backfill-impl {feature-id}
```

---

## Review Mode (`--review`)

### Step R1: Load Existing Files

**Read** all existing files:
- `ut/plan.md`
- `ut/phases/*.md`

### Step R2: Ask What to Review

**Use AskUserQuestion**:
- Test organization wrong?
- Coverage goals incorrect?
- Mocking strategy needs change?
- Phase structure needs adjustment?

### Step R3: Targeted Updates

Based on user feedback:
1. **Re-analyze** only the problematic section
2. **Preserve** correct parts
3. **Update** only what's wrong

### Step R4: Diff Preview

Show changes before saving:
```diff
- Old: Test file in __tests__/
+ New: Test file co-located with source
```

Confirm -> Update files

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

**Canonical headings**: see `.specify/docs/guides/ut-rule-canonical-headings.md`.

---

## Error Handling

| Error | Solution |
|-------|----------|
| Templates missing | Check `.specify/templates/ut/` exists |
| spec.md not found | Run `/feature:specify {feature-id}` first OR use `--standalone` flag |
| No source files | Ask user for source directory |
| No framework detected | Ask user to select framework |

---

## Supported Frameworks

| Language | Frameworks |
|----------|------------|
| JavaScript/TypeScript | Vitest, Jest, Mocha, Jasmine |
| Python | Pytest, unittest |
| Ruby | RSpec, Minitest |
| Java | JUnit, TestNG |
| PHP | PHPUnit, Pest |
| .NET | xUnit, NUnit, MSTest |
| Go | testing, testify |

---

## Related

- `ut:create-rules` - One-time sub-workspace setup
- `ut:generate` - Generate test files from plan
- `ut:auto` - Automated test workflow
