---
name: tdk-ut-backfill-check-rules
description: "Validate existence and correctness of UT rules in workspace or sub-workspace."
metadata:
  version: "1.2.1"
---

# /tdk-ut-backfill-check-rules - Validate UT Rules

## Purpose

Check if UT rules (`ut-rule.md`) exist for sub-workspace/workspace. Shows summary if found.

---

## Usage

```bash
/tdk-ut-backfill-check-rules                                          # Check workspace rules
/tdk-ut-backfill-check-rules --sub-workspace {name}                   # Check sub-workspace-specific rules
/tdk-ut-backfill-check-rules --sub-workspace {sw} --module {name}     # Check module-specific rules
```

---

## Execution

### Step 0: Parse Arguments & Sub-Workspace Selection

Parse user input for targeting:
1. Check if `--sub-workspace NAME` and/or `--module NAME` in command args
2. If not in flags, extract sub-workspace/module name from natural language prompt
3. If still not resolved, auto-detect from CWD
4. If multiple sub-workspaces and none resolved → Ask user which sub-workspace
5. `--module` requires `--sub-workspace` — resolve SW first, then pass both flags to CLI
6. If CLI returns JSON error → parse and relay message to user

**Run bash script**:

```bash
# If sub-workspace specified:
cd $CLAUDE_PROJECT_DIR/.specify/scripts/ts && bun src/index.ts ut check-rules --sub-workspace {SUB_WORKSPACE_NAME}

# If module specified (always include --sub-workspace):
cd $CLAUDE_PROJECT_DIR/.specify/scripts/ts && bun src/index.ts ut check-rules --sub-workspace {SUB_WORKSPACE_NAME} --module {MODULE_NAME}

# Otherwise:
cd $CLAUDE_PROJECT_DIR/.specify/scripts/ts && bun src/index.ts ut check-rules
```

Parse JSON output → Store `rulesFile`, `exists`, `framework`, `coverageTarget`, `mirrorValidation`.

### Step 0.5: Handle config parse errors

If the CLI JSON output contains an `error` field (from `parseConfig()`) → **DO NOT** silently dump it. Invoke `AskUserQuestion`:

**Question:** "Config parse failed. First line: `{firstLine of error}`. How to proceed?"

**Options:**
1. **Fix manually** — print full `error` text verbatim; instruct user to edit `.specify.json` and re-invoke skill. Skill exits.
2. **Confirm migration** — ONLY offer when `firstLine` starts with `` parse_error:Strategy 'separate-folder' has been removed ``. Skill prints the before/after config diff from `docs/guides/tdk-ut-backfill-skills-usage.md` section 9. Ask user to apply and re-invoke. NO auto-edit.
3. **Cancel** — skill exits with no further action.

**Step 0b: Module detection** (after CLI output parsed, only when sub-workspace resolved):
- In the CLI JSON output, find the entry in `subWorkspaces[]` matching `subWorkspaceName` → read its `hasModules` flag
- If `hasModules` is falsy (false/absent):
  → Ask user: "Sub-workspace {name} doesn't have modules configured. Would you like to:"
    1. **Create a module** — add a module entry to `.specify.json`
    2. **Proceed at SW-level** — continue without module targeting (L2 path)
  → If user picks "Proceed at SW-level" → continue without `--module`
  → If user picks "Create a module":
    a. Ask for module name — validate format: `/^[a-zA-Z0-9._-]+$/` (reject if invalid, ask again)
    b. **Directory picker**: List directories inside the SW root path + a "Create new directory" option. If user picks existing dir → use that path. If user picks "Create new" → ask for directory name (validate: `/^[a-zA-Z0-9._-]+$/`, reject if invalid).
    c. testPath (optional): if SW has `testMapping.strategy` = `separate-project` or `mirror`, ask user to pick test directory too
    d. Read `.specify.json` from workspace root (`$CLAUDE_PROJECT_DIR/.specify/.specify.json`)
    e. Find the sub-workspace entry matching resolved SW name
    f. **Idempotency check**: if `modules[]` already contains entry with same `name` → skip, inform user
    g. If `modules` key absent/null on SW entry → create empty array first
    h. Build new module object: `{ "name": "{name}", "path": "{selected-dir-relative-path}" }` (add `"testPath"` if provided)
    i. Append module to `modules[]` and set `"hasModules": true` on same SW entry
    j. **Validate BEFORE writing**: Parse the modified in-memory JSON object. If validation fails → report error and DO NOT write to disk.
    k. Only if validation passes → write `.specify.json` back (preserve formatting with 2-space indent)
    l. **Verify**: RE-RUN CLI with `--sub-workspace {SW} --module {MODULE}` — if CLI returns success JSON, the config is valid. If CLI errors, report the error to user.
- If `hasModules=true` AND the matched SW's `modules[]` is empty/absent:
  → Ask user: "Sub-workspace {name} is configured for modules but none defined yet. Proceed at sub-workspace level? [Yes / No — I'll add modules first]"
  → If user says No → **STOP** and instruct user to add modules to `.specify.json`
  → If user says Yes → proceed without `--module` flag (SW-level)
- If `hasModules=true` AND `modules[]` has entries AND module not yet resolved (flag/NL/CWD):
  → Ask user: present list of module names from the matched SW's `modules[]` + "Sub-workspace level (apply to all modules)" option
  → If user picks a module → **RE-RUN CLI** with `--sub-workspace {SW} --module {MODULE}` flags
  → If user picks SW-level → **RE-RUN CLI** with `--sub-workspace {SW}` only (no --module)
