---
name: tdk-bump
description: "Generate Keep-a-Changelog entries for .specify/, .claude/, .github/ config changes. Use when updating commands, scripts, templates, or governance files."
metadata:
  version: "1.3.0"
---

# tdk-bump

Generate changelog entries for project configuration changes.

## Definition of Done

This skill completes SUCCESS only when ALL:
1. New version entry in `.specify/CHANGELOG.md`
2. `marketplace.json.metadata.version` matches the bumped version
3. All affected plugin.json bumped **across every existing manifest format** (`.claude-plugin/`, `.codex-plugin/`, `.cursor-plugin/`). Missing Codex/Cursor mirrors are auto-scaffolded by `plugin-bump`.
4. All changed skill/agent/hook/command components bumped — "changed" = any file in component directory M/A/D (not just SKILL.md). Removed components NOT bumped, listed under `### Removed` in CHANGELOG.
5. Step 14 `verify.ts` exits 0 — includes per-format checks on claude/codex/cursor `plugin.json`.

ANY fail → report FAILED, DO NOT print success summary.

## Prerequisite: plugin-bump

This skill delegates per-plugin version cascade (3-format `plugin.json` sync, component bumps, per-plugin CHANGELOG) to the `plugin-bump` skill from `plugins-toolkit`. Before running, ensure `plugin-bump` is installed and reachable:

```bash
# Expected entry point (adjust path if plugins-toolkit is installed elsewhere):
PLUGIN_BUMP_RUN="$HOME/.claude/plugins/marketplaces/agent-plugins-marketplace/plugins/plugins-toolkit/skills/plugin-bump/scripts/run.ts"
test -f "$PLUGIN_BUMP_RUN" || { echo "plugin-bump missing — install plugins-toolkit"; exit 2; }
```

If `plugin-bump` is unavailable, fail fast in Step 11 with an actionable hint — do NOT silently fall back to single-format Claude-only bump (that would leave Codex/Cursor mirrors stale).

## Usage

```
/tdk-bump [--since <ref>] [--auto] [--bump patch|minor|major]
```

- **No args**: changelog from staged changes (`git diff --cached`)
- **`--since <ref>`**: changelog from `<ref>..HEAD` (e.g., `--since v1.0.0`, `--since HEAD~5`)
- **`--auto`**: skip all confirmations, use sensible defaults (no `AskUserQuestion` calls)
- **`--bump <type>`**: force version bump type in auto mode (default: `patch`). Ignored unless `--auto` is set.

## Tooling Rules

Prefer TypeScript scripts over Python oneliners or `jq`. Existing utilities:

```bash
# Read a JSON field (dot-notation path)
bun .specify/scripts/ts/src/utils/json-field.ts get <file> <dot.path>
bun .specify/scripts/ts/src/utils/json-field.ts get .claude-plugin/marketplace.json metadata.version

# Read as JSON object
bun .specify/scripts/ts/src/utils/json-field.ts get .claude-plugin/marketplace.json metadata --json

# Set a JSON field (updates file in-place)
bun .specify/scripts/ts/src/utils/json-field.ts set .claude-plugin/marketplace.json metadata.version 1.34.0
```

If a task requires something the existing TS scripts don't cover, **ask the user** to create a new utility script rather than writing an ad-hoc Python or shell oneliner.

The `version` field is already returned by Step 1's `collect-diff-data.ts` output — do **not** re-read `marketplace.json` separately.

## Workflow

**Auto mode progress:** Print `[N/14] <step name>... ✓` for each step. Missing printouts = visible skip.

### Step 1: Collect diff data

Run the helper script to get structured change data:

```bash
bun .claude/skills/tdk-bump/scripts/collect-diff-data.ts [--since <ref>]
```

Output is JSON: `{ "version": "x.y.z"|null, "changes": [{status, path, group, old_path?}] }`

Version is read from `marketplace.json` → `metadata.version`. Changelog exclude patterns are read from `.specify/.specify.json` → `changelog.exclude`.

