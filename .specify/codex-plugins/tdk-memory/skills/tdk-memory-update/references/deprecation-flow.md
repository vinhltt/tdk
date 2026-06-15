# Deprecation Flow (`--deprecate [path]`)

Triggered by explicit `--deprecate` flag in user input.

---

## Path Scope Guard (REQUIRED)

Verify `os.path.abspath(target)` starts with `os.path.abspath('.specify/memory/')`.
If outside: STOP "Path must be within .specify/memory/."

---

## Steps

1. **Move** file: `.specify/memory/{path}` → `.specify/memory/_deprecated/{path}`
2. **Edit frontmatter**: set `status: deprecated`, add `deprecated_at: {today}`
3. **Regenerate memory-index.md**: follow `regenerate-memory-index-flow.md`
4. **Update memory.yaml**: entry reflects new path in `_deprecated/`

---

## Report

```
Deprecated: {original-path} → _deprecated/{path}
```

Never delete — move only.
