# Update Flow — MCP Available

> Used when `MCP_AVAILABLE = true`. All paths are **vault-relative** (no `.specify/` prefix).
> Load any MCP tool schema via `ToolSearch("select:mcp__smart-obsidian__{tool_name}")` before first use.

## Step 1: Guard checks + Read memory-index.md

Load schema: `ToolSearch("select:mcp__smart-obsidian__list_vault_files")`

1. `mcp__smart-obsidian__list_vault_files("memory")` — verify results contain:
   - `memory/memory-index.md`
   - `memory/memory.yaml`
   - Either missing → STOP: "Run /tdk-memory-init first."

Load schema: `ToolSearch("select:mcp__smart-obsidian__get_vault_file")`

2. `mcp__smart-obsidian__get_vault_file("memory/memory-index.md", format="json")` — parse:
   - Extract `## Routing Rules` table: content type → target pattern + template mapping
   - Extract `## Domain Map` table: valid domain names + folder paths

---

## Step 2: Natural language routing

Read user request from `$ARGUMENTS`. Match against Routing Rules table:

| Request describes... | Route to... | Template |
|---|---|---|
| Entity, table, model, database schema | `data-model/{table-name}.md` | `data-model-template.md.tpl` |
| Service method, API endpoint, controller action | `domains/{domain}/services.md` | `services-template.md.tpl` |
| Business rule, validation, constraint, policy | `domains/{domain}/business-rules.md` | `business-rules-template.md.tpl` |
| Screen, page, UI component, view | `screens/{module}/{name}.md` | `screen-template.md.tpl` |
| Multi-screen user journey or flow | `screen-flows/{flow-name}.md` | `screen-flow-template.md.tpl` |
| Complex multi-step flow within domain | `domains/{domain}/flows/{name}-flow.md` | `flow-template.md.tpl` |
| Cross-domain or shared flow | `shared-flows/{flow-name}.md` | `flow-template.md.tpl` |

**If ambiguous:** AskUserQuestion to clarify content type and/or domain.

**Emit routing result:** `RESOLVED_TARGET_PATH = {full determined target path}`

---

## Step 2.5: Domain source extraction (domain-level updates only)

Follow `references/domain-source-extraction-flow.md`.

---

## Step 3: Read template

Load schema: `ToolSearch("select:mcp__smart-obsidian__get_vault_file")`

`mcp__smart-obsidian__get_vault_file("templates/memory/{type}-template.md.tpl", format="json")`

If missing: STOP "Template not found. Re-run /tdk-memory-init to restore templates."

---

## Step 4: Domain validation

**For domain-required content** (service, business rule, domain flow):
- Check domain exists in Domain Map table
- If NOT found: STOP "Unknown domain: {name}. Valid: [{list}]. To add, re-run /tdk-memory-init."

**For domain-agnostic content** (data-model, screen, screen-flow, shared-flow): skip.

---

## Step 4.5: Merge vs Replace (domain-level updates only)

**Applies to:** same criteria as Step 2.5. Skip for other content types.

**Trigger:** `RESOLVED_TARGET_PATH` is domain-level AND target file already exists.
If target does NOT exist: skip (Step 5 creates from template).

1. **AskUserQuestion**:
   - "Is this a new feature extending the domain, or replacing existing logic?"
   - Options: A) Merge (additive) | B) Replace (overwrite affected entries)

2. **Merge:** proceed to Step 5 with additive strategy.

3. **Replace:** show entries to be removed, confirm via AskUserQuestion.
   - If declined: re-ask merge vs replace.
   - If confirmed: proceed with replacement strategy.

---

## Step 5: Apply update via heading-based patch

**New file:**

Load schema: `ToolSearch("select:mcp__smart-obsidian__create_vault_file")`

`mcp__smart-obsidian__create_vault_file(filename, content)` — create from template, replace placeholders (`{domain}`, `{Domain}`, `{module}`, `{YYYY-MM-DD}`), fill sections. Then proceed to Step 5.1.

**Existing file** — use MCP patch tools:

Load schema: `ToolSearch("select:mcp__smart-obsidian__patch_vault_file")`

*Additive — append entry to a section:*
```
mcp__smart-obsidian__patch_vault_file(
  filename: "{vault-relative-path}",
  target: "{Section Heading Name}",
  content: "\n- {new entry content}",
  operation: "append"
)
```

*Replacement — replace entire section content:*
```
mcp__smart-obsidian__patch_vault_file(
  filename: "{vault-relative-path}",
  target: "{Section Heading Name}",
  content: "{new section content}",
  operation: "replace"
)
```

*Nested heading (use `::` as delimiter):*
```
mcp__smart-obsidian__patch_vault_file(
  filename: "{vault-relative-path}",
  target: "Parent Heading::Child Heading",
  targetDelimiter: "::",
  content: "\n- {new entry}",
  operation: "append"
)
```

