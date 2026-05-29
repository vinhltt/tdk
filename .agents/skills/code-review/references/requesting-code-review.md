---
name: requesting-code-review
description: Use when completing tasks, implementing major features, or before merging to verify work meets requirements - dispatches code-reviewer subagent to review implementation against plan or requirements before proceeding
---

# Requesting Code Review

Dispatch code-reviewer subagent to catch issues before they cascade.

**Core principle:** Review early, review often.

## When to Request Review

**Mandatory:**
- After each task in subagent-driven development
- After completing major feature
- Before merge to main

**Optional but valuable:**
- When stuck (fresh perspective)
- Before refactoring (baseline check)
- After fixing complex bug

## How to Request

**1. Resolve output path** (see `output-path-resolution.md`):
```bash
TIMESTAMP=$(date +%Y%m%d-%H%M)
# {base_path} = user-specified path | auto-detected .specify/specs/{task-id}/ | $(pwd)
# {slug}      = derived from user input, branch, or HEAD commit subject
mkdir -p "{base_path}/reviews"
REPORT_PATH="{base_path}/reviews/${TIMESTAMP}-{slug}.md"
```

**2. Get git SHAs:**
```bash
BASE_SHA=$(git rev-parse HEAD~1)  # or origin/main
HEAD_SHA=$(git rev-parse HEAD)
```

**3. Dispatch code-reviewer subagent:**

Use Task tool with `code-reviewer` type. Pass:
- `{WHAT_WAS_IMPLEMENTED}` — What you just built
- `{PLAN_OR_REQUIREMENTS}` — What it should do (path to plan.md / spec.md)
- `{BASE_SHA}`, `{HEAD_SHA}` — diff range
- `{DESCRIPTION}` — Brief summary
- `{REPORT_PATH}` — **Absolute path** where the subagent must write its findings
- `{TEMPLATE_PATH}` — Path to `references/review-report-template.md` so the subagent uses the canonical structure

**Subagent contract:**
- Read the template at `{TEMPLATE_PATH}` and follow it exactly
- Write the populated report to `{REPORT_PATH}` — this is the deliverable
- Return a short summary (verdict + counts: `P0:n P1:n P2:n Simplify:n`) plus the report path
- Do **not** modify code — `/code-review` is read-only audit; fixes happen later via plan.md or `/simplify`

**4. Act on the report:**
- Read `{REPORT_PATH}` together with the user
- **P0 findings** → fix immediately or block the PR
- **P1 findings** → either fix now, or copy "Plan Additions" block into `plan.md` for next phase
- **Simplification Opportunities** → optionally trigger `/simplify` scoped to those file:line entries
- **P2** → note for backlog
- Push back on any finding the reviewer got wrong, with technical reasoning. Update the report's "Open Questions" section if needed.

## Example

```
[On branch feature/mrr-1994-batch-import, just finished Task 2]

You: Running code review.

TIMESTAMP=$(date +%Y%m%d-%H%M)            # → 20260505-1440
REPORT_PATH=".specify/specs/mrr-1994/reviews/${TIMESTAMP}-mrr-1994-batch-import.md"
mkdir -p "$(dirname "$REPORT_PATH")"
BASE_SHA=$(git rev-parse HEAD~1)
HEAD_SHA=$(git rev-parse HEAD)

[Dispatch code-reviewer subagent]
  WHAT_WAS_IMPLEMENTED: Batch import endpoint + validators
  PLAN_OR_REQUIREMENTS: .specify/specs/mrr-1994/plan.md (Phase 2)
  BASE_SHA: a7981ec
  HEAD_SHA: 3df7661
  DESCRIPTION: New BatchImportController + service + tests
  REPORT_PATH: <absolute>/.specify/specs/mrr-1994/reviews/20260505-1440-mrr-1994-batch-import.md
  TEMPLATE_PATH: <absolute>/references/review-report-template.md

[Subagent writes the report file and returns]:
  Verdict: needs-work
  Counts: P0:1 P1:3 P2:2 Simplify:4
  Report: .specify/specs/mrr-1994/reviews/20260505-1440-mrr-1994-batch-import.md

You: [Open report, fix the P0, copy "Plan Additions" block into plan.md
      for the P1 items, optionally run /simplify on the simplification items]
```

## Integration with Workflows

**Subagent-Driven Development:**
- Review after EACH task
- Catch issues before they compound
- Fix before moving to next task

**Executing Plans:**
- Review after each batch (3 tasks)
- Get feedback, apply, continue

**Ad-Hoc Development:**
- Review before merge
- Review when stuck

## Red Flags

**Never:**
- Skip review because "it's simple"
- Ignore Critical issues
- Proceed with unfixed Important issues
- Argue with valid technical feedback

**If reviewer wrong:**
- Push back with technical reasoning
- Show code/tests that prove it works
- Request clarification

See template at: requesting-code-review/code-reviewer.md