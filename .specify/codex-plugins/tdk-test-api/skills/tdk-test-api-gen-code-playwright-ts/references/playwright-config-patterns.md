# Playwright Config Patterns — Reference

Rules for generating `playwright.config.ts` from `test-execution-plan.yaml`.

---

## Base Config Structure

```typescript
import { defineConfig } from '@playwright/test';

export default defineConfig({
  testDir: '.',
  timeout: 30_000,
  retries: 0,
  reporter: [['list'], ['json', { outputFile: 'test-results/results.json' }]],
  use: {
    baseURL: process.env.API_BASE_URL || 'http://localhost:3000',
    extraHTTPHeaders: {
      'Accept': 'application/json',
      'Content-Type': 'application/json',
    },
  },
  projects: [
    // Generated from test-execution-plan.yaml phases
  ],
});
```

---

## Phase -> Project Mapping

Each phase in `test-execution-plan.yaml` becomes a Playwright project:

```yaml
# test-execution-plan.yaml
phases:
  - name: setup
    parallel: false
    files: [setup/auth.setup.ts]
  - name: create-resources
    parallel: true
    depends_on: [setup]
    files:
      - users/users-create.api.spec.ts
```

Maps to:

```typescript
projects: [
  {
    name: 'setup',
    testMatch: '**/setup/**/*.setup.ts',
  },
  {
    name: 'create-resources',
    testMatch: [
      '**/users/users-create.api.spec.ts',
    ],
    dependencies: ['setup'],
    fullyParallel: true,
  },
],
```

---

## Mapping Rules

| YAML Field | Playwright Config Field |
|------------|------------------------|
| `name` | `name` (project name) |
| `files` | `testMatch` (array of glob patterns) |
| `depends_on` | `dependencies` (array of project names) |
| `parallel: true` | `fullyParallel: true` |
| `parallel: false` | `fullyParallel: false` (or omit — default) |

---

## Auth Strategy Config Additions

### Bearer Token
No special config needed — auth handled in test code via `getAuthToken()`.

### Session / storageState
```typescript
projects: [
  { name: 'setup', testMatch: '**/setup/*.setup.ts' },
  {
    name: 'tests',
    dependencies: ['setup'],
    use: { storageState: 'playwright/.auth/user.json' },
    // ...
  },
],
```

---

## Environment Variables

Config should reference these env vars (from `.specify.json` test.api block):

```typescript
use: {
  baseURL: process.env['{base_url_env}'] || 'http://localhost:3000',
},
```

Where `{base_url_env}` comes from `.specify.json` `test.api.baseUrlEnv`.

---

## File Pattern Rules

- Setup files: `**/setup/**/*.setup.ts`
- Spec files: `**/{resource}/{resource}-{action}.api.spec.ts`
- If a phase has 1 file -> use exact path in `testMatch`
- If a phase has multiple files -> use array of exact paths

---

## .gitignore Content

```
# Playwright
playwright/.auth/
test-results/
playwright-report/
blob-report/
```
