---
name: tdk-test-api-generate-testcase
description: "Generate per-endpoint test case files and execution manifest from API test plan."
metadata:
  version: 1.1.0
---

# /tdk-test-api-generate-testcase - API Test Case Generator

## Purpose

Read `api-test-plan.md` and generate per-endpoint `*.testcases.md` files + `test-execution-plan.yaml` manifest. Output consumed by `/tdk-test-api-gen-code-playwright-ts`.

---

## Usage

```bash
/tdk-test-api-generate-testcase {feature-id}                          # Generate from plan
/tdk-test-api-generate-testcase {feature-id} --sub-workspace backend  # Target sub-workspace
/tdk-test-api-generate-testcase {feature-id} --force                  # Overwrite existing
```

### Update Mode
If testcase files already exist AND user provides an update description:
- Read existing files, apply requested changes, write back. Skip full regeneration.

---

## Input

- `api-test-plan.md` — from `/tdk-test-api-plan` (required)
- `.specify/templates/test/api-test/api-testcases-template.md` — template structure

---

## Output

Creates in `{output_dir}/{resource}/`:
- **{resource}-{action}.testcases.md** — one per endpoint
- **test-execution-plan.yaml** — execution manifest with phases and dependencies

---

## CRITICAL: Error Handling

| Error | Action |
|-------|--------|
| `api-test-plan.md` not found | STOP: "Run `/tdk-test-api-plan {feature-id}` first" |
| Plan missing required sections | STOP with list of missing sections |
| Template not found | STOP: "Template missing. Check `.specify/templates/test/api-test/api-testcases-template.md`" |

---

## Execution

### Step 0: Parse Arguments & Sub-Workspace Selection

**Run environment script**:

```bash
bun .specify/scripts/ts/src/commands/test-api/testcase-env.ts <feature-id> [--sub-workspace {NAME}] [--force]
```

Parse JSON output -> Store all fields.
If error -> STOP and report to user.

---

### Step 0.5: Check Existing Output (Update Mode)

**If HAS_EXISTING_TESTCASES = true AND user provided update prompt**:
1. Read existing testcase files
2. Apply requested changes
3. Write back updated files
4. Skip to Step 5

**If HAS_EXISTING_TESTCASES = true AND no update prompt AND FORCE_MODE = false**:
- AskUserQuestion: "Testcase files exist. [Regenerate all] [Skip]?"

**If HAS_EXISTING_TESTCASES = false OR FORCE_MODE = true** -> Continue.

---

### Step 1: Read & Validate API Test Plan

1. Read `api-test-plan.md`
2. **Validate** required sections exist:
   - Endpoint Inventory (table with Method, Path columns)
   - Auth Configuration (strategy, token source)
   - Test Categories (table with Category, Priority)
   - Suggested Execution Order (table with Phase, Endpoints)
3. If validation fails -> STOP with error listing missing/malformed sections
4. Extract:
   - Endpoint inventory table -> list of endpoints
   - Suggested execution order table -> phase mapping
   - Auth configuration -> strategy, roles

---

### Step 2: Create Resource Directories

For each unique resource (from endpoint paths):
```
{API_TEST_DIR}/{resource}/
```

---

### Step 3: Generate Test Cases Per Endpoint

**Process one endpoint at a time** (per-endpoint focused prompt for quality).

For each endpoint:
1. Read `api-testcases-template.md`
2. Determine applicable test categories from plan's priority matrix
3. Generate test cases by category:

**Happy Path** (always):
- Valid request with all required fields -> expected success status
- Multi-step verification: setup -> action -> verify response body + headers

**Validation** (for POST/PUT/PATCH):
- Missing each required field individually
- Invalid data types (string for number, etc.)
- Invalid formats (email, date, etc.)
- Boundary values (min/max length, empty string)

**Auth & Authorization** (if auth_required):
- No auth token -> 401
- Expired/invalid token -> 401
- Wrong role (if role-based) -> 403

**Edge Cases** (always):
- Duplicate creation (POST) -> 409 or appropriate
- Not found (GET/PUT/DELETE with invalid ID) -> 404
- Large payload
- Special characters in string fields

4. Generate test data section (JSON fixtures for this endpoint)
5. TC-ID numbering: sequential within each file (TC-001, TC-002...)
6. Write `{resource}/{resource}-{action}.testcases.md`

---

### Step 4: Generate Execution Manifest

Create `test-execution-plan.yaml` from plan's "Suggested Execution Order":

```yaml
phases:
  - name: setup
    parallel: false
    files: [setup/auth.setup.ts]
  - name: create-resources
    parallel: true
    depends_on: [setup]
    files:
      - users/users-create.api.spec.ts
      - orders/orders-create.api.spec.ts
  - name: read-after-create
    parallel: true
    depends_on: [create-resources]
    files:
      - users/users-detail.api.spec.ts
      - users/users-list.api.spec.ts
  - name: update-resources
    parallel: true
    depends_on: [read-after-create]
    files:
      - users/users-update.api.spec.ts
  - name: delete-resources
    parallel: false
    depends_on: [update-resources]
    files:
      - users/users-delete.api.spec.ts
```

Mapping rules:
- POST endpoints -> `create-*` phase
- GET endpoints -> `read-*` phase
- PUT/PATCH endpoints -> `update-*` phase
- DELETE endpoints -> `delete-*` phase (always sequential, always last)
- `depends_on` follows CRUD lifecycle order

---

### Step 5: Output Summary

```
Test Cases Generated
====================

Resources: {n}
Total test case files: {m}
Total test cases: {tc_count}

Files created:
  - {resource}/{resource}-{action}.testcases.md ({n} TCs)
  ...
  - test-execution-plan.yaml

Execution phases: {p}
  - setup (1 file)
  - create-resources ({n} files, parallel)
  ...

Next: /tdk-test-api-gen-code-playwright-ts {feature-id}
```

---

## Standard Test Patterns (Reference)

| Pattern | When | TC Count |
|---------|------|----------|
| CRUD Happy Path | POST/GET/PUT/DELETE endpoints | 1-2 per endpoint |
| Field Validation | POST/PUT with body | 3-8 per endpoint |
| Auth (no token) | Auth-required endpoints | 1 |
| Auth (expired) | Auth-required endpoints | 1 |
| Auth (wrong role) | Role-based endpoints | 1-3 |
| Not Found | Detail/Update/Delete | 1 |
| Duplicate | Create endpoints | 1 |
| Pagination | List endpoints | 1-2 |

Cap: ~15 test cases per endpoint. Focus on P1/P2 priority.

---

## Error Handling

| Error | Solution |
|-------|----------|
| api-test-plan.md not found | Run `/tdk-test-api-plan` first |
| Plan validation failed | Fix plan sections, re-run |
| Template missing | Check `.specify/templates/` |
| Endpoint with no clear action | Default to "custom" action |

---

## Related

- `/tdk-test-api-plan` — Generate the input plan
- `/tdk-test-api-gen-code-playwright-ts` — Generate Playwright TS from testcases
