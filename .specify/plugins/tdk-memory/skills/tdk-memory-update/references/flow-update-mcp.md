# Update Flow — MCP Available

> Used when `MCP_AVAILABLE = true`. All paths are vault-relative (no `.specify/`
> prefix). Follow `../_shared/obsidian-mcp-action-contract.md`.

## Step 0.5: Confirm write action availability

Before changing memory, confirm the active Obsidian MCP exposes writable actions:

- `vault(action="create")` or `vault(action="update")` for whole-file writes.
- `edit(action="patch")` for targeted heading, block, or frontmatter edits.

If write actions are hidden, unavailable, or read-only, ask the user:

- **Continue with file tools** -> set `MCP_AVAILABLE=false` and follow `references/flow-update-normal.md`.
- **Fix MCP first** -> STOP without editing `.specify/memory/`.

Do not silently fall back to file edits after an MCP write failure.

## Step 1: Guard checks + Read memory-index.md

1. `vault(action="list", directory="memory", pageSize=25)` — verify results contain:
   - `memory/memory-index.md`
   - `memory/memory.yaml`
   - Either missing -> STOP: "Run /tdk-memory-init first."

2. `vault(action="read", path="memory/memory-index.md", raw=true)` — parse:
   - Extract `## Routing Rules` table: content type -> target pattern + template mapping
   - Extract `## Domain Map` table: valid domain names + folder paths

## Step 2: Natural language routing

Read user request from `$ARGUMENTS`. Match against Routing Rules table:

| Request describes... | Route to... | Template |
|---|---|---|
| Capability or bounded context capability | `capabilities/{capability-name}.md` | `capabilities-template.md.tpl` |
| Stakeholder, actor, role, permission profile | `stakeholders-and-roles/{role-name}.md` | `stakeholders-and-roles-template.md.tpl` |
| Glossary term or ubiquitous language | `glossary/{term}.md` | `glossary-template.md.tpl` |
| Entity, table, model, database schema | `data-model/{table-name}.md` | `data-model-template.md.tpl` |
| Service method, API endpoint, controller action | `domains/{domain}/services.md` | `services-template.md.tpl` |
| Business rule, validation, constraint, policy | `domains/{domain}/business-rules.md` | `business-rules-template.md.tpl` |
| Screen, page, UI component, view | `screens/{module}/{name}.md` | `screen-template.md.tpl` |
| Multi-screen user journey or flow | `screen-flows/{flow-name}.md` | `screen-flow-template.md.tpl` |
| Complex multi-step flow within domain | `domains/{domain}/flows/{name}-flow.md` | `flow-template.md.tpl` |
| Cross-domain or shared flow | `shared-flows/{flow-name}.md` | `flow-template.md.tpl` |
| Integration, API contract, event, webhook | `integrations/{integration-name}.md` | `integration-contract-template.md.tpl` |
| Security, privacy, compliance policy | `quality-requirements/{policy-name}.md` | `quality-requirement-template.md.tpl` |
| Operations runbook, deployment procedure | `operations/{runbook-name}-runbook.md` | `operations-runbook-template.md.tpl` |
| Quality attribute, NFR, SLA | `quality-requirements/{quality-attribute}.md` | `quality-requirement-template.md.tpl` |
| Architecture decision, ADR | `decisions/{decision-id}.md` | `decision-record-template.md.tpl` |
| Risk, technical debt, assumption | `risks-and-debt/{risk-or-debt-id}.md` | `risk-debt-template.md.tpl` |
| Report, dashboard, export | `reports/{report-name}.md` | `report-spec-template.md.tpl` |
| Decision table | `decision-tables/{decision-table-name}.md` | `decision-table-template.md.tpl` |
| State machine, lifecycle | `state-machines/{state-machine-name}.md` | `state-machine-template.md.tpl` |

