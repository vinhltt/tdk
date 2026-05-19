---
name: tdk-bump
description: "Generate Keep-a-Changelog entries for .specify/, .claude/, .github/ config changes. Use when updating commands, scripts, templates, or governance files."
metadata: 
  version: "1.2.2"
---

# tdk-bump

Generate changelog entries for project configuration changes.

## Definition of Done

This skill completes SUCCESS only when ALL:
1. New version entry in CHANGELOG.md
2. marketplace.json.metadata.version matches (or N/A)
3. All affected plugin.json bumped
4. All changed skill/agent/hook/command components bumped — "changed" = any file in component directory M/A/D (not just SKILL.md). Removed components NOT bumped, listed under `### Removed` in CHANGELOG.
5. Step 13 `verify.ts` exits 0

ANY fail → report FAILED, DO NOT print success summary.

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

**Auto mode progress:** Print `[N/13] <step name>... ✓` for each step. Missing printouts = visible skip.

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

### Step 6: Compute component checksums

Run the manifest script to detect which files and components have changed:

```bash
bun .specify/scripts/ts/src/commands/manifest/compute.ts --project-root <project-root>
```

Parse JSON output. Structure: `{ "<plugin-name>": { new_files, changed_files, removed_files, unchanged_files, new_components, changed_components, unchanged_components, removed_components } }`

`removed_components` lists components present in the previous manifest but absent from the current scan (per component type). Render each as `### Removed\n- skill-foo (was 1.2.3)` using the version from the previous manifest entry.

**For each component type** (`skills`, `agents`, `hooks`, `commands`):

**If `new_{type}` and `changed_{type}` are both empty:** skip that type silently — no changes.

**Otherwise:**

**Version source resolution** (for each component):
- Read the component's definition file (`SKILL.md` or agent `.md`) frontmatter for a `version` field
- **If definition file has `version`**: trust it as source of truth
- **If no `version` in definition file**: fall back to `manifest.json` → `plugins.{plugin}.components.{type}.{name}.version`

**Apply version bumps:**

1. For each item in `new_{type}`: if definition file has version, use it; else set to `0.1.0`. Use computed checksum.
2. For each item in `changed_{type}`: resolve current version (definition file → manifest.json fallback), then bump patch (e.g., `1.0.0 → 1.0.1`). Use new checksum.
3. For each item in `unchanged_{type}`: keep existing version and checksum

**Auto mode (`--auto`):** Accept all auto-bumped versions without prompting. Print the reclassify table to stdout for visibility, then proceed.

**Interactive mode:** Display reclassify table using `AskUserQuestion`:

**Question:** "Component versions auto-bumped (patch). Reclassify any?"

Table format in question description:
```
┌──────────────────────────────────────┬───────┬────────────────────┐
│ Component                            │ Type  │ Version bump       │
├──────────────────────────────────────┼───────┼────────────────────┤
│ tdk-bump          │ skill │ 1.0.0 → 1.0.1     │
│ memory-guardian                      │ agent │ new → 0.1.0        │
│ tdk-core (hooks)             │ hooks │ 1.0.0 → 1.0.1     │
└──────────────────────────────────────┴───────┴────────────────────┘
```

**Options:**
- "Looks good, proceed" (Recommended)
- "Reclassify a component" → follow-up: ask which component and new bump type (patch/minor/major)

Hold the resolved component versions in memory — they will be written to `manifest.json` in Step 11.

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

### Step 11: Bump versions

1. Update `marketplace.json` → set `metadata.version` to the new global version.

2. For each affected plugin (had new/changed files or components in Step 6):
   - Read `manifest.json` → `plugins.{plugin-name}.components.{type}.{name}.version`
   - Set new component versions (bumped in Step 6) directly into manifest.json
   - Bump `plugins.{plugin-name}.version` with same bump type from Step 8
   - Update the plugin's `plugin.json` → `version` field to match the new plugin version
     - Locate via: `{plugin-name}/plugin.json` or `{plugin-name}/.claude-plugin/plugin.json`

3. For each affected skill/agent component (had version bumped in Step 6):
   - Read the component's definition file (`SKILL.md` or agent `.md`)
   - Update or add `version` field in frontmatter metadata to the new bumped version
   - **YAML indentation: always use 2-space indent** (e.g., `metadata:\n  version: "1.0.1"`). Never use 3-space.
   - If frontmatter exists but has no `version` field → add `version: "{new_version}"` after the last existing field, indented with 2 spaces
   - If no frontmatter exists → skip (don't create frontmatter for files that don't use it)

4. Run `bun run manifest --project-root <project-root> --write` to update file hashes (preserves versions already set in step 2).

**Version consistency rule:** After Step 11, the same version string for each component MUST appear in all three locations: `manifest.json`, `plugin.json` (plugin-level), and the component's definition file frontmatter.

### Step 12: Summary

Print summary: version bumped to X.Y.Z, N entries written across M categories, plugin.json updated for: [list of affected plugin names], SKILL.md versions synced for: [list of affected component names].

### Step 13: Post-flight verification (MANDATORY)

Before invoking `verify.ts`, ensure `--expected-version` is known. If the target version is not already established by earlier steps: propose a candidate (from the diff + current `marketplace.json.metadata.version`) and ask the user via `AskUserQuestion` to confirm before calling `verify.ts`. The script WILL exit 1 if `--expected-version` is missing.

Run the deterministic post-flight check:

```bash
bun .specify/scripts/ts/src/commands/changelog/verify.ts \
  --expected-version=<confirmed-version> \
  --plugins=<affected-plugins-csv> \
  --skills=<affected-skills-csv>
```

Expected output on success: `ALL CHECKS PASSED` (exit 0).

**On non-zero exit:**
1. Read the printed failures — each line includes `expected`, `actual`, and an actionable `fix:` hint with file path.
2. Apply the fixes exactly as the hints describe — do NOT invent alternate repairs.
3. Re-run `verify.ts` with the same flags until it exits 0.
4. Only after exit 0 may you print the Step 12 success summary.

**Never report SUCCESS after a non-zero verify exit.** The Definition of Done pins the success contract to `verify.ts` exit 0 — no exception.