### Step 2: Handle missing version

If `version` from Step 1 is `null` (marketplace.json has no version or file is missing):

**Auto mode (`--auto`):** Set version to `0.1.0` automatically. Print: "No version found — defaulting to 0.1.0".

**Interactive mode:** Use `AskUserQuestion`:
- **Question**: "`.specify/plugins/.claude-plugin/marketplace.json` has no version. Set one now?"
- **Options**:
  - "Set to 0.1.0" (Recommended)
  - "Let me specify version"

Then:
- Read `marketplace.json`, add/update `metadata.version` field with chosen value
- Set `version` variable for subsequent steps

### Step 3: Handle empty results

If `changes` array is empty, inform user: "No config changes detected in .specify/, .claude/, .github/. Try `git add` first or use `--since <ref>`." Then stop.

### Step 4: Warn on large changesets

If 50+ files in `changes`:

**Auto mode (`--auto`):** Proceed without confirmation. Print a warning: "Warning: large changeset (N files) — proceeding in auto mode."

**Interactive mode:** Use `AskUserQuestion` to confirm proceeding or suggest `--since` with narrower range.

### Step 5: Read actual diffs

Run `git diff` to get file contents for semantic analysis:

```bash
# For staged (default)
git diff --cached -- <file1> <file2> ...
# For --since mode
git diff <ref>..HEAD -- <file1> <file2> ...
```

Read the diffs to understand WHAT changed, not just which files.

### Step 6: Discover affected components

Run the manifest script to detect which files and components have changed per plugin:

```bash
bun .specify/scripts/ts/src/commands/manifest/compute.ts --project-root <project-root>
```

Parse JSON output. Structure: `{ "<plugin-name>": { new_files, changed_files, removed_files, unchanged_files, new_components, changed_components, unchanged_components, removed_components } }`

This step is **discovery only** — you do NOT compute new versions here. Versions are owned by `plugin-bump` (Step 11) which max-wins semver from per-plugin git diff and writes new versions into definition files (SKILL.md frontmatter, agent `version`, hooks.json `version`). Then `manifest compute --write` in Step 12 reads those versions back as source-of-truth.

What to extract from this output for downstream steps:

- **Affected plugins**: any plugin with non-empty `new_files`, `changed_files`, or `removed_files` → goes to Step 11 for `plugin-bump` delegation.
- **Components per category** (for changelog drafting in Step 7):
  - `new_components.{type}` → "Added" bullets
  - `changed_components.{type}` → "Changed" bullets
  - `removed_components.{type}` → "Removed" bullets (render as `- skill-foo (was 1.2.3)` using the version from the previous manifest entry — that record disappears after `plugin-bump` runs, so capture it now)

Keep this discovery data in memory for Step 7 (categorize) and Step 11 (build `--added/--changed/--removed` flags per plugin).

### Step 7: Categorize and draft entries

Map each change to Keep-a-Changelog categories:

| Git Status | Default Category |
|-----------|-----------------|
| `A` (added) | Added |
| `M` (modified) | Changed |
| `R` (renamed) | Changed |
| `D` (deleted) | Removed |

Group entries by component (from script output: Scripts, Commands, Templates, Embedded Skills, Claude Agent Config, GitHub Config, Memory, Configurations, Guides, Setup, Docs, General).

**Nested grouping rule:** When a component has 2+ entries in the same category (Added/Changed/Removed), nest them under one parent line instead of repeating the component tag:

- **Single entry** → inline: `- **[Component]** Description`
- **Multiple entries** → nested under parent:
  ```
  - **[Component]** Summary of changes (optional, omit if no natural summary)
    - Description 1
    - Description 2
  ```

This avoids repetitive `**[tdk-core]**` tags across many lines. The parent line MAY include a brief summary when one naturally fits; otherwise just the component tag is sufficient.

Draft human-readable descriptions by reading the actual diffs. Be specific about what changed, not just "updated file X".

### Step 8: Ask version bump type

