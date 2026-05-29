---
name: code-review
description: Audit code quality, write a structured review report to `{base_path}/reviews/{YYYYMMDD-HHmm}-{slug}.md`, and surface findings (P0/P1/P2 + simplification opportunities) ready to be merged into plan.md for tracked fixes. Use before PRs, after implementing features, when claiming task completion, for subagent reviews, or whenever the user asks for a "review", "audit", or wants findings persisted for follow-up. Pairs with `/simplify` this skill identifies issues and writes the report (read-only); `/simplify` then auto-fixes the simplification subset. Always invoke this skill — not /simplify — when the user wants a written report or a review that distinguishes correctness/security from simplification.
version: 1.1.0
---

# Code Review

Guide proper code review practices emphasizing technical rigor, evidence-based claims, and verification over performative responses.

## Overview

Code review here has four distinct practices:

1. **Receiving feedback** - Technical evaluation over performative agreement
2. **Requesting reviews** - Systematic audit via code-reviewer subagent, persisted to a report file
3. **Verification gates** - Evidence before any completion claims
4. **Report-driven fix loop** - Findings flow into `plan.md`; simplification items optionally flow into `/simplify`

Each practice has specific triggers and protocols detailed in reference files.

## Relationship to `/simplify`

`/code-review` and `/simplify` are **complementary, not redundant**:

| | `/code-review` (this skill) | `/simplify` |
|---|---|---|
| Scope | Correctness, security, architecture, requirements, plus simplification | Reuse / quality / efficiency only |
| Action | Read-only — writes a report file | Edits code in place |
| Output | `reviews/{ts}-{slug}.md` | Modified source files |
| Trust boundary | Trusted for correctness verdicts | Trusted only for mechanical simplification |

**Default workflow:**
```
/code-review  → review file (P0/P1/P2 + Simplification Opportunities)
              ├─ P0/P1                   → fix now, or paste "Plan Additions" into plan.md
              └─ Simplification subset   → run /simplify scoped to those file:line entries
              → re-run /code-review if substantial fixes were applied
```

Do not run `/simplify` on code that has unresolved P0/P1 findings — fix correctness first; mechanical simplification on broken code can entrench bugs.

## Core Principle

Always honoring **YAGNI**, **KISS**, and **DRY** principles.
**Be honest, be brutal, straight to the point, and be concise.**

**Technical correctness over social comfort.** Verify before implementing. Ask before assuming. Evidence before claims.

## When to Use This Skill

### Receiving Feedback
Trigger when:
- Receiving code review comments from any source
- Feedback seems unclear or technically questionable
- Multiple review items need prioritization
- External reviewer lacks full context
- Suggestion conflicts with existing decisions

**Reference:** `references/code-review-reception.md`

### Requesting Review
Trigger when:
- Completing tasks in subagent-driven development (after EACH task)
- Finishing major features or refactors
- Before merging to main branch
- Stuck and need fresh perspective
- After fixing complex bugs

**Reference:** `references/requesting-code-review.md`

### Verification Gates
Trigger when:
- About to claim tests pass, build succeeds, or work is complete
- Before committing, pushing, or creating PRs
- Moving to next task
- Any statement suggesting success/completion
- Expressing satisfaction with work

**Reference:** `references/verification-before-completion.md`

## Quick Decision Tree

```
SITUATION?
│
├─ Received feedback
│  ├─ Unclear items? → STOP, ask for clarification first
│  ├─ From human partner? → Understand, then implement
│  └─ From external reviewer? → Verify technically before implementing
│
├─ Completed work
│  ├─ Major feature/task? → Request code-reviewer subagent review (writes report)
│  └─ Before merge?       → Request code-reviewer subagent review (writes report)
│
├─ Have a fresh report
│  ├─ P0/P1 findings?            → Fix now or copy Plan Additions into plan.md
│  └─ Simplification findings?   → Run /simplify scoped to those file:line entries
│
└─ About to claim status
   ├─ Have fresh verification? → State claim WITH evidence
   └─ No fresh verification? → RUN verification command first
```

## Receiving Feedback Protocol

### Response Pattern
READ → UNDERSTAND → VERIFY → EVALUATE → RESPOND → IMPLEMENT

### Key Rules
- ❌ No performative agreement: "You're absolutely right!", "Great point!", "Thanks for [anything]"
- ❌ No implementation before verification
- ✅ Restate requirement, ask questions, push back with technical reasoning, or just start working
- ✅ If unclear: STOP and ask for clarification on ALL unclear items first
- ✅ YAGNI check: grep for usage before implementing suggested "proper" features

