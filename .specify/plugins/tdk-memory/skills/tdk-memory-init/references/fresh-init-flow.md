# Fresh Init Flow (Steps 3–8)

Detailed steps for fresh memory initialization. Steps 1–2 are in SKILL.md.

---

## Dispatch: preconfirmed domain mode

Detect this mode before Step 1, from `$ARGUMENTS` alone, so that every stop from
Step 1 on follows the rules below. Dispatch order: `--ensure-templates` stops first,
then this mode, then the interactive Steps 2–8. The mode is entered only when
`$ARGUMENTS` carries one or more complete domain blocks; it adds no flag and changes
no default.
Natural-language callers and manual use keep every confirmation. The block is NOT
the `===TDK-MEMORY-CONTROL===` header of `tdk-memory-agent`.

### Block

```text
===TDK-MEMORY-DOMAIN===
domain: sample-billing
provenance: inferred
sourceFiles:
- docs/sample/billing-overview.md
- src/billing/README.md
evidence: Billing issues invoices and tracks payment status for each order.
===END-DOMAIN===
```

- Lines inside a block are `key: value`; `sourceFiles:` is followed by
  `- <path>` lines. `evidence` is a single line.
- Required, each exactly once: `domain`, `provenance` (`inferred` or `confirmed`),
  `sourceFiles` (at least one path), `evidence` (non-blank).

### Detection rule (complete input)

After removing `--memory-root [path]` and `--allow-external-root`, the first
non-blank line of `$ARGUMENTS`, trimmed, is exactly `===TDK-MEMORY-DOMAIN===`. Do not scan
prose for the marker. The input is complete only if all hold:

1. every block opens with `===TDK-MEMORY-DOMAIN===` and closes with
   `===END-DOMAIN===`; only blank lines separate blocks and follow the last one;
2. in every block each required field is present once, with no unknown or
   duplicate key and no blank value other than the bare `sourceFiles:` line;
3. `domain` is already kebab-case (`^[a-z0-9]+(-[a-z0-9]+)*$`), so it never starts
   with `_`, holds no path separator and is not `.` or `..`; do not normalize an
   unsafe name into a different one;
4. no domain appears in two blocks;
5. `provenance` is exactly `inferred` or `confirmed`, and every non-blank line between
   the markers is `key: value` for one of the four keys, where `sourceFiles:` takes
   no inline value, or a `- <path>` line that follows `sourceFiles:` or another path
   line; no opening marker appears inside a block.

Anything else (a gap in any block, a malformed block, prose before or between
blocks) is NOT preconfirmed: ignore the block rules and run the interactive flow
exactly as written, treating `$ARGUMENTS` as the request.

### Choose the path from the root state

Decide from the `resolve` JSON of Step 1, which runs before any write. Never decide
from the files after Step 1: on a fresh root it creates an empty `memory-index.md`
and `memory.yaml`.

- `status: uninitialized`, or `error: root-missing` with a non-null `root` (a fresh
  root): run Steps 4–8 below for the block domains;
- `status: ready`: run `references/re-run-flow.md` ("Preconfirmed domain mode") for
  the block domains that are not present;
- any other `error`, including `memory-incomplete`: end with
  `Result: error: <error>` and write nothing.

A block domain is present when `domains/{domain}/domain-overview.md` exists or the
`resolve` JSON lists it in `domains` (names joined by `, `; `none` and `unknown`
list nothing). On either path it ends with `Result: already present <domain>` and
writes nothing for its overview. A present domain that the `resolve` JSON does not
list is unindexed, such as an overview an interrupted run left behind: its overview
stays byte-identical, but the index steps still list it (Steps 6, 6.5 and 7 on the
fresh path, the re-run steps on the re-run path). Check each block
in this order and stop at the first match: present, path check, redaction.

Run the path check and redaction below for every block before the first write after
Step 1. When no block domain is left to write or index (each is listed by the
`resolve` JSON or has an error), write nothing after Step 1: no overview, index, canvas or `memory.yaml` change.
Print the Result lines only.

### Behaviour on the fresh path

Run Steps 4, 5, 5.1, 6, 6.5, 7 and 8 unchanged except as listed, with no
`AskUserQuestion` anywhere in this mode except the external-root write consent
below:

1. **Steps 2 and 3 skipped:** no Domains exist guard and no force re-init; no Domain
   Source Files prompt, file read, confirmation, conflict or ambiguity question, and
   no technical-layer warning. `sourceFiles` are provenance only.
