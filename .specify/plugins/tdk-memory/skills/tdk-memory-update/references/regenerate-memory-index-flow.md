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
2. Exclude root control files: `README.md`, `memory-index.md`, `memory.yaml`,
   `memory-map.canvas`, `CHANGELOG.md`, `constitution.md`
3. Categorize by path prefix:
   - `data-model/` → `## Data Model` table
   - `domains/{domain}/` → `## Files by Domain` → `### {Domain}` subsection
   - `screens/` → `## Screens` table
   - `screen-flows/` → `## Screen Flows` table
   - `shared-flows/` → `## Shared Flows` table
   - `arc42/` → `## arc42 Summaries` table (`binding: false` read-model)
   - `integrations/` → `## Integrations` table
   - `operations/` → `## Operations` table
   - `quality-requirements/` → `## Quality Requirements` table
   - `decisions/` → `## Decisions` table
   - `risks-and-debt/` → `## Risks And Debt` table
   - `reports/` → `## Reports` table
   - `capabilities/` → `## Capabilities` table
   - `stakeholders-and-roles/` → `## Stakeholders And Roles` table
   - `glossary/` → `## Glossary` table
   - `decision-tables/` → `## Decision Tables` table
   - `state-machines/` → `## State Machines` table
   - `_deprecated/` → `## Deprecated` table
4. Extract `title`, `updated_at`, and `binding` from YAML frontmatter per file;
   fallback to filename stem. `arc42/` files must remain non-binding summaries
   unless linked typed files say `binding: true`. Write the extracted `binding`
   value into the `Binding` column of the file's table row. When the frontmatter
   has no `binding:` field, write `—` — do not infer a default. `## Deprecated`
   keeps its `| File | Deprecated At |` shape and gains no `Binding` column.
5. Rebuild `## Domain Map` from actual `domains/` subdirectories
6. Preserve `## Routing Rules` table (static — do not regenerate from FS)
7. Preserve `## Templates` section (static)
8. Recompute the `Binding coverage:` line: count files whose extracted `binding`
   is exactly `true`, over the total number of typed files indexed. `arc42/`
   read-models and files with a missing `binding:` field do not count toward the
   numerator. `## Deprecated` entries count toward neither.
9. Write full `memory-index.md` (atomic overwrite)
