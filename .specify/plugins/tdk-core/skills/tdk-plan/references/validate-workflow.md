# Validate Workflow (Step 4.7 / `--validate` action)

User-in-the-loop interview over an existing plan. Template-based question generation (see `validate-question-framework.md`). Supports mid-interview suspend with `validation_cursor` resume state.

## Trigger

| Invocation | Behavior |
|---|---|
| `/tdk-plan <ID> --validate` | Subcommand short-circuit (Step 1.7). Skips Steps 2–4. Runs unconditionally. |
| `/tdk-plan <ID> --hard` | After Step 4.5 (red-team), prompt user `Run validation interview? [y/N]`. Default N. |
| `/tdk-plan <ID>` (default) | Same prompt as `--hard` (no auto-run). |
| `/tdk-plan <ID> --fast` | Step 4.7 SKIPPED. |

## Orphan Detection (FIRST step every invocation)

Before generating any new question, scan plan.md for `## Validation Log` containing `### Session N — ... (in-progress)`.

**If found** → AskUserQuestion (Validation S1 D5):

```
Prior session N is in-progress (cursor at Q{cursor}, {cursor-1}/{N_total} answered).
[Resume — continue Q{cursor}, preserve prior answers, same Session N]
[Discard + restart — delete partial section + orphan markers, start Session N+1]
[Cancel — exit; resolve manually]
```

### Resume path

1. Print partial Q/A summary (Q1..Q{cursor-1} from plan.md so user remembers where they were).
2. **Trust-ask (Validation S2 D5 / S2.F13):** AskUserQuestion `"Have you edited plan.md or any phase-*.md since the last suspend?"` `[No, content unchanged]` / `[Yes, content changed]`.
   - **No** → proceed; skip Q1..Q{cursor-1}; loop continues at Q{cursor}.
   - **Yes** → force Discard path (prior answers may now be stale — safer to regenerate).
3. Solo-dev rationale: trust user self-report over an automated content-hash check. User edits mid-session are expected to be declared.

### Discard path

1. Grep all `phase-*.md` for `<!-- Updated: Validation Session {N} -->` markers; remove every match (orphan cleanup).
2. Delete the in-progress `### Session {N}` block from plan.md.
3. Increment `validation_session: N+1`.
4. Reset `validation_cursor: 0`.
5. Continue with fresh question generation (next section).

### Cancel path

Exit immediately. No file mutations, no counter bump.

## Session Setup (no orphan detected)

1. Validate TASK_ID, locate spec dir.
2. Load plan.md + every `phase-*.md`.
2b. **Skill Routing Inline Load**: if plan has `## Delegate Skills` sections, read `{docs.path}/custom-workflow/plan-skill-routing.md` into `SKILL_ROUTING` so validation interview can include skill-routing questions. Skip silently if file missing.
3. Increment `validation_session: N` in plan.md frontmatter (via Edit tool — Session 2 #12 frontmatter mutations are framework-managed; do NOT add a custom bun writer).
4. Reset `validation_cursor: 0`.
5. **Write `## Validation Log` header IMMEDIATELY** with `(in-progress)` marker (S1.F14):
   ```markdown
   ## Validation Log

   ### Session {N} — {ISO8601} (in-progress)
   **Mode trigger:** {hard | manual}
   **Questions:** ...

   | # | Category | Layer | Question | Answer | Action |
   |---|---|---|---|---|---|
   ```
   Without this, a Ctrl-C between counter bump and first answer would leave orphan phase markers with no `## Validation Log` to detect on next run.
6. Generate questions per `validate-question-framework.md` algorithm. Cap at 8.

## Interview Loop

```
for batch in chunks(questions, 4):                         # AskUserQuestion max = 4
  ask = AskUserQuestion(batch)
  for (q, a) in zip(batch, ask.answers):
    append_row(plan.md `## Validation Log` Session N table, q, a)
    if a.action triggers a phase change:
      append_marker(target_phase, "<!-- Updated: Validation Session {N} — {short summary} -->")
    cursor += 1
    write_frontmatter(plan.md, validation_cursor=cursor)   # via Edit tool
  if cursor < total:
    cont = AskUserQuestion("Continue with next batch, or skip remaining?",
                            options=["Continue", "Skip remaining"])
    if cont == "Skip remaining": break
```

`AskUserQuestion` accepts 1–4 questions per call → batches are size 4 (or final-batch remainder).

## Completion

On normal completion (`cursor == total`) OR after `Skip remaining`:

1. Compute `recommendation` from collected actions per `validate-question-framework.md`:
   - `proceed` if all `no-op`.
   - `revise` if any `revise` (and none `spec-update-needed`).
   - `spec-update-needed` if any `spec-update-needed`.
   - `partial` if early-exit (cursor < total) regardless.
2. Replace the Session header `(in-progress)` → `(completed)` (or `(partial)` on early-exit).
3. Write trailing summary block before the `### Session N+1` boundary:
   ```markdown
   **Answered:** {cursor}/{total}{ — early exit if partial}
   **Recommendation:** {proceed | revise | spec-update-needed | partial}
   ```
4. Reset `validation_cursor: 0` (signal that no resume is pending).

## Phase File Markers

Append at end of phase file (or below frontmatter for `plan.md`):

```html
<!-- Updated: Validation Session {N} — {short summary, ≤120 chars} -->
```

`{summary}` is the question's `id` + the chosen answer's `label`, truncated. Same sanitizer as Phase 06 (`-->`, `<!--`, `<`, `>`, newline strip; pipe escape).

Discard-path orphan cleanup uses `grep -l '<!-- Updated: Validation Session {N} -->'` to find these.

## Recommendation Output

After completion, print to terminal:

```
Validation Session {N} — {completed | partial} — Recommendation: {recommendation}
{cursor}/{total} questions answered.
Full Q/A logged in plan.md ## Validation Log.
```

If `recommendation == spec-update-needed` → also print `Hint: run /tdk-specify update {TASK_ID} to refresh the spec before /tdk-implement.` (auto-invoke deferred to v2).

## Counter Safety

`validation_session` is bumped at session setup step 3 — BEFORE the first AskUserQuestion. The matching `(in-progress)` header is written at step 5 in the same Edit batch. If the user Ctrl-Cs between step 3 and step 5, the header is still missing → next invocation goes straight to fresh question generation (no false-positive orphan detection). The cursor stays 0; counter increments are monotonic and a single missed session number is acceptable.

## Reports

Validation logs live **inline in plan.md** (single source of truth, easier diff in PRs). No separate `reports/validate-*.md` file by design — different from red-team which dumps full per-agent transcripts.