### Source Handling
- **Human partner:** Trusted - implement after understanding, no performative agreement
- **External reviewers:** Verify technically correct, check for breakage, push back if wrong

**Full protocol:** `references/code-review-reception.md`

## Requesting Review Protocol

### When to Request
- After each task in subagent-driven development
- After major feature completion
- Before merge to main

### Process
1. **Resolve output path** (full rules in `references/output-path-resolution.md`):
   - User-specified path > auto-detected `.specify/specs/{task-id}/` from branch > `$(pwd)`
   - `mkdir -p {base_path}/reviews`
   - Filename: `{base_path}/reviews/$(date +%Y%m%d-%H%M)-{slug}.md`
2. Get git SHAs: `BASE_SHA=$(git rev-parse HEAD~1)`; `HEAD_SHA=$(git rev-parse HEAD)`
3. Dispatch `code-reviewer` subagent via Task tool. Pass `WHAT_WAS_IMPLEMENTED`, `PLAN_OR_REQUIREMENTS`, `BASE_SHA`, `HEAD_SHA`, `DESCRIPTION`, **`REPORT_PATH`** (absolute), and **`TEMPLATE_PATH`** pointing to `references/review-report-template.md`. The subagent's deliverable is the populated report file at `REPORT_PATH`.
4. Act on the report:
   - **P0** → fix immediately
   - **P1** → fix before next task, or paste the "Plan Additions" block into `plan.md`
   - **Simplification Opportunities** → optionally invoke `/simplify` scoped to those file:line entries
   - **P2** → backlog
5. Each invocation writes a **new file** — never overwrite existing reports. Reports are an append-only audit trail.

**Full protocol:** `references/requesting-code-review.md`
**Output path rules:** `references/output-path-resolution.md`
**Report structure:** `references/review-report-template.md`

## Review Output Protocol

Every `/code-review` invocation must produce **exactly one** report file. The file is the artifact the user supplements `plan.md` with.

### Path

```
{base_path}/reviews/{YYYYMMDD-HHmm}-{slug}.md
```

- `{base_path}` resolution order: explicit user path → auto-detected `.specify/specs/{task-id}/` from branch → `$(pwd)`
- `{YYYYMMDD-HHmm}` from `date +%Y%m%d-%H%M` (always shell out, never guess)
- `{slug}` derived from user input → branch name → HEAD commit subject → `general-review`
- Collision in the same minute → append `-2`, `-3`, …
- Always `mkdir -p {base_path}/reviews` first

Full rules: `references/output-path-resolution.md`.

### Content

The subagent must populate the canonical template at `references/review-report-template.md`. Required sections:

- Header table (date, scope, SHAs, branch, verdict)
- **P0 / P1 / P2** finding buckets — each with `file:line`, why, suggested fix, evidence
- **Simplification Opportunities** — separate bucket; feeds `/simplify`
- **Strengths**
- **Verification Performed** — commands run, files diffed
- **Plan Additions** — paste-ready markdown block to drop into `plan.md`
- **Open Questions**

### Append-only

Reports are an audit trail. **Never modify or delete prior reports.** A second review on the same code creates a new file with a fresh timestamp.

## Verification Gates Protocol

### The Iron Law
**NO COMPLETION CLAIMS WITHOUT FRESH VERIFICATION EVIDENCE**

### Gate Function
IDENTIFY command → RUN full command → READ output → VERIFY confirms claim → THEN claim

Skip any step = lying, not verifying

### Requirements
- Tests pass: Test output shows 0 failures
- Build succeeds: Build command exit 0
- Bug fixed: Test original symptom passes
- Requirements met: Line-by-line checklist verified

### Red Flags - STOP
Using "should"/"probably"/"seems to", expressing satisfaction before verification, committing without verification, trusting agent reports, ANY wording implying success without running verification

**Full protocol:** `references/verification-before-completion.md`

## Integration with Workflows

- **Subagent-Driven:** Review after EACH task, write report under `.specify/specs/{task-id}/reviews/`, verify before moving to next
- **Pull Requests:** Verify tests pass, request code-reviewer review before merge, attach report path in PR description
- **plan.md fix loop:** Use the report's "Plan Additions" block to add tracked fix tasks; link the report from the new phase
- **/simplify pairing:** After fixing P0/P1, run `/simplify` on the items under "Simplification Opportunities" — never the other way round
- **General:** Apply verification gates before any status claims, push back on invalid feedback

## Bottom Line

1. Technical rigor over social performance - No performative agreement
2. Systematic review processes - Use code-reviewer subagent
3. Evidence before claims - Verification gates always

Verify. Question. Then implement. Evidence. Then claim.
