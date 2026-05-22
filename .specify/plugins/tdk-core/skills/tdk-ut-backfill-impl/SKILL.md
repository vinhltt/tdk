---
name: tdk-ut-backfill-impl
description: "Generate executable unit test code based on the UT plan. Creates test files with test cases, assertions, mocks, and fixtures following sub-workspace conventions."
metadata:
  version: "2.0.0"
---

# /tdk-ut-backfill-impl - Generate Unit Test Files

## Purpose

Generate executable unit test code based on the UT plan. Creates test files with test cases, assertions, mocks, and fixtures following sub-workspace conventions.

---

## Usage

```bash
/tdk-ut-backfill-impl {feature-id}                                              # Generate tests
/tdk-ut-backfill-impl {feature-id} --sub-workspace {name}                       # Target specific sub-workspace
/tdk-ut-backfill-impl {feature-id} --sub-workspace {sw} --module {name}         # Target specific module
```

---

## Input

- **ut/plan.md** - Test organization, coverage goals, tracking table
- **ut/phases/*.md** - Per-module phase files with test matrices
---

## Output

Creates test files in sub-workspace directory:

| Framework | Pattern |
|-----------|---------|
| Jest/Vitest | `*.test.{ts,js}` or `*.spec.{ts,js}` |
| Pytest | `test_*.py` or `*_test.py` |
| RSpec | `*_spec.rb` |
| JUnit | `*Test.java` |
| xUnit/NUnit | `*Tests.cs` |
| Go | `*_test.go` |

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
Store resolved `--sub-workspace` and `--module` flags for use in this step and Step 0.1.

**Run bash script with sub-workspace flag**:

```bash
# If sub-workspace specified:
cd $CLAUDE_PROJECT_DIR/.specify/scripts/ts && bun src/index.ts ut backfill impl <feature-id> --sub-workspace {SUB_WORKSPACE_NAME}

# If module specified (always pass --sub-workspace alongside --module):
cd $CLAUDE_PROJECT_DIR/.specify/scripts/ts && bun src/index.ts ut backfill impl <feature-id> --sub-workspace {SUB_WORKSPACE_NAME} --module {MODULE_NAME}

# Otherwise:
cd $CLAUDE_PROJECT_DIR/.specify/scripts/ts && bun src/index.ts ut backfill impl <feature-id>
```

Parse JSON output -> Store `featureDir`, `planFile`

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

### Step 0.2: Resolve UT Skill (Consumer Conventions)

Read UT conventions from the consumer's skill in `.claude/skills/`:

1. If `/tdk-ut-backfill-auto` passed `UT_SKILL_PATH` → Read that file directly
2. Otherwise → Glob `.claude/skills/*/SKILL.md`, match by: skill name contains `-ut` or `-test`, OR frontmatter contains `domain: unit-test`
3. If found → extract `## Mocking Strategy`, `## Edge Cases`, `## Framework Syntax`, `## Test Structure` sections
4. If not found → continue with framework auto-detection from codebase

Store extracted conventions for code generation (Steps 4-6).

---

### Step 1: Load Plan and Phases

**Read from featureDir**:
- `ut/plan.md` - For framework, test organization, tracking table
- `ut/phases/*.md` - Per-module phase files with test matrices

**Extract from ut/plan.md**:
- Framework and version
- Test organization pattern (co-located, __tests__/, tests/)
- File naming convention
- Phases tracking table (module → phase file mapping)

**Extract from phase files**:
- §3 Test Matrix (ID, Source, Scenario, Technique, Input, Expected, Priority, Impl)
- §2 Mocks & Fixtures Required
- §1 Code Summary (function signatures)

If `ut/plan.md` missing -> "Run `/tdk-ut-backfill-plan {feature-id}` first"

---

### Step 2: Determine Test Paths (AI)

**From ut/plan.md "Test Organization" section**:

| Pattern Type | Example |
|--------------|---------|
| `/tests/` directory | `/tests/composables/useCalc.test.ts` |
| `__tests__/` subdirs | `composables/__tests__/useCalc.test.ts` |
| Co-located | `composables/useCalc.spec.ts` |
| Separate test directory | `MyProject.Tests/CalcTests.cs` |

Apply pattern to each source file in phases.

---

### Step 3: Read Source Files (AI)

For each test suite in phase files:

1. **Read source file** to understand actual implementation
2. **Extract**:
   - Function signatures and return types
   - Class methods and properties
   - Dependencies to mock
3. **Identify edge cases** from actual code logic

---

### Step 4: Generate Test Structure

**Template for Jest/Vitest**:
```typescript
import { describe, it, expect, beforeEach, vi } from 'vitest'
import { FunctionName } from '../path'

// Mocks
vi.mock('../dependency')

describe('FunctionName', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('should {test case from <func>__<slug>}', () => {
    // Arrange - from "Given"
    // Act - from "When"
    // Assert - from "Then"
  })
})
```

