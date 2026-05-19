# Section Anchor Update Strategy: Additive vs Replacement

Reference for `/tdk-memory-update`. Defines how to locate and modify sections
in memory files using HTML comment anchors.

---

## Anchor Format

Every memory section uses paired HTML comment anchors:

```markdown
<!-- section: fields -->
## Fields

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| id    | uuid | Yes      | Primary key |

<!-- /section: fields -->
```

**Rule:** Content between anchors is the section body. Everything outside anchors is untouched.

---

## Strategy Decision Tree

```
Change request received
        │
        ▼
Is this a new row/item in an existing table or list?
   YES → Additive (append inside section, keep existing rows)
   NO  → Does the entire section need rewriting?
           YES → Replacement (rewrite between anchors)
           NO  → Additive (append new content block)
```

### Use Additive when:
- Adding a new table row (entity, field, service, rule)
- Appending a new list item
- Adding a new subsection at end of existing section

### Use Replacement when:
- Correcting wrong data in a cell
- Restructuring the entire section layout
- Renaming or removing an existing entry

---

## Additive: Step-by-Step

1. Locate `<!-- section: {name} -->` in file
2. Find the matching `<!-- /section: {name} -->` (REQUIRED — see safety rule below)
3. Insert new content **before** the closing tag, after last existing content

**Example — add new entity row:**
```markdown
<!-- section: entities -->
## Entities

| Entity | Description | Key Fields |
|--------|-------------|------------|
| User   | Platform user | id, email  |
| Job    | Job posting  | id, title  |   ← new row appended here

<!-- /section: entities -->
```

---

## Replacement: Step-by-Step

1. Locate `<!-- section: {name} -->` in file
2. **SAFETY CHECK:** Verify `<!-- /section: {name} -->` exists. If missing → STOP with error.
3. Capture all content between the two anchor tags
4. Replace with new content
5. Keep both anchor tags in place — only replace content between them

**Example — replace patterns section:**
```markdown
<!-- section: patterns -->
## Patterns & Conventions

- Repository pattern: Controller → Service → Repository → Model
- All services extend BaseService
- FormRequest for all input validation

<!-- /section: patterns -->
```

---

## Safety Rule: Missing Closing Tag

**CRITICAL:** Before any replacement operation:

```
If file does NOT contain <!-- /section: {name} --> :
  → STOP immediately
  → Report: "Section '{name}' has no closing tag. File may be corrupted.
             Repair manually before updating."
  → Do NOT proceed with replacement (would erase content to EOF)
```

This is non-negotiable. A missing closing tag means the file was corrupted
(manual edit broke the anchor structure).

---

## Edge Cases

| Situation | Action |
|-----------|--------|
| Section anchor missing entirely | Create new section at end of file with both anchors |
| Nested sections (outer + inner) | Operate on outer anchor only; preserve inner anchors |
| Section exists but is empty | Additive: insert first row; Replacement: still safe to use |
| New screen file needed | Create from template → fill all 4 required sections |
| File doesn't exist yet | Create file from template first, then apply update |

---

## New Screen File Walkthrough

When `--screen auth/login` is given and `screens/auth/login.md` does not exist:

1. Create directory: `.specify/memory/screens/auth/`
2. Copy screen template from `tdk-memory-init/references/` templates
3. Replace `{Screen Name}` with "Login", set `updated_at` to today
4. Apply the user's change to the appropriate section(s)
5. Add entry to `memory.yaml`, rebuild `memory-index.md`

The screen template provides all 4 required anchors:
`route`, `fields`, `business-rules`, `edge-cases`
