---
name: tdk-test-api-gen-code-playwright-ts
description: "Generate Playwright TypeScript API test code from testcase files and execution manifest."
metadata:
  version: 1.1.0
---

# /tdk-test-api-gen-code-playwright-ts - Playwright TS API Test Code Generator

## Purpose

Read `*.testcases.md` + `test-execution-plan.yaml` + `.specify.json` config and generate production-ready Playwright TypeScript API test code with externalized test data.

---

## Usage

```bash
/tdk-test-api-gen-code-playwright-ts {feature-id}                          # Generate code
/tdk-test-api-gen-code-playwright-ts {feature-id} --sub-workspace backend  # Target sub-workspace
/tdk-test-api-gen-code-playwright-ts {feature-id} --force                  # Overwrite existing
```

### Update Mode
If `.api.spec.ts` files already exist AND user provides an update description:
- Read existing code, apply requested changes, write back, run `npx tsc --noEmit`.

---

## Input

- `*.testcases.md` — from `/tdk-test-api-generate-testcase` (required)
- `test-execution-plan.yaml` — execution manifest (required)
- `.specify.json` → `test.api` block (required)

---

## Output

Generated file structure:
```
tests/api/
├── setup/
│   └── auth.setup.ts              # Auth management (strategy-dependent)
├── {resource}/
│   ├── {resource}-{action}.api.spec.ts  # Test code per endpoint
│   ├── input.json                 # Request payloads (user-editable)
│   └── output.json                # Expected responses (user-editable)
├── playwright.config.ts           # Config with project deps from manifest
├── .gitignore                     # Exclude auth state, traces, results
└── test-execution-plan.yaml       # (from Skill 2, not modified)
```

---

## CRITICAL: Error Handling

| Error | Action |
|-------|--------|
| No `*.testcases.md` files found | STOP: "Run `/tdk-test-api-generate-testcase {feature-id}` first" |
| `test-execution-plan.yaml` missing | STOP: "Execution manifest missing" |
| `test.api` config missing | STOP with suggested YAML block |
| Testcase file missing required sections | STOP with list of issues |
| Generated TS has compile errors | Report errors, attempt auto-fix |

---

## Execution

### Step 0: Parse Arguments & Sub-Workspace Selection

**Run environment script**:

```bash
bun .specify/scripts/ts/src/commands/test-api/codegen-env.ts <feature-id> [--sub-workspace {NAME}] [--force]
```

Parse JSON output -> Store all fields.
If error -> STOP and report.

---

### Step 0.5: Check Existing Output (Update Mode)

**If HAS_EXISTING_SPECS = true AND user provided update prompt**:
1. Read existing `.api.spec.ts` files
2. Apply requested changes
3. Run `npx tsc --noEmit` to verify
4. DONE

**If HAS_EXISTING_SPECS = true AND no update prompt AND FORCE_MODE = false**:
- AskUserQuestion: "Generated code exists ({EXISTING_SPEC_COUNT} files). [Regenerate] [Skip]?"

**If HAS_EXISTING_SPECS = false OR FORCE_MODE = true** -> Continue.

---

### Step 1: Read Config

From script output, extract:
- `TEST_API_AUTH_STRATEGY` — determines auth.setup.ts pattern
- `TEST_API_BASE_URL_ENV` — env var for baseURL in config
- `TEST_API_TOKEN_ENV` — env var for auth token

**If HAS_TEST_API_CONFIG = false** -> STOP with error + suggested YAML block.

---

### Step 2: Read & Validate Testcase Files

1. Read all `*.testcases.md` from `TESTCASE_FILES`
2. Read `test-execution-plan.yaml`
3. **Validate** each testcase file has required sections:
   - Happy Path table (TC-ID, Description, Steps, Expected Status, Expected Response)
   - Validation table (for POST/PUT/PATCH)
   - Auth & Authorization table (if auth required)
   - Edge Cases table
   - Test Data section
4. **Validate** execution plan has valid phase structure (name, files, depends_on)
5. If validation fails -> STOP with error listing issues

---

### Step 3: Check Playwright Installation

From script output, check `HAS_PLAYWRIGHT`:
- **If false**: Show warning + install suggestion:
  ```
  Playwright not installed. Run:
    npm init playwright@latest
  ```
  Continue generating code (user can install later).
- **If true**: Log version.

