---
name: output-path-resolution
description: How to resolve the output directory and filename for review reports - default vs user-specified base path, slug derivation, timestamp generation
---

# Review Report Output Path Resolution

Each `/code-review` invocation writes exactly **one** report file. The location and name follow deterministic rules so reports stay discoverable and chronological.

## File path formula

```
{base_path}/reviews/{YYYYMMDD-HHmm}-{slug}.md
```

## Base path resolution

Resolve in this order — first match wins:

1. **Explicit user input** — user said something like "save to .specify/specs/mrr-1994/" or "output in /tmp/audit"
   → Use that path as `{base_path}`
2. **Detected task ID from current branch** — branch matches the project's ticket regex (e.g. `feature/mrr-1994`, `mrr-2056`)
   → Use `.specify/specs/{task-id}/` as `{base_path}`
   → Confirm with user before writing if branch detection is ambiguous
3. **Fallback** — current working directory
   → Use `{cwd}/` as `{base_path}`

In all cases the script/skill **creates `{base_path}/reviews/` if missing** (mkdir -p).

## Timestamp

Use the local-system timestamp at review start:

```bash
TIMESTAMP=$(date +%Y%m%d-%H%M)
```

Cross-platform: works in Git Bash on Windows, Linux, macOS. Do **not** guess from model knowledge — always shell out.

## Slug generation

Slug is short (≤40 chars), kebab-case, lowercase, ASCII only. Derive in this order:

1. **User-provided** — if user gave a label ("review the auth refactor"), slugify it: `auth-refactor`
2. **Branch name** — strip prefixes (`feature/`, `fix/`), keep ticket+keywords: `mrr-1994-batch-import`
3. **Commit subject** — slugify the HEAD commit subject if no branch hint
4. **Generic** — `general-review` if nothing else applies

Slug rules:
- Replace whitespace and `_` with `-`
- Drop characters outside `[a-z0-9-]`
- Collapse repeated `-`
- Trim trailing `-`
- Truncate at 40 chars

## Examples

| Context | Resolved path |
|---|---|
| User: "review and save to .specify/specs/mrr-2002/" + slug `worker-fix` | `.specify/specs/mrr-2002/reviews/20260505-1440-worker-fix.md` |
| Branch `feature/mrr-1994-import` (auto-detect) | `.specify/specs/mrr-1994/reviews/20260505-1440-mrr-1994-import.md` |
| No branch match, no user path | `./reviews/20260505-1440-general-review.md` |

## Idempotence

Two reviews in the same minute on the same slug would collide. If the target file already exists, append `-2`, `-3`, … to the slug:

```
20260505-1440-auth-refactor.md      (first run)
20260505-1440-auth-refactor-2.md    (second run same minute)
```

## Never overwrite

Reports are an append-only audit trail. Never modify or delete prior reports — they are evidence the user may need for plan supplements, retrospectives, or PR descriptions.
