# Guide Review Checklist

Use this checklist for `check-only`, `review`, and final validation.

## Pre-Check Commands

```bash
git -C projects/tdk status --short
test -f projects/tdk/.specify/docs/en/guides/index.md && sed -n '1,220p' projects/tdk/.specify/docs/en/guides/index.md || true
test -f projects/tdk/.specify/docs/en/guides/index.md && rg -n "\\[[^]]+\\]\\([^)]+" projects/tdk/.specify/docs/en/guides/index.md || true
find projects/tdk/.specify/docs/en/guides -type f -name '*.md' | sort
rg -n "setup/index.md|scenarios/index.md|concepts/index.md|epic-start-guide.md" projects/tdk/.specify/docs
```

## Route-Map-First Checklist

- [ ] `guides/index.md` was read before any subfile.
- [ ] Every Markdown link in `guides/index.md` is resolved to an existing file or reported as stale.
- [ ] Every routed file is classified by page type.
- [ ] Every unrouted `guides/**/*.md` file is listed with keep, route, shim, rename, or defer action.
- [ ] Updates follow route-map priority instead of folder-name guesses.

## IA Checklist

- [ ] `guides/index.md` is route-only and short.
- [ ] `docs/en/index.md` is absent; English entry links go directly to `docs/en/guides/index.md`.
- [ ] Route map links point to real files or known shims.
- [ ] Setup/scenarios/concepts have named landing pages or documented shims.
- [ ] Epic start is treated as a scenario, not a special top-level workflow.
- [ ] `skills-guide.md` remains reference, not workflow narrative.
- [ ] `workflow-map.md` remains concept/reference unless intentionally split later.

## Workflow Page Checklist

- [ ] Starts with use case, reader level, and main path.
- [ ] Has Fast Path before deep detail.
- [ ] Lists prerequisites before steps.
- [ ] Each command step has expected artifact and gate.
- [ ] Common mistakes/troubleshooting are near the end.
- [ ] Deep detail links to concept/reference pages.

## Link And Scope Checklist

- [ ] Local docs links in `projects/tdk/.specify/docs/` are inventoried before renames.
- [ ] README/docs-site sync is deferred unless user expands scope.
- [ ] Non-English updates are deferred until English owner review/done.
- [ ] Dirty worktree changes unrelated to this task are preserved.

## Output Severity

| Severity | Meaning |
|---|---|
| Blocking | Would break route, link, or accepted phase gate. |
| Revise | Should fix before large docs rewrite. |
| Info | Safe follow-up or later language/docs-site sync. |
