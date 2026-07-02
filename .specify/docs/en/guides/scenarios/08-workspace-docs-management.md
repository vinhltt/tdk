# Scenario: Workspace Docs Management

> **When to use**: You need to compare, synchronize, or organize documentation files between the main workspace and sub-workspaces.

## Command Sequence

```
/tdk-config-diff → /tdk-config-sync → /tdk-config-index
```

## Step-by-Step

### 1. Compare docs between workspace and sub-workspace

```
/tdk-config-diff --sub-workspace backend
```

**What happens**: Shows a diff table comparing docs in the workspace root vs. the backend sub-workspace. Identifies missing, outdated, or conflicting files.

Add `--detailed` for full content comparison:

```
/tdk-config-diff --sub-workspace backend --detailed
```

### 2. Synchronize docs

Sync from workspace to sub-workspace:

```
/tdk-config-sync --to-sub-workspace backend
```

Sync from sub-workspace to workspace:

```
/tdk-config-sync --from-sub-workspace backend
```

Sync all sub-workspaces at once:

```
/tdk-config-sync --all
```

Preview changes before syncing:

```
/tdk-config-sync --to-sub-workspace backend --dry-run
```

### 3. Generate documentation index

```
/tdk-config-index --sub-workspace backend
```

**What happens**: Scans all docs in the sub-workspace and generates/updates `document-manager.md` — an index file listing all documentation with paths and descriptions.

For a full regeneration:

```
/tdk-config-index --sub-workspace backend --full
```

## Tips

- Always run `diff` before `sync` to understand what will change.
- Use `--dry-run` with `sync` for safe previews.
- `config:index` helps LLM tools discover documentation efficiently.
- The deprecated `/tdk-sub-workspace-sync` command redirects to `/tdk-config-sync`.
