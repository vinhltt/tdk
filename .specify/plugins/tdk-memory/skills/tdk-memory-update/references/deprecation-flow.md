# Deprecation Flow (`--deprecate [path]`)

Triggered by explicit `--deprecate` flag in user input.

---

## Path Scope Guard (REQUIRED)

Complete the shared root/runtime/YAML preflight BEFORE this dispatch. Canonicalize
both source and destination under `<memoryRoot>` and enforce workspace containment.
Reject `_templates/**` targets and any escaping symlink; string prefixes are not
containment checks. On failure STOP without moving or editing anything.

---

## Steps

1. **Move** file: `<memoryRoot>/{path}` → `<memoryRoot>/_deprecated/{path>`
2. **Edit frontmatter**: set `status: deprecated`, add `deprecated_at: {today}`
3. **Regenerate memory-index.md**: follow `regenerate-memory-index-flow.md`
4. **Update memory.yaml**: entry reflects new path in `_deprecated/`; preserve
   `templates[]` and unrelated entries. Hash actual deprecated bytes and the
   regenerated index, then validate a temporary candidate before publication.

---

## Report

```
Deprecated: {original-path} → _deprecated/{path}
```

Never delete — move only.