**Auto mode (`--auto`):**
- If `--bump` is explicitly provided, use that value.
- Otherwise, infer from the changeset:
  - **`major`**: any `D` (deleted) entries in critical files (skills, commands, templates, configurations) — or breaking schema/contract changes detected in diffs
  - **`minor`**: any `A` (added) entries exist (new skills, commands, templates, etc.)
  - **`patch`**: only `M` (modified) or `R` (renamed) entries — tweaks/fixes to existing files
- Print: "Version bump: {type} (auto-inferred)" or "Version bump: {type} (--bump override)".

**Interactive mode:** Use `AskUserQuestion`:
- **Question**: "What type of version bump?" with AI suggestion based on change nature
- **Options**: patch (default, bug fixes/tweaks), minor (new features/capabilities), major (breaking changes)

### Step 9: Preview and confirm

**Auto mode (`--auto`):** Skip preview. Print drafted entries to stdout, then proceed directly to Step 10.

**Interactive mode:** Use `AskUserQuestion` to show numbered draft entries. User can:
- Approve as-is
- Reclassify entries (e.g., "move #3 to Fixed", "move #5 to Security")
- Edit descriptions
- Add entries to: Fixed, Security, Deprecated categories

### Step 10: Write changelog

**If `.specify/CHANGELOG.md` exists:**
- Read first 10 lines, check for `## [` pattern (Keep-a-Changelog format)
- If non-standard format detected:
  - **Auto mode (`--auto`):** Overwrite with standard format automatically. Print: "Non-standard CHANGELOG.md detected — overwriting with Keep-a-Changelog format."
  - **Interactive mode:** `AskUserQuestion`: overwrite with standard format, or abort
- Prepend new version section after the header block (after the blank line following format/versioning links)

**If `.specify/CHANGELOG.md` does not exist:**
- Create with standard header:
```markdown
# Changelog

All notable changes to the project configuration (.specify/, .claude/, .github/)
will be documented in this file.

Format: [Keep a Changelog](https://keepachangelog.com/en/1.1.0/)
Versioning: [Semantic Versioning](https://semver.org/spec/v2.0.0.html)
```

**Version section format:**
```markdown
## [x.y.z] - YYYY-MM-DD

### Added
- **[Component]** Description of single addition
- **[Component-B]** Summary of multiple additions
  - First addition detail
  - Second addition detail

### Changed
- **[Component]** Description of single change
- **[Component-B]** Summary of multiple changes
  - First change detail
  - Second change detail

### Removed
- **[Component]** Description of removal
```

**Grouping rule:** When a component has 2+ entries in the same category, always use the nested sub-bullet format. Never repeat the same `**[Component]**` tag on consecutive flat lines. Only include category sections that have entries. Use today's date (from `date +%Y-%m-%d`).

### Step 11: Delegate per-plugin cascade to `plugin-bump`

For each affected plugin (had new/changed files or components in Step 6), shell out to `plugin-bump`. This is the single source of truth for per-plugin manifest updates — do NOT hand-edit `plugin.json` files here.

**What `plugin-bump` handles automatically:**
- All three manifest formats: `.claude-plugin/plugin.json` (anchor), `.codex-plugin/plugin.json`, `.cursor-plugin/plugin.json`
- Auto-scaffolds missing `.codex-plugin/` and `.cursor-plugin/` directories by copying the Claude anchor (only `version` is overwritten on first creation — Codex `interface` block and Cursor-specific fields are preserved on subsequent runs)
- Cascade bumps to component frontmatter (`SKILL.md metadata.version`, agent `version`)
- Per-plugin `<plugin-dir>/CHANGELOG.md` (sibling to the workspace-level `.specify/CHANGELOG.md` written in Step 10 — they intentionally coexist as rollup + detail)

**Invocation per affected plugin:**

```bash
bun "$PLUGIN_BUMP_RUN" \
  --target=<absolute-path-to-plugin-dir> \
  --auto \
  --added="<bullet>" --added="<bullet>" \
  --changed="<bullet>" --changed="<bullet>" \
  --removed="<bullet>"
```

