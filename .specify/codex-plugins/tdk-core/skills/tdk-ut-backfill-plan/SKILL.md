---
name: tdk-ut-backfill-plan
description: "Generate unit test plan using templates. Creates `ut/plan.md` + phase files at `ut/phases/{module}.md` and injects the routed consumer test skill from `plan-skill-routing.md`."
metadata:
  version: "3.4.11"
---

# /tdk-ut-backfill-plan - Create Unit Test Plan

## Purpose

Generate unit test plan using templates. Creates `ut/plan.md` + phase files at `ut/phases/{module}.md`. Implementation is handled later by the consumer test skill selected from `{docs.path}/custom-workflow/plan-skill-routing.md`.

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

---

## Templates

| Template | Location |
|----------|----------|
| Plan | `.specify/templates/ut/ut-plan-template.md.tpl` |
| Phase | `.specify/templates/ut/ut-phase-template.md.tpl` |

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
bash -lc '
PROJECT_DIR="$1"
if [ -z "$PROJECT_DIR" ] || [ ! -d "$PROJECT_DIR/.specify/scripts/ts" ]; then
  echo "Invalid project root: $PROJECT_DIR" >&2
  exit 1
fi
(cd "$PROJECT_DIR/.specify/scripts/ts" && bun src/index.ts ut backfill plan <feature-id>)
' -- "<agent-resolved-project-root>"

# With sub-workspace:
bash -lc '
PROJECT_DIR="$1"
if [ -z "$PROJECT_DIR" ] || [ ! -d "$PROJECT_DIR/.specify/scripts/ts" ]; then
  echo "Invalid project root: $PROJECT_DIR" >&2
  exit 1
fi
(cd "$PROJECT_DIR/.specify/scripts/ts" && bun src/index.ts ut backfill plan <feature-id> --sub-workspace {SUB_WORKSPACE_NAME})
' -- "<agent-resolved-project-root>"

# With module (always include --sub-workspace):
bash -lc '
PROJECT_DIR="$1"
if [ -z "$PROJECT_DIR" ] || [ ! -d "$PROJECT_DIR/.specify/scripts/ts" ]; then
  echo "Invalid project root: $PROJECT_DIR" >&2
  exit 1
fi
(cd "$PROJECT_DIR/.specify/scripts/ts" && bun src/index.ts ut backfill plan <feature-id> --sub-workspace {SUB_WORKSPACE_NAME} --module {MODULE_NAME})
' -- "<agent-resolved-project-root>"

# Combined module + standalone:
bash -lc '
PROJECT_DIR="$1"
if [ -z "$PROJECT_DIR" ] || [ ! -d "$PROJECT_DIR/.specify/scripts/ts" ]; then
  echo "Invalid project root: $PROJECT_DIR" >&2
  exit 1
fi
(cd "$PROJECT_DIR/.specify/scripts/ts" && bun src/index.ts ut backfill plan <feature-id> --sub-workspace {SUB_WORKSPACE_NAME} --module {MODULE_NAME} --standalone)
' -- "<agent-resolved-project-root>"

# Standalone mode (no spec required):
bash -lc '
PROJECT_DIR="$1"
if [ -z "$PROJECT_DIR" ] || [ ! -d "$PROJECT_DIR/.specify/scripts/ts" ]; then
  echo "Invalid project root: $PROJECT_DIR" >&2
  exit 1
fi
(cd "$PROJECT_DIR/.specify/scripts/ts" && bun src/index.ts ut backfill plan <feature-id> --standalone)
' -- "<agent-resolved-project-root>"

# Combined:
bash -lc '
PROJECT_DIR="$1"
if [ -z "$PROJECT_DIR" ] || [ ! -d "$PROJECT_DIR/.specify/scripts/ts" ]; then
  echo "Invalid project root: $PROJECT_DIR" >&2
  exit 1
fi
(cd "$PROJECT_DIR/.specify/scripts/ts" && bun src/index.ts ut backfill plan <feature-id> --sub-workspace {NAME} --standalone)
' -- "<agent-resolved-project-root>"
```

Ask the user for the project root if `<agent-resolved-project-root>` cannot be identified confidently; do not pass the placeholder literally.

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
    d. Read `.specify.json` from workspace root (`$PROJECT_DIR/.specify/.specify.json` after resolving the project root)
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

### Step 0.1 — Load Sub-Workspace Context (Optional)

Invoke `tdk-load-project-context` with `require_feature_dir: false` and `require_prefix_validation: false`.
Store: `PROJECT_CONTEXT`.

If `PROJECT_CONTEXT.configFound` is true, extract for later steps:
- **Test Framework**: `METADATA.testFramework` (vitest, jest, pytest, etc.)
- **Test Command**: `COMMANDS.test` for execution
- **Rules**: Load testing conventions from `RULES_FILES`
- **Language**: `METADATA.language` for syntax patterns

If `PROJECT_CONTEXT.configFound` is false: Auto-detect from sub-workspace files (existing behavior).

---

### Step 0.2: Load Skill Routing for Implementation Delegate

Read the same routing file used by `/tdk-plan`:

1. Resolve `{docs.path}/custom-workflow/plan-skill-routing.md` from `PROJECT_CONTEXT.docs.path` (default `.specify/configurations`).
2. If the file exists, parse markdown sections:
   - `## {sub-workspace-name}` = sub-workspace-specific routing
   - `## global` = fallback routing
   - bullet format: `- {domain}: {skill-name} [, {skill-name}]`
