# CHANGELOG.md Entry Format and Change Type Taxonomy

Reference for `/tdk-memory-changelog`. Defines entry structure, field semantics,
change type classification, and multi-file grouping rules.

---

## Entry Format

One combined entry per skill run. Prepend to `CHANGELOG.md` after the header comment.

```markdown
## {YYYY-MM-DD} — {overall description}

**Changed by**: {agent name | "manual edit"}
**Files affected**: {comma-separated list of relative paths}

### {relative/path/to/file-1.md}
**Change type**: {added | modified | deprecated}
**Description**: {what changed and why — from group description}
**Verified**: {sha256 hex — computed from working-tree file}

### {relative/path/to/file-2.md}
**Change type**: {added | modified | deprecated}
**Description**: {what changed and why}
**Verified**: {sha256 hex}
```

### Field Definitions

| Field | Source | Notes |
|-------|--------|-------|
| `YYYY-MM-DD` | Today's date | Use `date +%Y-%m-%d` or equivalent |
| Overall description | User answer (Step 3, overall batch) | Brief summary of the change batch |
| `Changed by` | User answer (Step 3, once) | Agent skill name or "manual edit" |
| `Files affected` | Parsed from `git diff --staged` | All paths in this entry |
| `### {path}` | Per-file subsection | One per changed file |
| `Change type` | Auto-derived from git status | A→added, M→modified, D→deprecated |
| `Description` | User answer (Step 3, per group) | One description covers all files in group |
| `Verified` | Computed SHA256 | From working-tree file (or `_deprecated/` copy) |

---

## Change Type Taxonomy

| Type | Git Status | When to Use |
|------|-----------|-------------|
| `added` | `A` | New memory file created for the first time |
| `modified` | `M` | Existing section content updated (field added, rule changed, etc.) |
| `deprecated` | `D` | File moved to `_deprecated/` via `/tdk-memory-update --deprecate` |

Change type is **always auto-derived from git status** — never ask the user to classify.

---

## Multi-File Grouping Rules

When multiple files are staged, group by git status and ask **one description per group**:

```
Group: M (modified) — 4 files
  → Ask: "4 modified files — describe these changes:"
  → One description covers all 4 modified files in CHANGELOG

Group: A (added) — 2 files
  → Ask: "2 added files — describe what was added:"

Group: D (deprecated) — 1 file
  → Ask: "1 deprecated file — describe why deprecated:"
```

Each file still gets its own `### {path}` subsection in the entry.
The group description is used as `Description` for all files in that group.

---

## Single-File Entry (still uses subsection format)

Even when only one file is staged, use the `### {path}` subsection for consistency:

```markdown
## 2026-03-05 — Update login screen field definitions

**Changed by**: tdk-memory-update
**Files affected**: screens/auth/login.md

### screens/auth/login.md
**Change type**: modified
**Description**: Added `remember_me` boolean field; updated validation rule for email max length.
**Verified**: a3f2c1d4e5b6...
```

---

## CHANGELOG.md File Structure

```markdown
# Memory Changelog

_Managed by /tdk-memory-changelog. Do not edit manually._

<!-- entries added above this line -->

## 2026-03-05 — Update login screen field definitions   ← newest entry first

**Changed by**: manual edit
...

## 2026-03-04 — Initial memory setup                   ← older entries below

...
```

Always **prepend** new entries (newest at top). Do not sort or reorder existing entries.

---

## SHA256 Source Rules

| Change type | Hash source |
|-------------|-------------|
| `added` | Working-tree file at its current path |
| `modified` | Working-tree file at its current path |
| `deprecated` | Working-tree file at `_deprecated/{rel-path}` (already moved) |

Use `compute-sha256-hashes.py` shared utility for all hashes.
Never compute SHA256 inline in SKILL.md — always use the script.
