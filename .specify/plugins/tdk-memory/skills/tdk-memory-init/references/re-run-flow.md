# Re-run Flow (Adding Domains)

Triggered when user selects "Add more domains" at Step 2 guard detection.
Preconfirmed domain mode enters it directly, without that choice (next section).

---

## Preconfirmed domain mode

Entered from `references/fresh-init-flow.md` ("Dispatch: preconfirmed domain mode")
when the `resolve` JSON of Step 1 reports `status: ready`. The detection rule, path
check, redaction, present rule, no-write rule, external-root consent and Result
lines are the ones defined there. No `AskUserQuestion` anywhere in this mode except
that external-root write consent. Differences from the steps below:

1. **Step 1 skipped:** the new domains are the block domains that are not present
   and passed the path check and redaction. A present block domain ends with
   `Result: already present <domain>` and writes nothing for its overview; an
   unindexed one still gets its index row and section in Step 4, its canvas node
   and its Step 5 receipt.
2. **Step 3:** write each overview with the fresh path's Step 5 rules (Description
   from `evidence`, source reference from `sourceFiles`, `{provenance}` from the
   block).
3. **Step 4 only adds rows:** keep every existing line of `memory-index.md`
   byte-identical, including arc42, decision and other typed rows, except the
   `Binding coverage:` line. Append one Domain Map row per new or unindexed domain,
   with `{scope-summary-from-step-1}` as the first sentence of `evidence` (for an
   unindexed domain, of its overview's Description paragraph) cut to 120
   characters, with `|` escaped as `\|`, and one `### {Domain}` section with its
   `domain-overview.md` row at the end of `## Files by Domain`. Recount both
   `Binding coverage:` numbers from the filesystem with the exclusions of Step 4.
   Before the first write after Step 1, check that `memory-index.md` has both
   `## Domain Map` and `## Files by Domain`; otherwise end with
   `Result: error: memory-index-sections-missing` and write nothing.
4. **Canvas:** after Step 4, regenerate `memory-map.canvas` with the fresh path's
   Step 6.5 from every domain under `domains/` that has a `domain-overview.md`, so a
   root that never had a canvas gets one and an existing canvas gains the new domain
   nodes. The node order (`index` in Step 6.5) is the Domain Map order of the updated
   `memory-index.md`.
5. **Step 5** runs as written, for the new and unindexed overviews, and also
   records the regenerated `memory-map.canvas` receipt. **Step 6** reports
   `memory-index.md: {N} rows added` instead of `regenerated`, where `{N}` is the
   number of rows added, and
   `memory.yaml: updated ({N} new entries, memory-map.canvas receipt recorded)`.
   `{existing-list}` is the domains under `domains/` before this run. Then print
   the Result lines.
6. **No domain left to write:** when every block domain is listed by the `resolve`
   JSON or has an error, skip Steps 2–5 and the canvas, as the no-write rule says:
   no write, no index change and no `memory.yaml` change.

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
- Exclude `_templates/**`, `_deprecated/**`, `.obsidian/**`, and `.trash/**` from active
  tables and coverage
- Preserve Routing Rules table (static)

**Domain Map scope column:**
- For NEW domains: use `{scope-summary-from-step-1}` = concise 1-line summary from evidence snippets collected during Step 1 extraction. Fallback to `_(fill in scope)_` if no clear scope identified.
- For EXISTING domains: read scope from the existing `domains/{domain}/domain-overview.md` (first paragraph or Scope field). Fallback to `_(fill in scope)_` if unreadable.

---

## Step 5: Update memory.yaml

- Add SHA256 entries for newly created `domain-overview.md` files (one per new domain)
- Preserve existing file checksums (do not recompute existing files)
- Recompute `memory_index_sha256` from regenerated memory-index.md with the `hash`
  command, never by hand
- Preserve `templates[]` and unrelated metadata; use the shipped Node hash command
  from the shared contract (forwarding `--allow-external-root` when permission was
  granted), then validate a temporary candidate before publishing

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