---

### Step 4: Generate Setup Files + Test Data

**4a. auth.setup.ts** — Select pattern from `references/auth-strategy-patterns.md`:

| Strategy | Pattern |
|----------|---------|
| `bearer` | Export `getAuthToken(role)` reading from env vars |
| `session` | Playwright setup project with `storageState` |
| `api-key` | Export `getApiKey()` + `apiKeyHeaders()` |
| `none` | Export no-op functions |

Create `{API_TEST_DIR}/setup/auth.setup.ts`

**4b. .gitignore**:
```
playwright/.auth/
test-results/
playwright-report/
blob-report/
```

Create `{API_TEST_DIR}/.gitignore`

**4c. Per-resource test data** — For each resource directory:
- Extract test data from testcase "Test Data" sections
- Create `{resource}/input.json` — request payloads keyed by action
- Create `{resource}/output.json` — expected response data keyed by action

---

### Step 5: Generate Spec Files

For each `*.testcases.md`, generate co-located `.api.spec.ts`.

Follow patterns from `references/test-code-patterns.md`:

1. **Parse** testcase tables (Happy Path, Validation, Auth, Edge Cases)
2. **Generate** `test.describe` block with:
   - `test.describe.configure({ mode: 'serial' })` for CRUD lifecycle
   - Shared `let` variables for IDs captured during create tests
3. **Map** each TC row -> `test()` block:
   - TC-ID in test name: `test('TC-001: {description}', ...)`
   - Steps -> sequential statements in test body
   - Expected Status -> `expect(res.status()).toBe({status})`
   - Expected Response -> property/value assertions on `body`
4. **Import** test data: `import inputData from './input.json'`
5. **Import** auth: `import { getAuthToken, authHeaders } from '../setup/auth.setup'`
6. **Add teardown**: `test.afterAll()` to DELETE created resources
7. **Write** `{resource}/{resource}-{action}.api.spec.ts`

---

### Step 6: Generate Playwright Config

Follow patterns from `references/playwright-config-patterns.md`:

1. Read `test-execution-plan.yaml`
2. Map each phase -> Playwright project:
   - `name` -> project `name`
   - `files` -> `testMatch` array
   - `depends_on` -> `dependencies` array
   - `parallel` -> `fullyParallel` flag
3. Set `baseURL` from `TEST_API_BASE_URL_ENV` env var
4. Write `{API_TEST_DIR}/playwright.config.ts`

---

### Step 6.5: TypeScript Compile Check

Run: `npx tsc --noEmit --project {API_TEST_DIR}/tsconfig.json` (if tsconfig exists)
OR: `npx tsc --noEmit {API_TEST_DIR}/**/*.ts`

- If errors -> Report to user, attempt auto-fix for common issues
- If no tsconfig -> Skip check, warn user

---

### Step 6.6: Verify Teardown

Confirm each `test.describe` block that creates resources (POST) includes:
- `test.afterAll()` with DELETE call for cleanup
- If missing -> Add automatically

---

### Step 7: Output Summary

```
Playwright API Tests Generated
===============================

Auth strategy: {strategy}
Base URL env: {env_var}

Files created:
  Setup:
    - setup/auth.setup.ts
    - .gitignore
  Test data:
    - {resource}/input.json
    - {resource}/output.json
    ...
  Specs:
    - {resource}/{resource}-{action}.api.spec.ts ({n} tests)
    ...
  Config:
    - playwright.config.ts ({p} projects)

Total: {n} spec files, {tc} test cases

Run tests:
  cd {API_TEST_DIR} && npx playwright test

Next steps:
  1. Review generated input.json/output.json and adjust test data
  2. Set env vars: {BASE_URL_ENV}, {TOKEN_ENV}
  3. Run: npx playwright test
```

---

## Error Handling

| Error | Solution |
|-------|----------|
| Testcase files not found | Run `/tdk-test-api-generate-testcase` first |
| Execution manifest missing | Run `/tdk-test-api-generate-testcase` first |
| test.api config missing | Add test.api block to `.specify.json` |
| Playwright not installed | `npm init playwright@latest` |
| TS compile errors | Review generated code, check imports |

---

## Related

- `/tdk-test-api-plan` — Generate API test plan
- `/tdk-test-api-generate-testcase` — Generate testcase files (input for this skill)