2. **Path check:** a `sourceFiles` entry containing `..`, an absolute path (starting
   with `/`, `\`, `~` or a drive letter such as `C:`), or a path matching a
   sensitive file pattern of the Path Restriction Guard in
   `references/domain-extraction-and-confirmation.md` gives that domain
   `error: <domain>: invalid path <path>`; the other domains continue.
3. **Redaction:** drop an `evidence` value that matches a pattern of the evidence
   snippet redaction in `references/domain-extraction-and-confirmation.md`. That
   domain then ends with `error: <domain>: evidence redacted` and writes nothing.
   Take only the pattern lists from that file; none of its Inform or Ask steps
   apply in this mode.
4. **Step 5:** "content extracted in Step 3" is the block's `evidence` and
   `sourceFiles`. The Description paragraph is `evidence` verbatim; the source
   reference is the `sourceFiles` list joined with `, `; `{provenance}` is the block
   value.
5. **Step 6:** `{scope-summary-from-step-3}` is the first sentence of `evidence`,
   cut to 120 characters, with `|` escaped as `\|`. Domain Map rows follow block
   order, and Step 6.5 uses the same order for `index`.
6. **Step 8:** report `extracted via preconfirmed block`.
7. **Errors:** a preflight, script, template, write or checksum failure ends with
   `error: <reason>` and stops the skill. Do not prompt or retry; write nothing more
   and never delete files already written, but list them in the report. This
   result replaces the STOP-and-ask rule of the interactive flow.

Write consent for an external root is unchanged (contract section 2) and is the only
question this mode may ask: the session running this skill asks once before the
first write. When it cannot ask or the user declines, end with
`Result: error: external-root-consent-required — <memory.path as configured>` and
write nothing.

### Result

Print the usual Step 8 report for a write, then end the output with one line per
block domain, in block order:

```text
Result: written <domain> | Result: already present <domain> | Result: error: <domain>: <reason>
```

A failure that stops the whole run (script error, external-root consent) prints a
single `Result: error: <reason>` line instead.

---

## Step 3: Ask for Source Files

**AskUserQuestion** (multiline text input):
- Question: "Point me to a domain description file OR a compact spec file from tdk-core (one path per line, leave blank to skip)"
- Header: "Domain Source Files"

Follow the full **Domain Extraction & Confirmation** flow in `references/domain-extraction-and-confirmation.md`.

---

## Step 4: Create Root Control Plane

Create `<memoryRoot>` and root control files only:

```
<memoryRoot>/
├── README.md
├── CHANGELOG.md
├── memory-index.md
├── memory-map.canvas
└── memory.yaml
```

Skip creating directories/files that already exist (idempotent).
Do not create empty optional typed folders (`arc42/`, `data-model/`,
`integrations/`, `operations/`, `quality-requirements/`, `decisions/`,
`risks-and-debt/`, `reports/`, `screens/`, `screen-flows/`, `shared-flows/`,
`capabilities/`, `stakeholders-and-roles/`, `glossary/`, `decision-tables/`,
`state-machines/`, or `_deprecated/`). Those folders are lazy and are created
only when `tdk-memory-update` or `tdk-constitution` writes the first file.

Create `README.md` from `<memoryRoot>/_templates/memory-readme-template.md.tpl`.
Create `CHANGELOG.md` with a short initial entry if it is missing. Later steps
write `memory-index.md`, `memory-map.canvas`, and `memory.yaml`.

**FORCE_REINIT only:** Before creating new structure, delete each `domains/{name}/` subdirectory listed in Step 2 wipe confirmation.

---

## Step 5: Write domain-overview.md per Domain

For each confirmed domain:

**Idempotency check:** If `domains/{domain}/domain-overview.md` already exists: skip (do not overwrite).
**FORCE_REINIT only:** Overwrite existing `domain-overview.md`.

Create `domains/{domain}/` only when there is a confirmed domain. Do not create
`domains/{domain}/flows/` during init.

Write `domains/{domain}/domain-overview.md` using template in `references/domain-overview-template.md`.

**Content rules:**
- Use ONLY content extracted in Step 3 — do NOT infer or add new information
- Format evidence snippet as readable prose (clean up raw extraction artifacts)
- `{Domain}` = title-case domain name; `{domain}` = kebab-case folder name
- Source reference: file path if file-based extraction, `"text description"` if fallback mode

**Step 5.1 — Enrich domain-overview.md with Obsidian frontmatter:**

Read `references/obsidian-markdown.md` before applying enrichment; it is the packaged Obsidian Flavored Markdown syntax reference.

After writing each `domains/{domain}/domain-overview.md`:

**Idempotency guard:** Check if `aliases:` already present in frontmatter → SKIP if yes.

The template in `references/domain-overview-template.md` already includes full Obsidian frontmatter with `aliases:`, `type:`, `id:`, `status:`, `authority:`, `binding:`, `related:`, `domain:`, `tags:`, `created_at:`, `updated_by:`. Ensure all `{domain}`, `{domain-slug}`, and `{YYYY-MM-DD}` placeholders are replaced with actual values during file write.

**Add wikilinks** in the first readable section after frontmatter (only if sibling file EXISTS in `<memoryRoot>/`):
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

| File | Title | Updated | Binding |
|------|-------|---------|---------|
| domains/{domain}/domain-overview.md | {Domain} — Overview | {init datetime} | true |
```

Replace `{binding-true-count}` and `{typed-file-count}` in the `Binding coverage:`
line with counts computed from the files actually written during this init. Count
a file toward `{binding-true-count}` only when its frontmatter says `binding: true`;
`arc42/` read-models and files with no `binding:` field do not count. Exclude
`_templates/**`, `_deprecated/**`, `.obsidian/**`, and `.trash/**` from both coverage
counts. Do not
hard-code the line — a fresh init that writes `domain-overview.md` files already
has binding coverage, because `domain-overview-template.md` emits `binding: true`.

---

## Step 6.5: Create memory-map.canvas

Read `references/obsidian-json-canvas.md` before creating the `.canvas` file; it is the packaged JSON Canvas reference.

Create `<memoryRoot>/memory-map.canvas` with a visual domain map.

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
node -e 'if (Number(process.versions.node.split(".")[0]) < 18) process.exit(1)' &&
node "${CLAUDE_PLUGIN_ROOT}/skills/tdk-memory-checksum/scripts/memory-manifest.cjs" hash "<memoryRoot>" "memory-index.md" [--allow-external-root]
```

For each domain, compute SHA256 of `domains/{domain}/domain-overview.md`:

```bash
node -e 'if (Number(process.versions.node.split(".")[0]) < 18) process.exit(1)' &&
node "${CLAUDE_PLUGIN_ROOT}/skills/tdk-memory-checksum/scripts/memory-manifest.cjs" hash "<memoryRoot>" "domains/{domain}/domain-overview.md" [--allow-external-root]
```

Compute SHA256 of `memory-map.canvas`:

```bash
node -e 'if (Number(process.versions.node.split(".")[0]) < 18) process.exit(1)' &&
node "${CLAUDE_PLUGIN_ROOT}/skills/tdk-memory-checksum/scripts/memory-manifest.cjs" hash "<memoryRoot>" "memory-map.canvas" [--allow-external-root]
```

Hash `README.md` and `CHANGELOG.md` with the same command (replace the relative
path). Append `--allow-external-root` to each hash call only when the contract
granted external-root permission. Merge into `memory.yaml`, preserving `templates[]` from materialization
and all unrelated existing records. Validate a temporary YAML candidate before
atomic publication under the shared contract. The knowledge fields are:
Root `CHANGELOG.md` and `memory-map.canvas` are deliberately excluded from
automatic discovery for legacy compatibility. Add their explicit receipts here;
do not require them to appear in `missing_from_manifest` before publication.
Validate the candidate, not a guessed discrepancy/count pattern on the old manifest.
```yaml
version: "2"
generated_at: "{ISO datetime}"
memory_index_sha256: "{64-char hex}"
files:
  - path: "README.md"
    sha256: "{64-char hex}"
    updated_at: "{ISO datetime}"
    updated_by: "tdk-memory-init"
  - path: "CHANGELOG.md"
    sha256: "{64-char hex}"
    updated_at: "{ISO datetime}"
    updated_by: "tdk-memory-init"
  - path: "domains/{domain}/domain-overview.md"
    sha256: "{64-char hex}"
    updated_at: "{ISO datetime}"
    updated_by: "tdk-memory-init"
  - path: "memory-map.canvas"
    sha256: "{64-char hex}"
    updated_at: "{ISO datetime}"
    updated_by: "tdk-memory-init"
```
One `files` entry per root control file and per domain overview, plus one entry
for `memory-map.canvas`. Keep `memory_index_sha256` as the top-level checksum
for `memory-index.md`.

---

## Step 8: Report Summary

```
Memory v3 initialized at <memoryRoot>/

   Domains: {N} ({comma-separated list}) — extracted via {file-based | text description}
   Files created: root control files + {N} domain-overview.md files (1 per domain)
   Lazy folders: no empty optional typed folders created
   SHA256 manifest: memory.yaml (memory_index_sha256 + README.md + CHANGELOG.md + {N} domain-overview.md + memory-map.canvas checksums recorded)
   memory-index.md: generated with routing rules + domain map (wikilinks)
   memory-map.canvas: created ({N} domain nodes)
   Obsidian: frontmatter ✓ | aliases ✓ | wikilinks ✓ | tags ✓ | canvas ✓

Next: run /tdk-memory-update to add content, /tdk-memory-checksum to validate.
```
