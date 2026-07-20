# Domain Extraction & Confirmation (Shared Flow)

Shared by Fresh Init and Re-run flows. Covers file input, extraction, validation, and user confirmation.

---

## File Input

**AskUserQuestion** (multiline text input):
- Question: context-specific (set by caller flow)
- Header: context-specific
- Placeholder: `docs/domain-overview.md\ndocs/architecture.md`
- Note: "File format is free-style. Reads and extracts business domains. More detail = more accurate."

**Multiline parsing:**
- Split on newline
- Trim whitespace per line
- Skip blank lines
- Store list of file paths

**If user leaves input blank or all files skipped:** proceed to Fallback Mode (bottom of this doc).

---

## Path Restriction Guard (apply before reading any file)

- Reject paths containing `..` (directory traversal)
- Reject absolute paths outside current project working directory
- Reject paths matching sensitive file patterns: `.env`, `*.key`, `*.pem`, `id_rsa`, `*.credentials`
- If path fails guard: Inform user "Path not allowed (must be within project directory)." Ask for a different path.

## File Size Check (before reading, not after)

- Check file size on disk before reading. Threshold: **>50KB**
- If >50KB: Warn user, ask for a smaller/focused file or a different file. Do NOT attempt to read.

## Abnormal File Handling (per file)

- **File not found or unreadable:** Inform user, ask to provide another path or skip
- **Binary file detected:** Warn user, ask for text-based alternative
- **Non-English content:** Proceed but note: "Content is non-English. Domain accuracy may vary — review extracted list carefully."

---

## Extraction Phase

1. Read each file from input list
   - If reading fails: inform user, ask to re-provide or skip
   - If binary: warn, ask for text alternative

2. Extract domain candidates:
   - Read all provided file content
   - Identify business concept names

3. Technical layer detection via exclusion list (NOT semantic judgment):
   - Flag any name that **exactly matches**: `infra`, `utils`, `common`, `shared`, `base`, `core`, `helpers`
   - Any name NOT on this list passes automatically
   - Flag with: "looks like a technical layer, not a business domain"
   - Warn-but-allow; user owns final decision

4. Conflict detection (multi-file):
   - 2+ files suggest different domain sets: present conflict explicitly
   - "File A suggests: [x, y]. File B suggests: [y, z]. Which domains are correct?"
   - Do NOT merge silently; ask user to reconcile

5. Ambiguity detection (single-file):
   - If ambiguous: ask user to clarify: "File suggests possible domains: [candidates]. Which apply?"

---

## Confirmation Phase

**AskUserQuestion** (confirmation + adjustment):
- Present extracted domains with evidence snippets
- Format: `{domain} — from {file}: '{evidence snippet (1-2 sentences)}'`
- Include warning flags alongside domain names
- Allow user to confirm, adjust, or remove domains

**Evidence snippet redaction:** Before displaying, omit lines matching: API key patterns (`sk_live_`, `Bearer `, `apikey:`), connection strings (`mongodb://`, `postgres://`), or secret key names (`password:`, `secret:`, `private_key:`).

Parse final list: trim, lowercase, kebab-case.

---

## Guards

**Zero extraction:**
- 0 domains from file(s): "No business domains found. Try different file or switch to Fallback Mode."
- Ask: "(A) provide different file, or (B) describe business areas in text?"

**User confirms zero domains (max 2 retries then STOP):**
- **FORCE_REINIT mode:** "No domains provided. Existing domains remain intact (no deletion occurred). Run /tdk-memory-init and choose /tdk-memory-update instead."
- **Fresh Init mode:** "No domains provided. At least 1 required. Run /tdk-memory-init again when ready."

---

## Fallback Mode (no file provided)

**Trigger:** User left input blank or all files skipped/unreadable.

**AskUserQuestion** (text input):
- Question: "Describe the main business areas of this project in plain text (e.g., what does it do? who are the stakeholders? what are the core modules?)"
- Header: "Business Areas Description"

**Extraction + confirmation:** Same as file-based flow above, with different evidence format:
- Confirmation format: `{domain} — extracted from description: '{evidence snippet}'`
- Accuracy note: "Domains extracted from text description may need more review than file-based extraction. Verify carefully."
- Same guard logic (zero extraction, zero confirmation)
