# Domain Source Extraction Flow (Step 1.5)

Applies to updates targeting domain-level files only:
- `domains/{domain}/services.md`
- `domains/{domain}/business-rules.md`
- `domains/{domain}/flows/{name}-flow.md`

Does NOT apply to: data-model, screen, screen-flow, shared-flow. Skip for those content types.

**Trigger:** `RESOLVED_TARGET_PATH` (emitted by Step 1) starts with `domains/{domain}/` pattern.
Step 1 MUST emit this variable before Step 1.5 reads it — never re-derive independently.

---

## 1. Ask for Source File

**AskUserQuestion** (multiline text input):
- Question: "Point me to a domain description file OR a compact spec file from tdk-core (one path per line, leave blank to skip)"
- Header: "Domain Source Files"
- Placeholder: `docs/domain-overview.md\n.specify/memory/overview.md`
- Note: "File format is free-style. AI will read and extract domain context."

---

## 2. File Validation

Apply shared guards from `../tdk-memory-init/references/domain-extraction-and-confirmation.md`:
- **Path Restriction Guard**: reject `..`, absolute paths outside project, sensitive patterns
- **File Size Check**: >50KB → warn, ask for smaller file
- **Abnormal File Handling**: not found, binary, non-English — same rules

---

## 3. Extract and Confirm Domain

1. Read provided file(s), extract business domain name(s) and scope
2. Flag technical-layer names using shared exclusion list: `infra`, `utils`, `common`, `shared`, `base`, `core`, `helpers`
   - Only flag if name does NOT appear as business concept in source file
   - Warn-but-allow; user owns the decision
3. Present with evidence: `{domain} — from {file}: '{snippet}'`
4. AskUserQuestion for confirmation; parse final list if user adjusts

---

## 4. Domain Mismatch Check

If extracted domain differs from Step 1 routing result:
- Raise: "Extraction suggests domain '{X}' but routing determined domain '{Y}'. Which is correct?"
- User resolves; proceed with chosen domain

---

## 5. No File Provided

Continue to Step 2 (Read template); rely on routing from Step 1.

---

## 6. Recovery (extraction fails after file read)

Context overflow, tool error, etc.:
- Inform user: "Domain extraction failed — proceeding with routing context only."
- Treat as "no file provided": continue using Step 1 routing result.
- Do NOT re-attempt file read.
