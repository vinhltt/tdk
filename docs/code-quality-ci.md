# Code-quality CI

[code-quality.yml](../.github/workflows/code-quality.yml) checks the two main Bun packages on every PR targeting `main`, on pushes to `main`, and through manual dispatch once the workflow is available on the default branch. There are no path filters, so future Required checks can always report.

## Check scope

| Check name | Package | Commands |
|---|---|---|
| `codecheck-scripts` | `.specify/scripts/ts` | `bun run typecheck`, `bun run test` |
| `codecheck-setup` | `packages/tdk-setup` | `bun run typecheck`, `bun run test` |

The matrix entries run independently on `ubuntu-latest`; one failure does not cancel the other. Any install, typecheck or test failure fails its check. Each job has a 20-minute timeout. A newer run for the same PR/ref cancels obsolete runs.

Both existing typecheck commands use `tsc --noEmit` with their package tsconfig. These configs include production `src/**/*.ts`, **not test TypeScript**. Bun executes/transpiles the complete test suites without typechecking test files. The workflow does not claim test-code type safety or run plugin-specific suites outside these two packages.

## Runner preparation

The checkout contains the full repository/history and does not persist credentials. Bun comes from the repo's `.bun-version`; third-party actions are pinned by full commit SHA. Tests expect Linux tools such as Bash, Git and Node provided by the Ubuntu runner. No PAT, Environment secret or external service is needed; workflow token permissions are `contents: read`.

Every runner installs the same three prerequisite packages with `--frozen-lockfile` before its selected package checks:

- `.specify/scripts/ts`
- `packages/tdk-setup`
- `.specify/plugins/tdk-utils/skills/tdk-handoff/scripts`

This is intentional cross-package preparation, not a workspace-root install. Scripts distribution tests use setup's `node_modules`, setup e2e runs the scripts manifest CLI, and `tests/handoff-export.test.ts` imports handoff TypeScript that resolves its own `commander` dependency. Installing only the selected main package is insufficient. Lockfiles must not be regenerated during CI.

Scout tests substitute external Repomix through dependency injection; they do not require a global Repomix install. The workflow does not add one.

## Local reproduction

From a complete source checkout, using the Bun version in `.bun-version`:

```bash
(cd .specify/scripts/ts && bun install --frozen-lockfile)
(cd packages/tdk-setup && bun install --frozen-lockfile)
(cd .specify/plugins/tdk-utils/skills/tdk-handoff/scripts && bun install --frozen-lockfile)

(cd .specify/scripts/ts && bun run typecheck && bun run test)
(cd packages/tdk-setup && bun run typecheck && bun run test)
```

Run from the package directory: setup uses its `bunfig.toml` test preload for fixture cleanup. Keep full suites; do not replace them with smoke subsets, skip failing cases, or rerun until green without diagnosing the failure. Git identity/fixture isolation and missing-tool errors should be investigated from the failing test and runner output.

## Relationship to security and release

These checks cover compilation and test behavior, not dependency advisory scanning or SAST. Dependency-security CI is a separate concern; these jobs need no cross-repository issue token.

Workflow and this guide are maintainer-only files outside the distributed `.specify/` payload. This CI-only change does not alter package scripts, production code, tests, lockfiles, version metadata or consumer release manifests.

Adding a workflow does **not** make its checks Required automatically. After the workflow is merged and proven green on `main`, the owner can separately require the exact `codecheck-scripts` and `codecheck-setup` contexts. That repository-protection change needs separate approval. Do not enable a Required context before the workflow exists on `main`; unrelated PRs could otherwise wait for a check that cannot run. Disable/remove only this workflow to roll it back, and remove any associated Required contexts if they were configured later.
