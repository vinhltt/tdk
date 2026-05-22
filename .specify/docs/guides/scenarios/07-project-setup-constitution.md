# Scenario: Project Setup & Constitution

> **When to use**: Setting up a new project or onboarding a team to the Tihon workflow. Establish architecture principles and configure sub-workspaces.

## Command Sequence

```
/tdk-constitution → /tdk-sub-workdspace-init
```

## Step-by-Step

### 1. Create the project constitution

```
/tdk-constitution
```

**What happens**: Claude guides you through defining project-level architecture principles (e.g., "YAGNI over premature abstraction", "API-first design"). These principles are checked during `/tdk-plan` and `/tdk-analyze`.

You can provide principles directly:

```
/tdk-constitution KISS for all services, PostgreSQL only, no ORM magic
```

**Output**: `.specify/memory/constitution.md`

The constitution uses semantic versioning (MAJOR.MINOR.PATCH) and propagates changes across plan/spec/tasks templates for consistency.

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

Create a consumer UT skill at `.claude/skills/{name}/SKILL.md` for each sub-workspace, defining test conventions (framework, naming patterns, coverage targets, mocking strategies). The `/tdk-ut-backfill-auto` skill resolves these at runtime.

## Tips

- `constitution` is project-level — no task ID needed. Run it once, update as principles evolve.
- Sub-workspace names should match your project structure (e.g., `backend`, `frontend`, `mobile`).
- Constitution violations are flagged as CRITICAL in `/tdk-analyze` reports.
- Run `constitution` before your first `/tdk-plan` so architecture principles are enforced from the start.
