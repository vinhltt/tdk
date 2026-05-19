# Regenerate memory-index.md Flow (Step 5)

Shared logic for rebuilding `memory-index.md` from filesystem state.

---

## Edit Detection (before regeneration)

1. Read `memory_index_sha256` from `memory.yaml`
2. Compute SHA256 of current `memory-index.md` on disk
3. If mismatch: WARN "memory-index.md was manually edited. Regenerating will overwrite manual changes." (warn-but-proceed)

---

## Regeneration Logic

1. Scan `.specify/memory/` recursively for all `.md` files
2. Exclude: `memory-index.md`, `CHANGELOG.md`
3. Categorize by path prefix:
   - `data-model/` → `## Data Model` table
   - `domains/{domain}/` → `## Files by Domain` → `### {Domain}` subsection
   - `screens/` → `## Screens` table
   - `screen-flows/` → `## Screen Flows` table
   - `shared-flows/` → `## Shared Flows` table
   - `_deprecated/` → `## Deprecated` table
4. Extract `title` + `updated_at` from YAML frontmatter per file; fallback to filename stem
5. Rebuild `## Domain Map` from actual `domains/` subdirectories
6. Preserve `## Routing Rules` table (static — do not regenerate from FS)
7. Preserve `## Templates` section (static)
8. Write full `memory-index.md` (atomic overwrite)