- **IMPORTANT**: After asking, always RE-RUN the CLI command with resolved flags. Do NOT pass values through conversation memory — re-invoke CLI to ensure consistent state.
- Use `subWorkspaceName` from CLI output (not SKILL's internal resolved name) as the authoritative key to match (RT#11).

---

### Step 1: Check Result

**If exists = true**:
- Read `rulesFile` content (primary = most-specific level).
- Perform cascade merge per "Rule Loading (Merge Cascade)" section below; framework/coverage parse runs against **merged content** (in-memory), not `rulesFile` alone.
- Display summary:
  ```
  ✅ UT Rules Found
  ==================
  File: {rulesFile}
  Framework: {framework}
  Coverage: {coverageTarget}

  Key sections:
  - Naming conventions ✓
  - Test organization ✓
  - Mocking strategy ✓
  ```

**If exists = false**:
- Show error:
  ```
  ❌ UT Rules Not Found
  ======================
  Expected: {rulesFile}

  💡 Run `/tdk-ut-backfill-create-rules` to create UT standards first.
  ```
- Exit with suggestion

---

### Step 2: Mirror structure validation (auto-gated by `strategy === 'mirror'`)

The CLI emits `mirrorValidation` automatically when any sub-workspace uses `testMapping.strategy = 'mirror'`; `null` otherwise. **No flag required** — skip this step entirely if `mirrorValidation` is `null`.

Parse `mirrorValidation.byModule.{module}.orphanTests[]`. Aggregate the total count `N` across all modules, and count distinct modules `M` that have at least one orphan.

**If `N === 0`:** print `Mirror structure: OK` and skip to Step 1 summary. No prompt.

**If `N >= 1`:** **always** ask the meta-choice (no count threshold):

**Meta-choice** — `AskUserQuestion`:

**Question:** "Found {N} orphan test(s) across {M} module(s). How to handle?"

Each orphan carries three fields:
- `testFile` — path relative to sub-workspace root, for display/`mv` commands.
- `expectedSource` — path relative to sub-workspace root, for display/`touch` commands.
- `expectedSourceRel` — path relative to `module.path`. **This is the value to write to `testMapping.exclude.source`** — the validator's `matchesAny()` matches patterns against this form, not the sub-workspace-joined `expectedSource`.

**Options:**
1. **Bulk add all to exclude** — for each orphan, skill reads `.specify.json`, locates the sub-workspace, and appends the orphan's `expectedSourceRel` to `testMapping.exclude.source` (creating `exclude.source` if missing). De-dup: skip patterns already present. Writes file back with 2-space indent. Emits a summary of patterns added. User audits via `git diff`.
2. **Bulk ignore this run** — skip all findings, no persistence.
3. **Per-item review** — fall through to the per-item 3-choice prompt below.

**Per-item review** (only if meta = "Per-item review"):

For each orphan `{ testFile, expectedSource, expectedSourceRel }`, `AskUserQuestion`:

**Question:** "Test file `{testFile}` has no matching source at `{expectedSource}`. How to handle?"

**Options:**
1. **Fix** — skill prints suggested commands:
   - Create source: e.g. `touch {expectedSource}` then implement.
   - OR rename test file so its stripped name matches an existing source (e.g. `mv {testFile} {newTestFile}`).
   Skill does NOT auto-execute — user runs commands.
2. **Add to exclude** — skill **auto-edits `.specify.json`** (git is audit trail):
   - Read `.specify.json` via `JSON.parse(readFileSync(...))`.
   - Locate the sub-workspace by name; ensure `testMapping.exclude.source` is an array (create object/array if absent).
   - Append `expectedSourceRel` (the module-relative form — **not** `expectedSource`) if not already present.
   - Write file back: `writeFileSync(path, JSON.stringify(cfg, null, 2))`.
   - Emit: "Added `<expectedSourceRel>` to `testMapping.exclude.source` in `.specify.json`. Verify via `git diff` — revert if unwanted."
3. **Ignore this run** — skip finding, no persistence.

After processing all orphans, proceed to Step 1 summary.

---

## Rule Loading (Merge Cascade)

**Full contract**: `.specify/docs/guides/rule-cascade-merge-contract.md` — read before merging.

**Rules (titles only, see contract for bodies)**:
1. Match headings (normalized via `github-slugger` v2.x).
1b. Duplicate heading within file → last wins + warning.
2. Most specific wins — WHOLESALE (sub-sections under replaced `##` are discarded).
3. Unique heading → inherit.
4. Sub-section merge only when parent `##` NOT overridden at more-specific level.
5. Preamble concat base-first, blank-line separator.
6. Empty file = no-op, still listed in summary.

**Version-skew fallback**: if CLI JSON lacks `utRulesFiles` or entry `level === 'unknown'` → synthesize single-file entry, skip Rules 1b/2/3/4/5, emit warning `Note: older CLI detected — upgrade for full cascade merge. Running in single-file mode.`

**Cascade summary** (1 line to user after merge):
`Loaded N rule file(s): global → sw-parent → sw-own → module` (list only levels actually present, in read order).

**Canonical headings**: see `.specify/docs/guides/ut-rule-canonical-headings.md`.

---

## Output

| Field | Description |
|-------|-------------|
| `rulesFile` | Full path to most-specific ut-rule.md (primary). |
| `utRulesFiles` | Array of `{path, level}` in base→specific order (all existing cascade levels). |
| `exists` | true/false (primary file existence) |
| `framework` | Detected framework (vitest, jest, etc.) — parsed from merged content |
| `coverageTarget` | Coverage percentage — parsed from merged content |

---

## Related

- `ut:create-rules` - Create UT rules
- `ut:plan` - Create test plan (uses rules)
- `ut:generate` - Generate tests (requires rules)
