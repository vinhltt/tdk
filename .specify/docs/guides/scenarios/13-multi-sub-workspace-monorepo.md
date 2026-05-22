# Scenario: Multi-Sub-Workspace Monorepo

> **When to use**: Your project has multiple services (frontend, backend, mobile) that need isolated documentation and testing rules, but share a common workspace.

## Command Sequence

```
/tdk-sub-workdspace-init (×2) → /tdk-config-diff → /tdk-config-sync
```

## Step-by-Step

### 1. Initialize sub-workspaces

```
/tdk-sub-workdspace-init frontend
/tdk-sub-workdspace-init backend
```

**What happens**: Each command creates a sub-workspace configuration with its own `.specify.yaml` and `rules.md`. Documentation paths are isolated per workspace.
**Output**: `.specify.yaml` updated, workspace-specific rules created

### 2. Verify sub-workspaces

```
/tdk-sub-workdspace-list
```

**What happens**: Displays a table of all configured sub-workspaces with their paths and status.

### 3. Set up UT conventions per sub-workspace

Create a consumer UT skill at `.claude/skills/{name}/SKILL.md` for each sub-workspace, defining test conventions (framework, naming patterns, coverage targets). The `/tdk-ut-backfill-auto` skill resolves these at runtime.

### 4. Compare documentation between workspaces

```
/tdk-config-diff --sub-workspace frontend
/tdk-config-diff --sub-workspace backend
```

**What happens**: Shows diff tables comparing main workspace docs vs. each sub-workspace. Identifies missing, outdated, or conflicting documentation.

### 5. Synchronize shared documentation

Preview first, then apply:

```
/tdk-config-sync --all --dry-run
/tdk-config-sync --all
```

**What happens**: Syncs docs between the main workspace and all sub-workspaces. Shared docs (constitution, design system) propagate; workspace-specific docs stay isolated.

### 6. Generate documentation index

```
/tdk-config-index --sub-workspace frontend
/tdk-config-index --sub-workspace backend
```

**What happens**: Generates `document-manager.md` per sub-workspace — an index of all docs for LLM tool discoverability.

## Tips

- Initialize sub-workspaces BEFORE running any `--sub-workspace` flagged commands.
- Always `diff` before `sync` to understand what will change.
- UT conventions are workspace-specific — define them in each sub-workspace's consumer UT skill (`.claude/skills/{name}/SKILL.md`).
- Use `config:sync --dry-run` before actual sync to avoid unintended overwrites.