Normalize aliases from `memory-index.md` before route selection:
`schema`, `api`, `screen`, `flow`, `integration`, `policy`, `nfr`, `adr`,
`debt`, `report`, and `runbook`.

**If ambiguous:** AskUserQuestion to clarify content type and/or domain.

**Emit routing result:** `RESOLVED_TARGET_PATH = {full determined target path}`

## Step 2.5: Domain source extraction (domain-level updates only)

Follow `references/domain-source-extraction-flow.md`.

## Step 3: Read template

`vault(action="read", path="templates/memory/{type}-template.md.tpl", raw=true)`

If missing: STOP "Template not found. Re-run /tdk-memory-init to restore templates."

## Step 4: Domain validation

**For domain-required content** (service, business rule, domain flow, decision table, state machine, domain-scoped capability):
- Check domain exists in Domain Map table
- If NOT found: STOP "Unknown domain: {name}. Valid: [{list}]. To add, re-run /tdk-memory-init."

**For domain-agnostic content** (data-model, screen, screen-flow, shared-flow,
integration, operations, quality-requirement, decision-record, risk-debt,
report-spec, stakeholder-role, glossary-term): skip.

## Step 4.5: Merge vs Replace (domain-level updates only)

**Applies to:** same criteria as Step 2.5. Skip for other content types.

**Trigger:** `RESOLVED_TARGET_PATH` is domain-level AND target file already exists.
Check existence with `vault(action="list", directory="{parent-directory}", pageSize=100)`.
If target does NOT exist: skip (Step 5 creates from template).

1. **AskUserQuestion**:
   - "Is this a new feature extending the domain, or replacing existing logic?"
   - Options: A) Merge (additive) | B) Replace (overwrite affected entries)

2. **Merge:** proceed to Step 5 with additive strategy.

3. **Replace:** show entries to be removed, confirm via AskUserQuestion.
   - If declined: re-ask merge vs replace.
   - If confirmed: proceed with replacement strategy.

## Step 5: Apply update via action contract

**New file:**

`vault(action="create", path="{vault-relative-path}", content="{content}")` — create from template, replace placeholders (`{domain}`, `{Domain}`, `{module}`, `{YYYY-MM-DD}`), fill sections. Then proceed to Step 5.1.

**Whole-file rewrite when target exists and replacement owns the full file:**

`vault(action="update", path="{vault-relative-path}", content="{content}")`

**Existing file — use MCP patch actions:**

*Additive — append entry to a section:*
```
edit(action="patch", path="{vault-relative-path}", targetType="heading", target="{Section Heading Name}", operation="append", content="\n- {new entry content}")
```

*Replacement — replace entire section content:*
```
edit(action="patch", path="{vault-relative-path}", targetType="heading", target="{Section Heading Name}", operation="replace", content="{new section content}")
```

*Nested heading (use `::` as delimiter when supported by schema):*
```
edit(action="patch", path="{vault-relative-path}", targetType="heading", target="Parent Heading::Child Heading", targetDelimiter="::", operation="append", content="\n- {new entry}")
```

*Frontmatter field update:*
```
edit(action="patch", path="{vault-relative-path}", targetType="frontmatter", target="updated_at", content="{today ISO date}")
```

*When file has Obsidian block IDs (`^block-id`) — prefer block targeting:*
```
edit(action="patch", path="{vault-relative-path}", targetType="block", target="{file-slug}-{section-name}", operation="append", content="\n- {new entry}")
```

Then proceed to Step 5.2.

If any write action fails because the server is read-only or the action is
missing, STOP and ask before falling back to file tools.

## Step 5.1 — Enrich newly created file (new file path only)

Use the Obsidian syntax rules below directly for enrichment. Do not activate a
separate Obsidian helper skill from this flow.

**Idempotency guard:** Check line 1 of file for `---`. If frontmatter with `aliases:` already present -> SKIP enrichment steps below entirely.

