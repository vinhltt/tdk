---
name: tdk-test-api-plan
description: "Generate API test plan from endpoints discovered via OpenAPI specs, codebase scouting, or manual input."
metadata:
  version: 1.1.1
---

# /tdk-test-api-plan - API Test Plan Generator

## Purpose

Generate `api-test-plan.md` from API endpoints. Discovers endpoints via OpenAPI spec, codebase scouting, or manual input. Output consumed by `/tdk-test-api-generate-testcase`.

---

## Usage

```bash
/tdk-test-api-plan {feature-id}                                    # Auto-discover endpoints
/tdk-test-api-plan {feature-id} --openapi path/to/spec.yaml        # From OpenAPI spec
/tdk-test-api-plan {feature-id} --sub-workspace backend             # Target sub-workspace
/tdk-test-api-plan {feature-id} --url http://localhost:3000/api     # Set base URL
/tdk-test-api-plan {feature-id} --force                             # Overwrite existing plan
```

### Update Mode
If `api-test-plan.md` already exists AND user provides an update description in natural language:
- Read existing plan, apply requested changes, write back. Skip full regeneration.

---

## Input Sources

| Priority | Source | Flag | Behavior |
|----------|--------|------|----------|
| A | OpenAPI spec | `--openapi <path>` | Parse via `parse_openapi_spec.py` -> structured JSON |
| B | Codebase scout | (auto) | Spawn Explore agent to find API endpoints. If nothing found -> fallback to C |
| C | Manual input | (fallback) | Ask user via AskUserQuestion for endpoints |

---

## Output

Creates in `{output_dir}/` (default: `tests/api/`):
- **api-test-plan.md** — endpoint inventory, auth config, test categories, execution order

---

## CRITICAL: Error Handling

| Error | Action |
|-------|--------|
| `test.api` missing in `.specify.json` | STOP with error + show suggested JSON config block for user to copy-paste |
| OpenAPI file not found | Warning, fallback to mode B/C |
| No endpoints discovered | STOP with error |
| Template not found | STOP: "Template missing. Check `.specify/templates/test/api-test/api-test-plan-template.md.tpl`" |

---

## Execution

### Step 0: Parse Arguments & Sub-Workspace Selection

**Parse user input for sub-workspace targeting**:
1. Check if `--sub-workspace NAME` in command args
2. If multi-sub-workspace workspace and no sub-workspace specified -> Ask user which sub-workspace

**Run environment script**:

```bash
# Standard mode:
bun .specify/scripts/ts/src/commands/test-api/plan-env.ts <feature-id>

# With options:
bun .specify/scripts/ts/src/commands/test-api/plan-env.ts <feature-id> --sub-workspace {NAME} --openapi {PATH}
```

Parse JSON output -> Store all fields.
If error -> STOP and report to user.

---

### Step 0.1: Read API Test Config

From script output, check `HAS_TEST_API_CONFIG`:

**If false** -> STOP with error message:
```
API test config not found in .specify.json.

Add the following block to your .specify/.specify.json:

{
  "test": {
    "api": {
      "outputDir": "tests/api",
      "authStrategy": "bearer",
      "baseUrlEnv": "API_BASE_URL",
      "tokenEnv": "API_TOKEN"
    }
  }
}
```

**If true** -> Continue. Log config values.

---

### Step 0.5: Check Existing Output (Update Mode)

**If HAS_EXISTING_PLAN = true AND user provided update prompt**:
1. Read existing `api-test-plan.md`
2. Apply requested changes
3. Write back updated file
4. Skip to Step 4 (output summary)

**If HAS_EXISTING_PLAN = true AND no update prompt AND FORCE_MODE = false**:
- AskUserQuestion: "Plan already exists. [Regenerate] [Skip]?"
- If Skip -> STOP

**If HAS_EXISTING_PLAN = false OR FORCE_MODE = true** -> Continue to Step 1.

---

### Step 1: Discover API Endpoints

**Mode A** — OpenAPI spec (if `OPENAPI_VALID = true`):
1. Run: `python "{PARSER_SCRIPT}" "{OPENAPI_PATH}"` (paths quoted!)
2. Parse JSON output -> endpoint inventory with resource grouping and CRUD order
3. Skip to Step 2

**Mode B** — Subagent Scout (default, if no `--openapi`):
1. Spawn Explore agent with prompt:
   ```
   Find all API endpoints in this codebase. Look for:
   - Route definitions (Express, Laravel, Django, FastAPI, etc.)
   - Controller classes with route decorators
   - API route files

   For each endpoint found, report: HTTP method, path, description, auth requirement.
   Working directory: {OUTPUT_ROOT}
   ```
2. Parse scout results -> endpoint list
3. If scout finds nothing -> Fallback to Mode C

**Mode C** — Manual input (fallback):
1. AskUserQuestion: "No endpoints auto-discovered. Please provide endpoints."
2. Ask for each: method, path, description, auth required (yes/no)
3. Allow batch input (paste table format)

**After discovery**: Show discovered endpoints to user for confirmation via AskUserQuestion.

---

### Step 2: Research Endpoints

For each discovered endpoint:
1. AI reads relevant source files (controllers, routes, middleware)
2. Extract: request validation rules, response structure, auth requirements, dependencies
3. Determine test categories per endpoint

---

### Step 3: Generate API Test Plan

1. **Read** template: `.specify/templates/test/api-test/api-test-plan-template.md.tpl`
2. **Fill sections**:

| Section | Source |
|---------|--------|
| Endpoint Inventory | From Step 1 discovery |
| Auth Configuration | From `.specify.json` test.api config |
| Test Categories | AI analysis per endpoint |
| Suggested Execution Order | CRUD lifecycle grouping (POST->GET->PUT->PATCH->DELETE) |
| Environment | From config (base_url_env, token_env) |

3. **Write** to `{API_TEST_DIR}/api-test-plan.md`

---

### Step 4: Output Summary

```
API Test Plan Created
=====================

Endpoints: {n} across {m} resources
Auth: {strategy}
Output: {path}/api-test-plan.md

Resources:
  - {resource}: {n} endpoints
  ...

Next: /tdk-test-api-generate-testcase {feature-id}
```

---

## Error Handling

| Error | Solution |
|-------|----------|
| .specify.json not found | Check workspace config |
| test.api block missing | Show suggested JSON config block |
| Template missing | Check `.specify/templates/test/api-test/api-test-plan-template.md.tpl` |
| OpenAPI parse error | Validate spec format, fallback to scout |
| No endpoints found | Ask user for manual input |
| Parser script missing | Warning: "parse_openapi_spec.py not found. Falling back to scout mode." |

---

## Related

- `/tdk-test-api-generate-testcase` — Generate testcase files from this plan
- `/tdk-test-api-gen-code-playwright-ts` — Generate Playwright TS code from testcases
