# Re-run Flow (Adding Domains)

Triggered when user selects "Add more domains" at Step 2 guard detection.

---

## Step 1: Ask for Source Files for New Domains

**AskUserQuestion** (multiline text input):
- Question: "Current domains: [{existing-list}]. Point me to a file describing additional business domains to add (one path per line, leave blank to cancel)"
- Header: "Add Domains - Source Files"
- Note: "Reads the file and suggests new domains not already in memory."

If blank: report "No new domains added." and exit.

Follow the full **Domain Extraction & Confirmation** flow in `references/domain-extraction-and-confirmation.md`, with one addition:
- **Filter out** domains that already exist in `domains/` before presenting candidates

---

## Step 2: Create New Domain Folders Only

For each NEW domain (not in existing list):
- Create `domains/{domain}/` directory only

Never create empty `flows/` or other optional typed folders during re-run.
Never touch existing domain folders.

---

## Step 3: Write domain-overview.md for New Domains

For each NEW domain:
- Write `domains/{domain}/domain-overview.md` using same template in `references/domain-overview-template.md`
- Never touch existing domain-overview.md files

---

## Step 4: Regenerate memory-index.md (full)

Rebuild `memory-index.md` from current FS state using template in `references/memory-index-template.md`:
- Scan `domains/` — include all existing + new domains in Domain Map
- Include all existing files in "Files by Domain" sections
- For NEW domains: list `domain-overview.md` row (not placeholder)
- For existing domains: scan filesystem to list actual files
- Preserve Routing Rules table (static)

**Domain Map scope column:**
- For NEW domains: use `{scope-summary-from-step-1}` = concise 1-line summary from evidence snippets collected during Step 1 extraction. Fallback to `_(fill in scope)_` if no clear scope identified.
- For EXISTING domains: read scope from the existing `domains/{domain}/domain-overview.md` (first paragraph or Scope field). Fallback to `_(fill in scope)_` if unreadable.

---

## Step 5: Update memory.yaml

- Add SHA256 entries for newly created `domain-overview.md` files (one per new domain)
- Preserve existing file checksums (do not recompute existing files)
- Recompute `memory_index_sha256` from regenerated memory-index.md

---

## Step 6: Report

```
Domains added: {new-list}
   Existing domains preserved: {existing-list}
   New folders created: {N}
   Files created: {N} domain-overview.md files (1 per new domain)
   memory-index.md: regenerated ({total} domains total)
   memory.yaml: updated ({N} new entries)
```
