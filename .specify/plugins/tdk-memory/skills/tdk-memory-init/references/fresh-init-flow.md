# Fresh Init Flow (Steps 3–8)

Detailed steps for fresh memory initialization. Steps 1–2 are in SKILL.md.

---

## Step 3: Ask for Source Files

**AskUserQuestion** (multiline text input):
- Question: "Point me to a domain description file OR a compact spec file from tdk-core (one path per line, leave blank to skip)"
- Header: "Domain Source Files"

Follow the full **Domain Extraction & Confirmation** flow in `references/domain-extraction-and-confirmation.md`.

---

## Step 4: Create Folder Scaffold

Create the following structure under `{memory.path}`:

```
.specify/memory/
├── data-model/
├── domains/
│   └── {domain}/          <- one per domain from Step 3
│       └── flows/         <- empty directory
├── screens/
├── screen-flows/
├── shared-flows/
├── _deprecated/
├── CHANGELOG.md
└── memory-index.md
```

Skip creating directories/files that already exist (idempotent).

**FORCE_REINIT only:** Before creating new structure, delete each `domains/{name}/` subdirectory listed in Step 2 wipe confirmation.

---

## Step 5: Write domain-overview.md per Domain

For each confirmed domain:

**Idempotency check:** If `domains/{domain}/domain-overview.md` already exists: skip (do not overwrite).
**FORCE_REINIT only:** Overwrite existing `domain-overview.md`.

Write `domains/{domain}/domain-overview.md` using template in `references/domain-overview-template.md`.

**Content rules:**
- Use ONLY content extracted in Step 3 — do NOT infer or add new information
- Format evidence snippet as readable prose (clean up raw extraction artifacts)
- `{Domain}` = title-case domain name; `{domain}` = kebab-case folder name
- Source reference: file path if file-based extraction, `"text description"` if fallback mode

**Step 5.1 — Enrich domain-overview.md with Obsidian frontmatter:**

Activate the `obsidian-brain` skill (Writer Mode) to load Obsidian Flavored Markdown syntax reference before applying enrichment.

After writing each `domains/{domain}/domain-overview.md`:

**Idempotency guard:** Check if `aliases:` already present in frontmatter → SKIP if yes.

The template in `references/domain-overview-template.md` already includes full Obsidian frontmatter with `aliases:`, `type:`, `domain:`, `tags:`, `created_at:`, `updated_by:`. Ensure all `{domain-slug}` and `{YYYY-MM-DD}` placeholders are replaced with actual values during file write.

**Add wikilinks** in the first readable section after frontmatter (only if sibling file EXISTS in `.specify/memory/`):
- `[[services|Services]]` — if `domains/{domain}/services.md` exists
- `[[business-rules|Business Rules]]` — if `domains/{domain}/business-rules.md` exists

Rule: only add wikilink if target file is confirmed to exist on disk. Skip if absent.

---

## Step 6: Generate memory-index.md

Create `memory-index.md` using template in `references/memory-index-template.md`.

Replace `{domain-rows}` with one table row per domain using wikilink format:
`| {domain} | [[domains/{domain}/domain-overview\|{domain}/]] | {scope-summary-from-step-3} |`

Where `{scope-summary-from-step-3}` = concise 1-line summary derived from the evidence snippets collected during Step 3 domain extraction.
If no clear scope was identified for a domain, fallback to `_(fill in scope)_`.

Replace `{per-domain-sections}` with per-domain subsections:
```markdown
### {Domain}

| File | Title | Updated |
|------|-------|---------|
| domains/{domain}/domain-overview.md | {Domain} — Overview | {init datetime} |
```

---

## Step 6.5: Create memory-map.canvas

Activate the `obsidian-brain` skill (Canvas Mode) to load JSON Canvas spec before creating the `.canvas` file.

Create `{memory.path}/memory-map.canvas` with a visual domain map.

**Canvas JSON structure:**
- Central `text` node: id `"memory-index"`, text `"Memory Index"`, position `(0, 0)`, width `250`, height `60`, color `"1"` (red)
- One `file` node per domain: file path `"domains/{domain}/domain-overview.md"`, color `"3"` (green), width `250`, height `60`
  - Position radially: `x = round(400 * cos(2π * index / N))`, `y = round(400 * sin(2π * index / N))` where N = total domain count
- One edge per domain: from `"memory-index"` → domain node id

**Canvas file format:**
```json
{
  "nodes": [
    {"id": "memory-index", "type": "text", "text": "Memory Index", "x": 0, "y": 0, "width": 250, "height": 60, "color": "1"},
    {"id": "{domain}", "type": "file", "file": "domains/{domain}/domain-overview.md", "x": {x}, "y": {y}, "width": 250, "height": 60, "color": "3"}
  ],
  "edges": [
    {"id": "edge-{domain}", "fromNode": "memory-index", "toNode": "{domain}"}
  ]
}
```

**Idempotency:** If `memory-map.canvas` already exists → regenerate (full overwrite).

After creating canvas file: add entry to `memory.yaml` manifest (see Step 7).

---

## Step 7: Compute SHA256 + Write memory.yaml

Compute SHA256 of `memory-index.md`:

```bash
$VENV_PY "${CLAUDE_PLUGIN_ROOT}/scripts/compute-sha256-hashes.py" \
  "$(pwd)/.specify/memory/" "memory-index.md"
```

For each domain, compute SHA256 of `domains/{domain}/domain-overview.md`:

```bash
$VENV_PY "${CLAUDE_PLUGIN_ROOT}/scripts/compute-sha256-hashes.py" \
  "$(pwd)/.specify/memory/" "domains/{domain}/domain-overview.md"
```

Compute SHA256 of `memory-map.canvas`:

```bash
$VENV_PY "${CLAUDE_PLUGIN_ROOT}/scripts/compute-sha256-hashes.py" \
  "$(pwd)/.specify/memory/" "memory-map.canvas"
```

Write `memory.yaml`:
```yaml
version: "2"
generated_at: "{ISO datetime}"
memory_index_sha256: "{64-char hex}"
files:
  - path: "domains/{domain}/domain-overview.md"
    sha256: "{64-char hex}"
    updated_at: "{ISO datetime}"
    updated_by: "tdk-memory-init"
  - path: "memory-map.canvas"
    sha256: "{64-char hex}"
    updated_at: "{ISO datetime}"
    updated_by: "tdk-memory-init"
```
One `files` entry per domain, plus one entry for `memory-map.canvas`.

---

## Step 8: Report Summary

```
Memory v2 initialized at .specify/memory/

   Domains: {N} ({comma-separated list}) — extracted via {file-based | text description}
   Files created: {N} domain-overview.md files (1 per domain)
   SHA256 manifest: memory.yaml (memory_index_sha256 + {N} domain-overview.md + memory-map.canvas checksums recorded)
   memory-index.md: generated with routing rules + domain map (wikilinks)
   memory-map.canvas: created ({N} domain nodes)
   Obsidian: frontmatter ✓ | aliases ✓ | wikilinks ✓ | tags ✓ | canvas ✓

Next: run /tdk-memory-update to add content, /tdk-memory-checksum to validate.
```
