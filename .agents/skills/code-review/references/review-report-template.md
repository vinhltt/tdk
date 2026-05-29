---
name: review-report-template
description: Canonical structure for the review report file written by /code-review - sections, priorities, and copy-ready plan additions designed to be merged into plan.md
---

# Review Report Template

The report is the **only persistent artifact** of `/code-review`. It must be self-contained, evidence-based, and structured so the user can lift sections directly into `plan.md` as fix tasks.

## Why this structure

- **Priority buckets (P0/P1/P2)** map onto the project's existing fix-order convention (Critical → Important → Minor).
- **Simplification Opportunities** is a separate bucket so `/simplify` can consume it independently without touching correctness/security findings.
- **Plan Additions** is pre-formatted to paste into `plan.md` — saves the user manual reformatting.
- **Evidence per finding** (file:line + reasoning) keeps claims honest and lets reviewers re-verify later.

## Filename

See `output-path-resolution.md`. Always one file per review; never overwrite existing reports.

## Template

```markdown
# Code Review Report — {slug}

| Field | Value |
|---|---|
| Date | {YYYY-MM-DD HH:mm} (local) |
| Scope | {one-line description: what was reviewed} |
| Base SHA | {BASE_SHA} |
| Head SHA | {HEAD_SHA} |
| Branch | {branch name} |
| Reviewer | code-reviewer subagent |
| Verdict | ready / needs-work / blocked |

## Summary

{2–4 sentences. State the verdict and the single most important reason for it. No filler.}

## P0 — Critical (block merge)

> Anything in this section must be fixed before merge. Empty section is fine — write `_None._` if so.

- [ ] **{file:line}** — {one-line issue}
  - **Why it matters:** {1–2 sentences, technical}
  - **Suggested fix:** {concrete change}
  - **Evidence:** {test name, error message, spec link, or quoted code}

## P1 — Important (fix before next task)

- [ ] **{file:line}** — {issue}
  - **Why:** ...
  - **Fix:** ...

## P2 — Minor (note for later)

- [ ] **{file:line}** — {issue} _(optional: defer to backlog)_

## Simplification Opportunities

> YAGNI / KISS / DRY violations. These are candidates for `/simplify` auto-fix. Keep separate from correctness issues — `/simplify` should not be trusted to judge security or business logic.

- [ ] **{file:line}** — {what to simplify}
  - **Pattern:** {YAGNI | KISS | DRY | dead code | over-abstraction}
  - **Suggested action:** {inline / extract / delete / collapse}

## Strengths

- {What was done well. Brief. Skip if nothing notable.}

## Verification Performed

- {Commands run, e.g. `dotnet build`, `npm run test -- --watch=false`}
- {Files diffed: `git diff {BASE_SHA}..{HEAD_SHA} --stat` summary}
- {Specs/requirements consulted: paths to plan.md / spec.md sections}

## Plan Additions (paste-ready)

> Copy the block(s) below into `plan.md` under an appropriate phase to convert findings into tracked tasks.

```markdown
### Phase: Address review {slug} ({YYYY-MM-DD})

**Source:** [Review Report]({relative-path-to-this-report})

**P0:**
- [ ] {file:line} — {short title}
- [ ] ...

**P1:**
- [ ] {file:line} — {short title}
- [ ] ...

**Simplification (run /simplify after P0/P1):**
- [ ] {file:line} — {short title}
```

## Open Questions

- {Anything the reviewer could not verify and needs the author to clarify. Leave empty if none.}
```

## Authoring rules

1. **No empty fluff.** If a section has nothing, write `_None._` — never invent content.
2. **Every finding has evidence.** `file:line` + a quoted snippet, error, or spec reference. No vague "this looks bad".
3. **Imperative fixes.** "Replace X with Y" not "consider replacing X".
4. **Stay in priority lane.** A correctness bug is P0/P1, not "Simplification". A `var x = unused;` is Simplification, not P2.
5. **Plan Additions must be runnable.** The user should be able to paste it into `plan.md` and have valid markdown.