**Template for Pytest**:
```python
import pytest
from unittest.mock import patch
from module import function_name

class TestFunctionName:
    @pytest.fixture
    def setup(self):
        return function_name()

    def test_case_from_tc001(self, setup):
        # Arrange - from "Given"
        # Act - from "When"
        # Assert - from "Then"
```

---

### Step 5: Implement Test Cases

For each semantic ID in phase files:

| ID | Description | Type |
|----|-------------|------|
| `cart_calculateTotal__happy` | Should calculate total | happy |

Generate:

```typescript
it('should calculate total', () => {
  // Arrange
  const cart = new Cart()
  cart.add({ price: 10 })
  cart.add({ price: 20 })

  // Act
  const total = cart.calculateTotal()

  // Assert
  expect(total).toBe(30)
})
```

---

### Step 5.5: Add Docstring Back-References (Bidirectional Traceability)

Every generated test function MUST include a docstring/comment block that links back to the plan. Required fields: `TC`, `Plan`, `Scenario`, `Technique`, `Priority`.

**Python** (triple-quoted docstring):
```python
def test_parse_email__empty_raises_value_error():
    """TC: parse_email__empty
    Plan: .specify/specs/feature-260427-auth/ut/phases/api.md
    Scenario: Empty email raises ValueError
    Technique: EP/Error | Priority: P0
    """
    ...
```

**JS/TS** (JSDoc block comment):
```typescript
/** TC: parse_email__empty
 * Plan: .specify/specs/feature-260427-auth/ut/phases/api.md
 * Scenario: Empty email raises ValueError
 * Technique: EP/Error | Priority: P0
 */
it('parse_email__empty — empty email raises error', () => {
  ...
})
```

**Go** (comment block preceding test func):
```go
// TC: routes_parse_email__happy
// Plan: .specify/specs/feature-260427-auth/ut/phases/routes.md
// Scenario: Valid email returns parsed struct
// Technique: EP/Happy | Priority: P1
func TestRoutes_ParseEmail_Happy(t *testing.T) {
    ...
}
```

**Java** (Javadoc):
```java
/** TC: OrderService.charge__gateway_timeout
 * Plan: .specify/specs/feature-260427-payments/ut/phases/service.md
 * Scenario: Gateway timeout returns 503 response
 * Technique: Error/Timeout | Priority: P0
 */
@Test
void charge_GatewayTimeout() { ... }
```

**C#** (XML doc):
```csharp
/// <summary>TC: OrderService.charge__gateway_timeout</summary>
/// <remarks>
/// Plan: .specify/specs/feature-260427-payments/ut/phases/service.md
/// Scenario: Gateway timeout returns 503 response
/// Technique: Error/Timeout | Priority: P0
/// </remarks>
[Fact]
public void Charge_GatewayTimeout() { ... }
```

**Grep helper** (find all back-ref IDs across test files):
```
grep -oE '[a-zA-Z_][a-zA-Z0-9_.]*__[a-z0-9_]+'
```

---

### Step 6: Implement Mocks

**From ut/phases/{module}.md §2 Mocks & Fixtures Required**:

| Dependency | Mock Implementation |
|------------|---------------------|
| External API | `vi.mock('./api', () => ({ call: vi.fn() }))` |
| Database | In-memory mock or mock repository |
| File system | `vi.spyOn(fs, 'readFile')` |
| Time/Date | `vi.useFakeTimers()` |

---

### Step 7: Create Fixtures

If tests share data, create fixture files:

```typescript
// fixtures/users.ts
export const validUser = {
  id: 1,
  name: 'Test User',
  email: 'test@example.com'
}

export const invalidUser = {
  id: -1,
  name: '',
  email: 'invalid'
}
```

---

### Step 8: Write Files

1. Create directories if needed
2. Write test files with proper formatting
3. Write fixture files if created

---

### Step 9: Output Summary

```
Test Files Generated
=====================

Framework: {Vitest 3.2.4}
Pattern: {__tests__/ subdirectories}

Files Created:
  - composables/__tests__/useCalc.test.ts (5 tests)
  - utils/__tests__/validator.test.ts (3 tests)
  - fixtures/users.ts

Total: 8 test cases

Mocks:
  - External API (vi.mock)
  - Database (mock repository)

Next: Run tests with `npm test` or `pnpm test`
```

---

## Quality Checklist

- [ ] All test cases (semantic IDs) from phase files implemented
- [ ] Mocks isolate external dependencies
- [ ] Assertions are meaningful (not just `toBeDefined`)
- [ ] Edge cases covered
- [ ] Code follows framework conventions
- [ ] Imports are correct
- [ ] Generated code is syntactically valid

---

## Error Handling

| Error | Solution |
|-------|----------|
| ut/plan.md missing | Run `/tdk-ut-backfill-plan {feature-id}` first |
| ut/phases/*.md missing | Run `/tdk-ut-backfill-plan {feature-id}` first |
| Source file not found | Skip that suite, continue with others |
| Framework not detected | Ask user to specify |

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

- `/tdk-ut-backfill-plan` — create test plan (run first)
- `/tdk-ut-backfill-auto` — automated workflow (plan + generate + run)
