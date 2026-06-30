# tdk-ut Skills — Usage Guide

How to configure unit-test planning and routed test implementation inside a tdk workspace.

## 1. Overview

`/tdk-ut-backfill-plan` is the TDK adapter for **unit-test planning**. It creates `ut/plan.md` and `ut/phases/*.md` artifacts. Test implementation is handled later by the consumer test skill selected from `{docs.path}/custom-workflow/plan-skill-routing.md`.

Entry points:

- `/tdk-plan` — detects when UT planning is needed and triggers `/tdk-ut-backfill-plan`.
- `/tdk-ut-backfill-plan` — generates test plan artifacts and injects the routed consumer `test` skill into UT phase files.
- `/tdk-implement` — executes all runnable phases, or one selected phase with `--phase NN`; when a phase contains `## Delegate Skills`, it runs those consumer skills before generic implementation.

## 2. Skills at a glance

| Skill | Purpose | Typical scope |
|-------|---------|---------------|
| tdk-ut-backfill-plan | Produce UT plan and per-module phase files | Module or SW |
| consumer test skill | Implement/run tests from a UT phase file | Module or SW |
| tdk-implement | Executes plan phases, optionally one selected phase, and delegates listed skills | Feature |

## 3. Quick start

1. Ensure a consumer test skill exists at `.claude/skills/{name}/SKILL.md` with framework, coverage targets, and naming conventions.

2. Map the `test` domain in `{docs.path}/custom-workflow/plan-skill-routing.md`:

```markdown
## backend
- test: /your-backend-unit-test-skill
```

3. Generate the implementation plan. UT planning is delegated when needed:

```text
/tdk-plan feat-001
```

4. Execute implementation. UT phase files delegate to the routed test skill:

```text
/tdk-implement feat-001
```

To execute one UT phase only, use `/tdk-implement feat-001 --phase NN`.

## 4. UT convention source and routing

UT conventions (framework, naming patterns, coverage targets, mocking strategies) are defined in the consumer's `.claude/skills/{name}/SKILL.md`.

Routing is declared in `{docs.path}/custom-workflow/plan-skill-routing.md`:

```markdown
## global
- test: /your-consumer-unit-test-skill

## backend
- test: /your-backend-unit-test-skill
```

`/tdk-ut-backfill-plan` reads the same routing file as `/tdk-plan`:
- matched sub-workspace `test` entry wins;
- `global.test` is the fallback;
- missing routing produces a warning and still generates UT plan artifacts without an implementation delegate.

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

Durable module ownership belongs in workspace layout, not ad hoc UT planning. When a
sub-workspace needs module boundaries, use `/tdk-workspace-layout-propose`, review
`workspace-layout-proposal.json`, review/apply with `/tdk-workflow-config-apply`,
and optionally run `/tdk-workspace-dependency-policy` for dependency guidance before
UT planning targets a specific module.

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

`apps/web/test/Button.test.ts` requires `apps/web/components/Button.ts`. When `components/Button.ts` is deleted, the routed consumer test skill should surface the orphan and ask per-item fix / exclude / ignore according to its own convention.

## 8. Decision flowchart

```
Which strategy?
├── tests next to source?              → co-location
├── tests in a parallel tree (same project)? → mirror
└── tests in a separate project/package?     → separate-project
```

## 9. Migration note — from `separate-folder` to `mirror`

`separate-folder` has been removed. When present in `.specify.json`, schema parsing fails with:

> `Strategy 'separate-folder' has been removed. Migrate to 'mirror' — see docs/en/guides/tdk-ut-backfill-skills-usage.md section 6.`

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
