---
name: tdk-ut-backfill-create-rules
description: "Generate sub-workspace-wide unit testing standards (`ut-rule.md`). One-time setup defining conventions, coverage, mocking."
metadata:
  version: "1.1.1"
---

# /tdk-ut-backfill-create-rules - Create Sub-Workspace UT Standards

## Purpose

Generate sub-workspace-wide unit testing standards (`ut-rule.md`). One-time setup defining conventions, coverage, mocking.

---

## Output

Creates `{outputRoot}/{outputDocsPath}/rules/test/ut-rule.md`
- **With --sub-workspace**: Sub-workspace-specific path (e.g., `apps/frontend/{docs.path}/rules/test/ut-rule.md`)
- **With --module**: Module-specific path (e.g., `{docs.path}/sub-workspaces/{sw}/modules/{module}/rules/test/ut-rule.md`)
- **Without --sub-workspace**: Workspace path (e.g., `{docs.path}/rules/test/ut-rule.md`)
- **docs.path**: From `.specify.json` config (default: `.specify/configurations`)

---

## Execution

### Step 0: Parse Arguments & Sub-Workspace/Module Selection

Parse user input for targeting:
1. Check if `--sub-workspace NAME` and/or `--module NAME` in command args
2. If not in flags, extract sub-workspace/module name from natural language prompt
3. If still not resolved, auto-detect from CWD
4. If multiple sub-workspaces and none resolved → Ask user which sub-workspace
5. `--module` requires `--sub-workspace` — resolve SW first, then pass both flags to CLI
6. If CLI returns JSON error → parse and relay message to user

**Run bash script with appropriate flags**:

```bash
# If sub-workspace specified or detected:
cd $CLAUDE_PROJECT_DIR/.specify/scripts/ts && bun src/index.ts ut create-rules --sub-workspace {SUB_WORKSPACE_NAME}

# If module specified (always pass --sub-workspace alongside --module):
cd $CLAUDE_PROJECT_DIR/.specify/scripts/ts && bun src/index.ts ut create-rules --sub-workspace {SUB_WORKSPACE_NAME} --module {MODULE_NAME}

# Otherwise (standalone workspace):
cd $CLAUDE_PROJECT_DIR/.specify/scripts/ts && bun src/index.ts ut create-rules
```

**CRITICAL: Handle script errors**:
- **If exit code != 0**: **STOP IMMEDIATELY**. Do NOT continue or try workarounds.
- **If "Required tools not installed"**: Show error message to user and STOP. User must install prerequisites first.
- **If other errors**: Show error message and STOP.

**On success only**: Parse JSON output → Store `rulesFile`, `templateFile`, `mode`, `outputRoot`, `subWorkspaces`

If `mode` = "exists" → Ask: Update / Replace / Cancel

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

### Step 1: Detect Framework (AI)

**Scan config files using Read tool**:

| File | Framework | Language |
|------|-----------|----------|
| `package.json` → devDependencies | vitest, jest, mocha, jasmine | JavaScript/TypeScript |
| `pyproject.toml` / `requirements.txt` | pytest, unittest | Python |
| `Gemfile` | rspec, minitest | Ruby |
| `pom.xml` / `build.gradle` | junit, testng | Java |
| `composer.json` | phpunit, pest | PHP |
| `*.csproj` | xunit, nunit, mstest | C# |
| `go.mod` | testing, testify | Go |

**Ask user** via AskUserQuestion:
- Detected: "{Framework}" for {Language} - Use this?
- Or select from supported frameworks

---

### Step 2: Scan Existing Tests (AI)

**Use Glob tool** (language-specific patterns):

| Language | Patterns |
|----------|----------|
| JS/TS | `**/*.test.{ts,js}`, `**/*.spec.{ts,js}` |
| Python | `**/test_*.py`, `**/*_test.py` |
| Ruby | `**/*_spec.rb` |
| Java | `**/Test*.java`, `**/*Test.java` |
| C# | `**/*Tests.cs`, `**/*Test.cs` |
| PHP | `**/*Test.php` |
| Go | `**/*_test.go` |

**If found**: Read 3-5 samples, analyze patterns

**Ask**: Follow existing patterns? (Yes / Customize / Ignore)

---

### Step 3: Gather Preferences

**Ask via AskUserQuestion**:
1. **Naming**: Framework default / Custom
2. **Organization**: Co-located / Separate directory / Test project
3. **Coverage**: 80% / 70% / 90% / Custom
4. **Mocking**: Framework default / Manual / Mixed

---

### Step 4: Fill Template Placeholders

**Read** `{templateFile}` and fill based on detected framework:

#### Placeholder Reference