*Frontmatter field update:*
```
mcp__smart-obsidian__patch_vault_file(
  filename: "{vault-relative-path}",
  target: "updated_at",
  content: "{today ISO date}",
  targetType: "frontmatter"
)
```

*When file has Obsidian block IDs (`^block-id`) — prefer block targeting:*
```
mcp__smart-obsidian__patch_vault_file(
  filename: "{vault-relative-path}",
  target: "{file-slug}-{section-name}",
  content: "\n- {new entry}",
  targetType: "block",
  operation: "append"
)
```

Then proceed to Step 5.2.

---

## Step 5.1 — Enrich newly created file (new file path only)

Activate the `obsidian-brain` skill (Writer Mode) to load Obsidian Flavored Markdown syntax reference before applying enrichment.

**Idempotency guard:** Check line 1 of file for `---`. If frontmatter with `aliases:` already present → SKIP enrichment steps below entirely.

**A. Verify frontmatter** — templates already include Obsidian frontmatter. Ensure these placeholders are resolved:
- `{YYYY-MM-DD}` → today's date (ISO date)
- `{table-name}` → snake_case of table name
- `{domain-slug}` → kebab-case of domain name
- `updated_by` → `"tdk-memory-update"`

**B. Add wikilinks** based on content type (append to first readable section after frontmatter):

| Content Type | Wikilinks to add (only if target file EXISTS in vault) |
|---|---|
| `data-model/*.md` | `[[domains/{owning-domain}/services\|Related Services]]` — if domain identifiable and file exists |
| `domains/{d}/services.md` | `[[domain-overview\|Domain Overview]]`, `[[business-rules\|Business Rules]]` |
| `domains/{d}/business-rules.md` | `[[domain-overview\|Domain Overview]]`, `[[services\|Services]]` |
| `screens/{m}/{n}.md` | `[[screen-flows/{n}-flow\|User Flow]]` — only if flow file exists |
| `*-flow.md` | Links to screens mentioned in flow content — only if screen files exist |

Rule: check file existence via `mcp__smart-obsidian__list_vault_files` before inserting any wikilink. Skip wikilink if target absent.

**C. Add callouts** for specific content types:

- `business-rules.md`: wrap critical constraints in:
  ```
  > [!warning] Constraint
  > {rule text}
  ```
- Deprecated entries: wrap in:
  ```
  > [!caution] Deprecated
  > {note}
  ```
- General important notes: wrap in:
  ```
  > [!note] Note
  > {text}
  ```

**D. Add Obsidian Block IDs** — Block IDs are the PRIMARY section targeting mechanism:

For each H2/H3 heading section with non-empty content, append a block ID on the last content line:

```markdown
## Validation Rules
Content here. ^{file-slug}-validation-rules
```

Block ID naming convention: `^{file-slug}-{section-name-kebab}`
- Derive `{file-slug}` from file path: `data-model/users.md` → `users`; `domains/auth/services.md` → `auth-services`
- Rule: only add block ID if section has non-empty content. Empty sections → skip.
- These block IDs enable block-targeted patching in future updates.

---

## Step 5.2 — Preserve wikilinks on existing file update

When applying additive or replacement strategy to existing file:
- Do NOT remove lines containing `[[` wikilink syntax
- Do NOT remove or overwrite frontmatter block (`---` ... `---` at top of file)
- If adding content that references a new entity, append wikilink to Related section if present

---

## Step 6: Regenerate memory-index.md

Load schema: `ToolSearch("select:mcp__smart-obsidian__list_vault_files")`

1. `mcp__smart-obsidian__list_vault_files("memory/domains")` → get domain folders
2. For each domain: `mcp__smart-obsidian__list_vault_files("memory/domains/{domain}")` → get files per domain
3. `mcp__smart-obsidian__list_vault_files("memory/data-model")`, `mcp__smart-obsidian__list_vault_files("memory/screens")` → list other content
4. Build index content from listing results

Load schema: `ToolSearch("select:mcp__smart-obsidian__create_vault_file")`

5. `mcp__smart-obsidian__create_vault_file("memory/memory-index.md", content)` — atomic overwrite with rebuilt index

---

## Step 7: Update memory.yaml + report

1. Recompute SHA256:
```bash
$VENV_PY "$(pwd)/.specify/plugins/tdk-memory/scripts/compute-sha256-hashes.py" \
  "$(pwd)/.specify/memory/" "{relative-file-path}"
```

2. Update `memory.yaml`: `sha256`, `updated_at`, `updated_by: "tdk-memory-update"`
3. Compute SHA256 of regenerated `memory-index.md` → store as `memory_index_sha256`

Report:
```
Updated {target-file}
  Section: {section-name} ({strategy})
  Obsidian: {frontmatter ✓ | wikilinks added: N | block IDs added: N} (new file) | {wikilinks preserved} (existing file)
  memory-index.md: regenerated
  memory.yaml: checksums updated

Run /tdk-memory-changelog before committing.
```

Uses: Step 5.1 obsidian-brain Writer Mode (new files only).