**A. Verify frontmatter** — templates already include Obsidian frontmatter. Ensure these placeholders are resolved:
- `{YYYY-MM-DD}` -> today's date (ISO date)
- `{table-name}` -> snake_case of table name
- `{domain-slug}` -> kebab-case of domain name
- `updated_by` -> `"tdk-memory-update"`

**B. Add wikilinks** based on content type (append to first readable section after frontmatter):

| Content Type | Wikilinks to add (only if target file EXISTS in vault) |
|---|---|
| `data-model/*.md` | `[[domains/{owning-domain}/services\|Related Services]]` — if domain identifiable and file exists |
| `domains/{d}/services.md` | `[[domain-overview\|Domain Overview]]`, `[[business-rules\|Business Rules]]` |
| `domains/{d}/business-rules.md` | `[[domain-overview\|Domain Overview]]`, `[[services\|Services]]` |
| `screens/{m}/{n}.md` | `[[screen-flows/{n}-flow\|User Flow]]` — only if flow file exists |
| `*-flow.md` | Links to screens mentioned in flow content — only if screen files exist |
| `integrations/*.md` | `[[domains/{domain}/services\|Related Services]]` if domain identifiable and file exists |
| `operations/*.md` | Links to related integrations and risks when files exist |
| `quality-requirements/*.md` | Links to related decisions and risks when files exist |
| `decisions/*.md` | Links to affected quality requirements, risks, and arc42 summaries when files exist |
| `risks-and-debt/*.md` | Links to mitigating decisions, runbooks, and quality requirements when files exist |
| `reports/*.md` | Links to source data models and quality requirements when files exist |
| `decision-tables/*.md` | Links to business rules when files exist |
| `state-machines/*.md` | Links to related runtime flows when files exist |

Rule: check file existence via `vault(action="list", directory="{parent-directory}", pageSize=100)` before inserting any wikilink. Skip wikilink if target absent.

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
- Derive `{file-slug}` from file path: `data-model/users.md` -> `users`; `domains/auth/services.md` -> `auth-services`
- Rule: only add block ID if section has non-empty content. Empty sections -> skip.
- These block IDs enable block-targeted patching in future updates.

## Step 5.2 — Preserve wikilinks on existing file update

When applying additive or replacement strategy to existing file:
- Do NOT remove lines containing `[[` wikilink syntax
- Do NOT remove or overwrite frontmatter block (`---` ... `---` at top of file)
- If adding content that references a new entity, append wikilink to Related section if present

## Step 6: Regenerate memory-index.md

1. `vault(action="list", directory="memory/domains", pageSize=100)` -> get domain folders.
2. For each domain: `vault(action="list", directory="memory/domains/{domain}", pageSize=100)` -> get files per domain.
3. `vault(action="list", directory="memory/data-model", pageSize=100)` and `vault(action="list", directory="memory/screens", pageSize=100)` -> list other content.
4. Build index content from listing results.
5. `vault(action="update", path="memory/memory-index.md", content="{rebuilt-index-content}")` — atomic overwrite with rebuilt index.

## Step 7: Update memory.yaml + report

1. Recompute SHA256:
```bash
$VENV_PY "${CLAUDE_PLUGIN_ROOT}/scripts/compute-sha256-hashes.py" \
  "$(pwd)/.specify/memory/" "{relative-file-path}"
```

2. Update `memory.yaml`: `sha256`, `updated_at`, `updated_by: "tdk-memory-update"`
3. Compute SHA256 of regenerated `memory-index.md` -> store as `memory_index_sha256`

Report:
```
Updated {target-file}
  Section: {section-name} ({strategy})
  Obsidian: {frontmatter OK | wikilinks added: N | block IDs added: N} (new file) | {wikilinks preserved} (existing file)
  memory-index.md: regenerated
  memory.yaml: checksums updated

Run /tdk-memory-changelog before committing.
```

Uses: Step 5.1 Obsidian syntax enrichment rules (new files only).