| Placeholder | JS/TS (Vitest) | Python (Pytest) | C# (xUnit) | Go |
|-------------|----------------|-----------------|------------|-----|
| `[LANGUAGE]` | TypeScript | Python | C# | Go |
| `[LANGUAGE_EXT]` | typescript | python | csharp | go |
| `[FILE_PATTERN]` | `*.test.ts` | `test_*.py` | `*Tests.cs` | `*_test.go` |
| `[TEST_CASE_PATTERN]` | `should {action}` | `test_{action}` | `{Action}_Should_{Result}` | `Test{Action}` |
| `[IMPORT_STATEMENT]` | `import { describe, it, expect } from 'vitest'` | `import pytest` | `using Xunit;` | `import "testing"` |
| `[MATCHER]` (equality) | `toBe()` | `assert x == y` | `Assert.Equal()` | `assert.Equal()` |
| `[MATCHER]` (error) | `toThrow()` | `pytest.raises()` | `Assert.Throws<>()` | `assert.Panics()` |
| `[MOCK_METHOD]` | `vi.mock()` | `@patch` | `Mock<T>` | `mockery` |
| `[LIFECYCLE_EXAMPLE]` | `beforeEach(() => {})` | `@pytest.fixture` | `IClassFixture<T>` | `func TestMain(m)` |

---

### Step 5: Generate Examples

**Generate 3 examples** in detected language:

1. **Basic Test** - Simple function test
2. **Error Handling** - Exception/error test
3. **Async with Mock** - Mocking external dependency

---

### Step 6: Save & Confirm

1. Preview first 30 lines
2. Confirm → Write to `{rulesFile}`

---

### Step 7: Post-Creation Updates ⚠️ MANDATORY

After writing `{rulesFile}`, **always** update these two files:

#### 7A: Update `document-manager.md`

**File**: `{workspaceRoot}/.specify/configurations/document-manager.md`

Add a new row to the **System Documents** table based on targeting mode:

**If `--module` was used** (output JSON has `moduleName`):
```markdown
| `sub-workspaces/{subWorkspaceName}/modules/{moduleName}/rules/test/ut-rule.md` | {One-line description...} | `/tdk-ut-backfill-create-rules` |
```

**If `--sub-workspace` only** (no `moduleName` in output):
```markdown
| `sub-workspaces/{subWorkspaceName}/rules/test/ut-rule.md` | {One-line description...} | `/tdk-ut-backfill-create-rules` |
```

**Rules**:
- `{subWorkspaceName}` = the sub-workspace `name` from `.specify.json`
- `{moduleName}` = the module `name` from output JSON `moduleName` field
- Description: concise (1 sentence) — test framework + version, language, target project type
- If the row already exists → update the description, do NOT add duplicate

#### 7B: Update `.specify/.specify.json`

**File**: `{workspaceRoot}/.specify/.specify.json`

**Config format:** `.specify.json`. Examples below use JSON.

**If `--sub-workspace` only** (no module):
Add entry under `subWorkspaces` if not present:
```json
{ "name": "{subWorkspaceName}", "path": "{relative/path/to/test/project}" }
```

**If `--module` was used**:
Find the matching sub-workspace entry and add the module to its `modules` array if not present:
```json
{
  "name": "{subWorkspaceName}",
  "path": "{subWorkspacePath}",
  "modules": [
    { "name": "{moduleName}", "path": "{moduleRelativePath}" }
  ]
}
```

**When `modules` key is absent:**

Before (sub-workspace exists, no `modules` key):
```json
{ "subWorkspaces": [{ "name": "backend", "path": "backend" }] }
```

After (module added for the first time):
```json
{ "subWorkspaces": [{ "name": "backend", "path": "backend", "modules": [{ "name": "api", "path": "api" }] }] }
```

**Rule:** If `modules` key is absent → create it as an array. If `modules` exists but is null → replace with empty array then append. Never append after a null-valued key.

**Idempotency: module already exists in array → skip**

If `modules` array already contains an entry with `name: "{moduleName}"` → **skip, do NOT add duplicate.**

**Rules**:
- `{subWorkspaceName}` = sub-workspace name from output JSON
- `{moduleName}` = module name from output JSON `moduleName` field
- `{moduleRelativePath}` = module path from output JSON `moduleRelativePath` field (relative to sub-workspace)
- If the sub-workspace entry already exists with this module → skip (no duplicate)
- If the sub-workspace entry exists but lacks this module → append to `modules` array
- **Config format:** `.specify.json`. (Note: `.specify.yaml` is deprecated — run `bash .specify/scripts/bash/migrate-yaml-to-json.sh` to upgrade)

**Output**:
```
UT Rules created: {rulesFile}
Language: {language}
Framework: {name} {version}
Module: {moduleName} (if applicable)
document-manager.md: ✓ Updated
.specify.json: ✓ Entry added (or already exists)
Next: /tdk-ut-backfill-plan {feature-id}
```

---

## Supported Frameworks

| Language | Frameworks | File Pattern | Test Pattern |
|----------|------------|--------------|--------------|
| JavaScript/TypeScript | Vitest, Jest, Mocha | `*.test.ts` | `should {action}` |
| Python | Pytest, unittest | `test_*.py` | `test_{action}` |
| Ruby | RSpec, Minitest | `*_spec.rb` | `it {behavior}` |
| Java | JUnit, TestNG | `*Test.java` | `@Test void test{Action}` |
| PHP | PHPUnit, Pest | `*Test.php` | `test{Action}()` |
| C# | xUnit, NUnit, MSTest | `*Tests.cs` | `[Fact] {Action}_Should_{Result}` |
| Go | testing, testify | `*_test.go` | `func Test{Action}(t)` |

---

## Related

- `ut:plan` - Create test plan
- `ut:generate` - Generate tests
- `ut:auto` - Automated workflow
