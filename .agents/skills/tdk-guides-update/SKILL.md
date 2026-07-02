---
name: tdk-guides-update
description: "Review or update TDK source guide docs with the accepted Progressive Workflow Guide format using `projects/tdk/.specify/docs/en/guides/index.md` as the route-map source of truth. Use when editing or auditing TDK guides, restructuring guide IA, creating route maps or scenario pages, scanning routed subfiles, checking guide links, or validating docs after an agent updated TDK guides. Default to check-only unless the user explicitly asks to patch docs."
---

# tdk-guides-update

Maintain TDK source guide docs with a narrow English-first workflow. This skill owns guide IA, workflow-page format, local link checks, and review/update guardrails.

It does not own skill catalog sync. Use `tdk-skill-docs-sync` for marketplace skill-to-docs catalog updates.

## Scope

Allowed first-pass scope:

- `projects/tdk/.specify/docs/en/guides/`
- local link references inside `projects/tdk/.specify/docs/`

Do not edit these unless the user explicitly expands scope:

- `projects/tdk-docs/`
- `projects/tdk/README.md`
- non-English folders such as `projects/tdk/.specify/docs/vi/`
- future language folders such as `jp`
- root `.agents/skills/` or `.codex/`

Language policy: update English docs first. After owner review/done, suggest generic sync steps for other language folders; do not enforce non-English fallback in v1.

When the user explicitly asks to translate or sync Vietnamese docs under `docs/vi/`, write natural Vietnamese with full diacritics. Do not strip accents. Preserve command names, flags, file paths, code blocks, frontmatter keys, and identifiers exactly.

## Modes

Parse the request text:

| Mode | Triggers | Behavior |
|---|---|---|
| `check-only` | default, "check", "audit", "review only", "dry run" | Read docs and report mismatches. No file edits. |
| `review` | "review and fix if safe" | Report findings; patch only small obvious issues if user allowed edits. |
| `update` | "update", "rewrite", "apply", "normalize" | Patch English guide docs after running checklist and link inventory. |

If mode is unclear, use `check-only`.

## Required References

Load only what the task needs:

- `references/workflow-guide-format.md` when creating or updating route maps or workflow pages.
- `references/guide-page-type-rules.md` when deciding whether content is workflow, concept, reference, setup, or troubleshooting.
- `references/guide-review-checklist.md` for check-only/review runs and before final handoff.

## Workflow

### Step 1: Route-Map-First Scout

Treat `projects/tdk/.specify/docs/en/guides/index.md` as the guide-area source of truth.

If `guides/index.md` is missing, report a blocking finding. In update mode, create the minimal route map first from existing guide pages and local docs links; do not create or preserve `projects/tdk/.specify/docs/en/index.md` as a duplicate guide route map, and do not restructure subfolders blindly.

Run:

```bash
test -f projects/tdk/.specify/docs/en/guides/index.md && sed -n '1,220p' projects/tdk/.specify/docs/en/guides/index.md || true
test -f projects/tdk/.specify/docs/en/guides/index.md && rg -n "\\[[^]]+\\]\\([^)]+" projects/tdk/.specify/docs/en/guides/index.md || true
find projects/tdk/.specify/docs/en/guides -type f -name '*.md' | sort
git -C projects/tdk status --short
```

Build a route inventory before editing:

| Route map link | Resolved path | Exists? | Page type | Action |
|---|---|---|---|---|

Then scan all Markdown files under `guides/` and list files not routed by `guides/index.md`:

| Unrouted file | Page type | Proposed action |
|---|---|---|

Read `guides/index.md` first, then read every linked guide page, then read unrouted candidate files only when deciding keep/rename/shim/delete. The TDK repo may already have user edits; preserve unrelated changes.

### Step 2: Link Inventory Before Renames

Before renaming or replacing landing pages, run:

```bash
rg -n "setup/index.md|scenarios/index.md|concepts/index.md|epic-start-guide.md" projects/tdk/.specify/docs
```

Update local docs links or keep compatibility shims. Defer README, docs-site, and non-English sync.

### Step 3: Check Or Update

For `check-only`:

1. Read `guides/index.md` first.
2. Extract and resolve every Markdown link from `guides/index.md`.
3. Read each routed file and classify it with the page-type rules.
4. Scan all `guides/**/*.md` files and identify unrouted or duplicate landing pages.
5. Compare routed pages and unrouted files against the references.
6. Return findings grouped by route inventory, stale/missing routes, unrouted files, workflow pages, named landings, local links, long-page split risk, and language sync.
4. Do not modify files.

For `update`:

1. Confirm check-only output exists or run it first.
2. Patch only English guide docs.
3. Update `guides/index.md` first and keep it route-only.
4. Use route-map links to decide which subfiles need updates; do not infer priority from folder names alone.
5. Use named landing pages such as `setup-guide.md` and `scenario-catalog.md`; link concept pages only when they add unique non-workflow value.
6. Keep `index.md` shims only when local link inventory or renderer behavior requires them; otherwise route to named pages.
7. Avoid broad prose rewrites that do not directly support the accepted IA.

### Step 4: Validate

Run:

```bash
rg -n "setup/index.md|scenarios/index.md|concepts/index.md|epic-start-guide.md|scenario-catalog|promote-convention|glossary|setup-guide" projects/tdk/.specify/docs
test -f projects/tdk/.specify/docs/en/guides/index.md && rg -n "\\[[^]]+\\]\\([^)]+" projects/tdk/.specify/docs/en/guides/index.md
find projects/tdk/.specify/docs/en/guides -type f -name '*.md' | sort
```

If this skill itself was edited, mirror-check both local skill surfaces:

```bash
diff -qr projects/tdk/.agents/skills/tdk-guides-update projects/tdk/.claude/skills/tdk-guides-update
```

## Output

For check-only/review:

```markdown
## TDK Guides Check

### Scope
- Mode:
- Files read:

### Route Inventory
| Route map link | Resolved path | Exists? | Page type | Action |
|---|---|---|---|---|

### Unrouted Files
| File | Page type | Proposed action |
|---|---|---|

### Findings
| Area | Severity | Finding | Suggested fix |
|---|---|---|---|

### Do Not Edit Yet
- Non-English sync:
- Docs-site sync:

### Unresolved Questions
- None, or list questions.
```

For update:

- list changed files
- list validation commands and results
- list deferred language/doc-site sync suggestions
- list unresolved questions at the end