Build `--added/--changed/--removed` bullets from the Step 7 categorized entries **filtered to this plugin only**. Each bullet is one logical change (not one file). Reuse the same prose as the workspace CHANGELOG entries.

**Semver alignment:** `plugin-bump` auto-derives its own semver per plugin (max-wins from git diff: D=major, A=minor, M/R/C=patch). The workspace bump type from Step 8 may differ — that is intentional. Component bumps inside a plugin follow `plugin-bump`'s decision; marketplace-level bump in Step 12 follows Step 8.

**On non-zero exit from plugin-bump:**
- Exit 2 (precondition): dirty tree without `--auto`, empty diff, invalid ref → report to user verbatim, do NOT proceed to Step 12.
- Exit 4 (verify): plugin-bump's internal 4-check DoD failed → read its failure output, apply the fix, re-run for that plugin.
- Exit 99: unexpected error → bubble up to user.

Run all affected plugins sequentially (or in parallel via background tasks if changes are independent). Wait for ALL to exit 0 before Step 12.

### Step 12: Workspace-level finalization

After every affected plugin has been bumped by `plugin-bump`, tdk-bump owns ONLY the workspace-scope files that `plugin-bump` deliberately ignores. Two writes total:

1. **Bump `marketplace.json`** — set `.claude-plugin/marketplace.json` → `metadata.version` to the new workspace version (from Step 8).
   Codex reads this same file as a legacy-compatible marketplace catalog — no separate `.codex-plugin/marketplace.json` needed.

2. **Refresh `manifest.json`** — run:
   ```bash
   bun run manifest --project-root <project-root> --write
   ```
   `manifest compute` reads component versions directly from each definition file (SKILL.md `metadata.version`, agent `version`, hooks.json `version`) — the source-of-truth files `plugin-bump` just wrote. No explicit version propagation needed; the new versions are picked up automatically.

**Version consistency rule:** After Step 12, the version string for each plugin MUST match across:
- `manifest.json` → `plugins.{plugin}.version`
- `.claude-plugin/plugin.json` → `version`
- `.codex-plugin/plugin.json` → `version` (if exists)
- `.cursor-plugin/plugin.json` → `version` (if exists)

And each component version MUST match across `manifest.json` and its definition file frontmatter — enforced by `manifest compute` reading from frontmatter as the primary source.

### Step 13: Summary

Print summary: version bumped to X.Y.Z, N entries written across M categories, per-plugin cascade ran for: [list of affected plugins] (manifest formats touched per plugin), SKILL.md versions synced for: [list of affected component names].

### Step 14: Post-flight verification (MANDATORY)

Before invoking `verify.ts`, ensure `--expected-version` is known. If the target version is not already established by earlier steps: propose a candidate (from the diff + current `marketplace.json.metadata.version`) and ask the user via `AskUserQuestion` to confirm before calling `verify.ts`. The script WILL exit 1 if `--expected-version` is missing.

Run the deterministic post-flight check:

```bash
bun .specify/scripts/ts/src/commands/changelog/verify.ts \
  --expected-version=<confirmed-version> \
  --plugins=<affected-plugins-csv> \
  --skills=<affected-skills-csv>
```

Check 3 now reports per format — failure lines look like `plugin.json vs manifest [tdk-core/codex]` and the `fix:` hint suggests re-running `plugin-bump --target=plugins/<plugin>` to resync.

Expected output on success: `ALL CHECKS PASSED` (exit 0).

**On non-zero exit:**
1. Read the printed failures — each line includes `expected`, `actual`, and an actionable `fix:` hint with file path.
2. Apply the fixes exactly as the hints describe — do NOT invent alternate repairs.
3. Re-run `verify.ts` with the same flags until it exits 0.
4. Only after exit 0 may you print the Step 13 success summary.

**Never report SUCCESS after a non-zero verify exit.** The Definition of Done pins the success contract to `verify.ts` exit 0 — no exception.