3. Resolve `UT_IMPLEMENT_SKILLS` using this lookup order:
   - matched sub-workspace section's `test` entry
   - `global.test`
4. If no routing file or no `test` entry exists, emit a warning and continue:
   ```
   Warning: no consumer test skill found in plan-skill-routing.md. UT phase files will be generated without implementation delegates.
   ```

Do not ask the user and do not invent a skill. Missing routing is non-blocking for planning.

### Step 0.3: Resolve UT Skill (Consumer Conventions)

Read UT conventions from the routed consumer skill when available:

1. If `UT_IMPLEMENT_SKILLS` contains one or more consumer skills, strip the leading slash and resolve each `/skill-name` to `.claude/skills/{skill-name}/SKILL.md` when present and read it.
2. Otherwise, glob `.claude/skills/*/SKILL.md`, match by: skill name contains `-ut` or `-test`, OR frontmatter contains `domain: unit-test`.
3. If found, extract `## Framework`, `## Coverage Target`, `## Naming Conventions`, `## Test Structure` sections.
4. If not found, continue with framework auto-detection in Step 2.

Store extracted conventions for plan generation (Step 5).
Store `UT_IMPLEMENT_SKILLS` for phase generation (Step 6).

---

### Step 1: Load Templates

**Read**:
- `.specify/templates/ut/ut-plan-template.md.tpl` -> PLAN_TEMPLATE
- `.specify/templates/ut/ut-phase-template.md.tpl` -> PHASE_TEMPLATE

If missing -> STOP: "Templates not found. Check `.specify/templates/ut/`"

---

### Step 2: Detect Framework (AI)

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

### Step 3: Analyze Feature Spec (or User Input in Standalone Mode)

**If standaloneMode = false** (standard mode):
- **Read**: `.specify/specs/{feature-id}/spec.md`
- **Legacy format detection**: Check for ALL THREE headings: `## 1. Problem Statement`, `## 2. Scope Boundary`, `## 3. Impact Surface`. If ANY missing: emit advisory "Legacy spec format detected. Re-run /tdk-specify to upgrade." Continue with best-effort semantic reading.
- **Extract**:
  - Feature name and summary
  - ## 6. Functional Requirements (FR-*) with `[sw/module]` tags -> Test scenarios
  - ## 5. User Requirements & Testing -> Critical paths
  - ## 5. User Requirements & Testing > Edge Cases subsection -> Boundary tests
  - ## 7. Success Criteria -> Coverage goals

**If standaloneMode = true** (standalone mode):
- **Ask user** via AskUserQuestion:
  - What modules/files should be tested? (e.g., "org api, org service, org repository")
  - What are the main test scenarios? (optional - can derive from code)
  - Any specific edge cases to consider? (optional)
- **Derive requirements** from Step 4 (codebase scan):
  - Public APIs -> Test scenarios
  - Method signatures -> Input/output tests
  - Error handling patterns -> Edge cases
  - Dependencies -> Mock requirements

---

### Step 4: Scan Codebase for Testable Units (AI)

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

### Step 5: Generate UT Plan

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
| Coverage Goals | From UT skill or defaults |
| Critical Paths | From spec.md ## 5. User Requirements & Testing |
| Edge Cases | From spec.md ## 5. User Requirements & Testing > Edge Cases subsection |
| Mocking Strategy | AI analysis of dependencies |
| Implementation Phases | Generated phase list |

**Write**: `.specify/specs/{feature-id}/ut/plan.md`

---

### Step 5.5: Assign Test Case IDs (Semantic ID Format)

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

### Step 6: Generate Phase Files

One phase file per module. NO setup phase (cross-module shared fixtures → flag in `ut/plan.md` Open Questions).

For each module identified in Step 4:

1. **Read**: PHASE_TEMPLATE
2. **Fill placeholders**:

| Placeholder | Source |
|-------------|--------|
| `{MODULE NAME}` | Module/component name |
| `{module-name}` | Kebab-case module identifier |
| `{path/to/module/}` | Source directory |
| Test Matrix rows | From spec.md requirements + codebase scan |
| Mocks & Fixtures | From dependency analysis |
| Delegate Skills | From `UT_IMPLEMENT_SKILLS` |

3. **Inject `## Delegate Skills`** when `UT_IMPLEMENT_SKILLS` is non-empty:

```markdown
## Delegate Skills
- `/your-consumer-unit-test-skill` - implement and run the test cases in this UT phase
```

One bullet per skill, ordered as listed in routing. If no routed test skill was found, omit the section and keep the warning from Step 0.2 visible in the output summary.

4. **Write**: `.specify/specs/{feature-id}/ut/phases/{module-name}.md`

**Naming convention**:
- `ut/phases/{module-name}.md` — one file per module (e.g. `auth.md`, `org-service.md`)

---

### Step 7: Output Summary

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

Next: /tdk-implement {feature-id}
Implementation: routed consumer test skill from `## Delegate Skills` in each UT phase file
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

- `/tdk-plan` — creates the feature implementation plan and triggers UT planning when needed
- `/tdk-implement` — executes generated phases and delegates consumer test skills
