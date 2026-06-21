# Scenario: Project Setup & Constitution

> **When to use**: Setting up a new project or onboarding a team to the Tihon workflow. Establish architecture principles and configure sub-workspaces.

## Command Sequence

```
/tdk-constitution --init <brief|file> -> /tdk-sub-workdspace-init
```

## Step-by-Step

### 1. Create the project constitution

```
/tdk-constitution --init "Project brief or principle summary"
```

**What happens**: Claude guides you through defining project-level architecture principles (e.g., "YAGNI over premature abstraction", "API-first design"), bootstraps `.specify/memory/` when missing, and renders project knowledge artifacts from constitution and memory authority. These principles are checked during `/tdk-plan` and `/tdk-analyze`.

You can provide principles directly:

```
/tdk-constitution --init "KISS for all services, PostgreSQL only, no ORM magic"
```

**Output**:

- `.specify/memory/constitution.md`
- `.specify/memory/memory-index.md`
- `.specify/memory/memory.yaml`
- `.specify/memory/project-overview-prd.md`
- `.specify/memory/product-context.md`
- `.specify/memory/system-architecture.md`
- `.specify/memory/project-roadmap.md`

The constitution uses semantic versioning (MAJOR.MINOR.PATCH). Project knowledge artifacts are rendered outputs; README is human-facing context and cannot silently override constitution or memory. Product-wide facts live in `product-context.md`; epic discovery may surface candidates, but only `/tdk-constitution` updates project authority.

### 2. Initialize sub-workspaces

```
/tdk-sub-workdspace-init backend
/tdk-sub-workdspace-init frontend
```

**What happens**: Creates sub-workspace configuration with docs path, rules directory, and framework detection. Each sub-workspace can have its own coding standards and test rules.

**Output**: Updated `.specify/.specify.yaml`, `{docs-path}/rules.md`

### 3. Verify sub-workspaces

```
/tdk-sub-workdspace-list
```

Shows a table of all configured sub-workspaces with their paths, docs locations, and status.

### 4. Set up UT conventions per sub-workspace

Create a consumer test skill at `.claude/skills/{name}/SKILL.md` for each sub-workspace, defining test conventions (framework, naming patterns, coverage targets, mocking strategies). Map each skill with the `test` domain in `{docs.path}/custom-workflow/plan-skill-routing.md`.

## Tips

- `constitution` is project-level — no task ID needed. Run it once, update as principles evolve.
- Use `--init` for new project setup. Use plain `/tdk-constitution` for later principle amendments.
- Sub-workspace names should match your project structure (e.g., `backend`, `frontend`, `mobile`).
- Constitution violations are flagged as CRITICAL in `/tdk-analyze` reports.
- Run `constitution` before your first `/tdk-plan` so architecture principles are enforced from the start.
