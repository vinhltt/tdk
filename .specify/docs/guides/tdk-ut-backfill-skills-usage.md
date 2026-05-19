# tdk-ut Skills — Usage Guide

How to configure and use the `tdk-ut-*` skills family for unit-test rule authoring, test planning, and automatic test generation inside a tdk workspace.

## 1. Overview

`tdk-ut-*` is the tdk sub-plugin for **unit-test rule management**. Skills cascade-merge rule files across 4 levels (global → sw-parent → sw-own → module) and drive test planning + generation from those rules.

Entry points:

- `/tdk-ut-backfill-auto` — end-to-end bootstrap (create rules + plan + generate).
- `/tdk-ut-backfill-create-rules` — scaffold a new `ut-rule.md`.
- `/tdk-ut-backfill-check-rules` — validate existence + cascade + (since v1.1) mirror structure.
- `/tdk-ut-backfill-plan` — generate test plan against target module.
- `/tdk-ut-backfill-impl` — write test files from the plan.

## 2. Skills at a glance

| Skill | Purpose | Typical scope |
|-------|---------|---------------|
| tdk-ut-backfill-auto | One-shot: rules → plan → generate | Workspace or SW |
| tdk-ut-backfill-create-rules | Create/update `ut-rule.md` | Any level |
| tdk-ut-backfill-check-rules | Validate rules + mirror structure | Any level |
| tdk-ut-backfill-plan | Produce test plan JSON | Module or SW |
| tdk-ut-backfill-impl | Emit test files from plan | Module |

## 3. Quick start

```bash
# 1. Create workspace-level UT rules (framework, coverage target):
/tdk-ut-backfill-create-rules

# 2. Validate rules exist + mirror structure is clean:
/tdk-ut-backfill-check-rules --sub-workspace backend

# 3. Plan + generate tests for a specific module:
/tdk-ut-backfill-plan    --sub-workspace backend --module api
/tdk-ut-backfill-impl --sub-workspace backend --module api
```

## 4. Cascade rule

Rules resolve bottom-up: module > sw-own > sw-parent > global. Most-specific wins **wholesale** per `##` section — sub-sections under a replaced heading are discarded. See `rule-cascade-merge-contract.md` for the full merge contract.

## 5. Config shape

Relevant fields in `.specify/.specify.json`:

```json
{
  "name": "my-workspace",
  "subWorkspaces": [
    {
      "name": "backend",
      "path": "backend",
      "modules": [
        { "name": "api", "path": "api", "testPath": "test/api" }
      ],
      "testMapping": {
        "strategy": "mirror",
        "exclude": {
          "source": ["**/*.d.ts"],
          "test":   ["fixtures/**"]
        }
      }
    }
  ]
}
```

- `testMapping.strategy` — one of `co-location`, `mirror`, `separate-project`.
- `testMapping.exclude.source` — glob patterns; orphan tests whose stripped source path matches are ignored.
- `testMapping.exclude.test` — glob patterns; matching test files are hidden from discovery.
- Module `testPath` — overrides the default test root (defaults to `test` under `mirror`).

<a id="6-testmapping-strategies"></a>
## 6. testMapping strategies

### 6.1 The three strategies

| Strategy | Description | Source/Test layout |
|----------|-------------|--------------------|
| `co-location` | Tests live next to source. | `src/foo.ts` + `src/foo.test.ts` |
| `mirror` | Tests live under a parallel tree rooted at `testPath` (defaults to `test`). | `src/foo.ts` + `test/foo.test.ts` |
| `separate-project` | Tests live in a completely separate package/app. | `apps/web/src/foo.ts` + `apps/web-test/foo.test.ts` |

### 6.2 Mirror vs separate-project

- **mirror**: single-project, DRY. Validator enforces that every test file has a matching source file. Best for library or monolithic-service codebases.
- **separate-project**: two distinct build graphs. No orphan validation — the test project owns its layout. Best when tests import the package under test by public API only (Nuxt + Vite reference app, integration suites).

### 6.3 `exclude` field

`exclude` filters the validator output; it does **not** affect the test runner.

```json
"exclude": {
  "source": ["**/*.d.ts", "**/generated/**"],
  "test":   ["**/fixtures/**", "**/e2e/**"]
}
```

Glob syntax follows [Bun.Glob](https://bun.com/docs/runtime/glob). Each pattern is matched **individually** — no alternation (`{a,b}`) across patterns, so patterns containing a literal `,` work as-is.

### 6.4 Default `testPath = 'test'`

For `mirror`, if a module omits `testPath`, the validator scans `test/` under the sub-workspace root. `validateModules()` does not emit a "testPath recommended" warning for `mirror` because this default is an explicit contract.

### 6.5 Symlink behavior (V1 — advisory only)

V1 does not define behavior for symlinked directories or files under `testPath`. Default `Bun.Glob` behavior applies. Users SHOULD avoid symlinks under `testPath`; if encountered, exclude via `testMapping.exclude.test`.

### 6.6 Cross-extension source match

Source match is **strict** — `Button.test.tsx` requires exactly `Button.tsx`. No extension-family fallback (`.tsx → .ts`). If your convention splits extensions (e.g. `.test.tsx` wrapping a `.ts` source), either:

- rename the test file so extensions align, or
- add the test file to `testMapping.exclude.test`.

## 7. Use cases

### UC-3: Nuxt + Vite monorepo (mirror)

One module, one `test/` tree. Validator detects stale test files whose source was deleted:

```json
{
  "name": "app",
  "subWorkspaces": [
    {
      "name": "web",
      "path": "apps/web",
      "modules": [{ "name": "components", "path": "components" }],
      "testMapping": { "strategy": "mirror" }
    }
  ]
}
```

`apps/web/test/Button.test.ts` requires `apps/web/components/Button.ts`. When `components/Button.ts` is deleted, `/tdk-ut-backfill-check-rules` surfaces the orphan and asks per-item fix / exclude / ignore.

## 8. Decision flowchart

```
Which strategy?
├── tests next to source?              → co-location
├── tests in a parallel tree (same project)? → mirror
└── tests in a separate project/package?     → separate-project
```

## 9. Migration note — from `separate-folder` to `mirror`

`separate-folder` has been removed. When present in `.specify.json`, schema parsing fails with:

> `Strategy 'separate-folder' has been removed. Migrate to 'mirror' — see docs/guides/tdk-ut-backfill-skills-usage.md section 6.`

### Before

```json
{
  "testMapping": { "strategy": "separate-folder" }
}
```

### After

```json
{
  "testMapping": { "strategy": "mirror" }
}
```

Optional: add module `testPath` (defaults to `test`) and `exclude` filters if orphan validation flags generated files.

## 10. Multi-sub-workspace config template

```json
{
  "name": "monorepo",
  "subWorkspaces": [
    {
      "name": "backend",
      "path": "services/backend",
      "modules": [
        { "name": "api",   "path": "api",   "testPath": "test/api" },
        { "name": "worker","path": "worker","testPath": "test/worker" }
      ],
      "testMapping": {
        "strategy": "mirror",
        "exclude": { "source": ["**/*.d.ts"], "test": [] }
      }
    },
    {
      "name": "web",
      "path": "apps/web",
      "modules": [{ "name": "components", "path": "components" }],
      "testMapping": { "strategy": "co-location" }
    },
    {
      "name": "e2e",
      "path": "apps/e2e",
      "testMapping": { "strategy": "separate-project" }
    }
  ]
}
```
