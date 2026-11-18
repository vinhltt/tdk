# Validate Workflow (Step 4.7 / `--validate` action)

Validation interview over an existing plan. Questions come from the template framework (see `validate-question-framework.md`). `tdk-counsel` recommends an answer for every question, the user confirms or overrides all of them in one reply, and the plan is written once.

Ask every user-facing prompt in this workflow in plain chat text, not through an interactive question tool. Each prompt is the final text of the turn. Stop there: make no tool calls until the user replies, and never assume a reply, including in auto mode. Treat the user's next message as the reply.

Sections below are numbered 0–8. "Step" with a number refers to `SKILL.md`.

## Trigger

| Invocation | Behavior | Mode trigger |
|---|---|---|
| `/tdk-plan <ID> --validate` | Review action: Step 0.1 goes straight to the Step 1.7 short-circuit, skipping Steps 0.1b–1.5 and 2–4. Starts at section 1. | `manual` |
| `/tdk-plan <ID> --validate <USER_CONTENT>` | Same, with `USER_CONTENT` as validation focus. | `manual` |
| `/tdk-plan <ID> <USER_CONTENT> --validate` | Same, with `USER_CONTENT` as validation focus. | `manual` |
| `/tdk-plan <ID> --hard` | Step 4.7 after Step 4.5 (red-team). Starts at section 0. | `hard` |
| `/tdk-plan <ID>` (default) | Step 4.7. Starts at section 0 (no auto-run). | `default` |
| `/tdk-plan <ID> --fast` | Step 4.7 SKIPPED. | — |

An action flag outranks a speed flag: `--validate` with `--hard` or `--fast` runs as `manual` from section 1.

## 0. Opt-in (Step 4.7 only)

Ask before anything else in this workflow:

```text
Run validation interview? [y/N]
```

Then stop and wait. `y` or `yes` (any case) continues to section 1. Any other reply ends the workflow with no writes.

## 1. Legacy Session Check

First apply section 2 item 1. Earlier TDK versions wrote `### Session N — ... (in-progress)` blocks under `## Validation Log`. Read `plan.md` and look for them. If there are none, go to section 2.

Otherwise ask in plain chat, listing every in-progress session number:

```text
plan.md has an unfinished validation session from an older TDK version (Session {K}, in-progress).
Reply `discard` to replace it with a new session, or `cancel` to stop without changes.
```

Then stop and wait. Read the reply case-insensitively.

- First word `discard`: record the intent and continue. Discard takes effect in the final write (section 7). If the workflow stops before that write, for example on `stop`, the old sessions and their markers stay untouched.
- `cancel` or anything else: print `Validation stopped — nothing written.` and end.

## 2. Session Setup

Write nothing before the user confirms. Sections 2–5 only read files and run read-only commands.

1. Use `TASK_ID` and `FEATURE_DIR` from Steps 0–0.1. If `{FEATURE_DIR}/plan.md` does not exist, STOP: `No plan for {TASK_ID}. Run /tdk-plan {TASK_ID} first.`
2. Load `spec.md`, `plan.md`, and every `phases/phase-NN-*.md`. Record the `sha256sum` of `plan.md` and of every phase file for the pre-write check (`shasum -a 256` when `sha256sum` is missing).
3. **Skill Routing Inline Load**: always resolve exact `ROUTING_FILE = {docs.path}/custom-workflow/delegate-routing.md` and read that path directly into `SKILL_ROUTING` so validation can assess whether plan phases have correct skill assignments. Do not use Search/Grep/Glob or a path fragment pattern to check existence. Skip silently only when the exact resolved file is missing.
4. If `USER_CONTENT` is non-empty, store it as validation focus and bias generated questions toward that focus. The focus narrows priority; severe drift still takes precedence.
5. Run deterministic spec-plan drift preflight and keep the rows in memory:
   ```bash
   (cd "$PROJECT_DIR/.specify/scripts/ts" && bun src/commands/util/spec-plan-drift.ts \
     --spec "{FEATURE_DIR}/spec.md" \
     --plan "{FEATURE_DIR}/plan.md" \
     --phases-root "{FEATURE_DIR}/phases" \
     --json)
   ```
   If the helper errors, STOP and report the exact stderr/stdout. Do not generate questions from incomplete drift data.
6. Generate questions per `validate-question-framework.md`. Number them `#1..#n` in generation order. Each question carries its template `id` and options A–C plus D `Skip this question`. Copy every option label verbatim from the framework (the template options, or the drift option table); do not reword or extend it. A drift question covers one `questionId` group from the framework; its text is `{drift IDs}: {Summary}`, such as `D1: {Summary}` or `D2, D4: {Summary of D2}`. Use `USER_CONTENT` as validation focus when choosing among otherwise equal question candidates.

## 3. Counsel Consult

Consult `tdk-counsel` once for all questions, as one subagent call. Put the instructions outside the fence and only data inside it, because the agent treats fenced material as data:

```text
Recommend one answer for each validation question below. Read the listed files and cite evidence.
Return exactly this table and nothing else, one row per question number. One `Note:` line after the table is allowed.
| # | letter | reason | file:line | needs-human |
- letter: A, B, or C. The counsel must not choose option D.
- reason: one line. Do not put `|` inside a cell.
- file:line: the evidence that supports the choice.
- needs-human: `yes` when the question turns on product scope, compliance, or user intent, or when the evidence is not enough; still choose the best letter. Otherwise `no`.
=== CALLER CONTEXT ===
spec: {FEATURE_DIR}/spec.md
plan: {FEATURE_DIR}/plan.md
phases: {every phase file path}
routing file: {ROUTING_FILE, or none}
validation focus: {USER_CONTENT, or none}
drift rows: {the preflight rows}
questions:
#1 [{template id}] {question}
   A) {label} · B) {label} · C) {label} · D) Skip this question
...
=== CALLER CONTEXT ===
```

Read the first table in the answer, ignoring a surrounding code fence, and skip its header and separator rows. The `#` cell may be `1` or `#1`. needs-human is `yes` or `no` in any case; any other value counts as `yes`. A row is valid when its `#` exists, it is the only row for that `#`, and its letter is A, B, or C. Use the counsel's letter as given; never change it. A `Note:` line after the table (the counsel's model-fallback notice) goes into the session's **Counsel:** line. A tool error, a missing or duplicate row, an invalid letter, or output with no table is a failure for the questions it affects.

On failure, Retry the consult once with a stricter format prompt: resend the same instructions and fence, list only the failed questions under their original `#`, and start with `An earlier answer did not match the required table. Return only the table, one row per listed #.` Questions still without a valid row after the retry get "no recommendation". When the runtime has no subagent tool, skip the consult and mark every question "no recommendation". Do not substitute another agent, and do not invent recommendations in the main session. For the session's **Counsel:** line, `unavailable` means the runtime has no subagent tool, `retried` means a retry ran, and `consulted` means the first answer was valid.

## 4. Question Message

Ask every validation question in one message. Order: questions with needs-human `yes` first, then the rest in generation order. Then number them `V1..Vn`. In every table cell, replace line breaks with spaces and escape `|` as `\|`.

```text
Validation Session {N} — {total} questions. Reply once.

| V | Question | Recommended | Why (evidence) |
|---|---|---|---|
| V1 | {question} | B — {label} (needs your call) | {reason} (`{file:line}`) |
| V2 | {question} | A — {label} | {reason} (`{file:line}`) |
| V3 | {question} | no recommendation | — |

V1: A) {label} · B) {label} · C) {label} · D) Skip
V2: ...

Reply in one message:
- `yes` — accept every recommendation.
- `V2B` or `V2: B` — choose an option for V2 (D skips it). `V2: skip` also skips.
- `V2: <your answer>` — answer in your own words.
- `yes V3C; V5: add a rollback step` — override some questions and accept the rest.
- `stop` — write nothing.
Put each answer on its own line, or separate answers with `;`.
Questions you do not mention take the recommendation. Questions marked `no recommendation` need an explicit answer.
```

Then stop and wait. `{N}` is the current `validation_session` plus one; a missing field counts as 0. Mark needs-human questions with `(needs your call)` after the recommended option.

## 5. Reply

Split the reply into answers at line breaks, at a `;` followed by a V-id, and right before every `Vn:` or `Vn=`. For splitting, a V-id must carry its `V` or `Q` prefix; any other `;` inside free text stays part of that answer. Matching is case-insensitive. Elsewhere the `V` or `Q` prefix is optional, `Vn=` reads the same as `Vn:`, and spaces around `:` and `=` are optional.

- An answer that starts with `Vn:` runs to the end of its part. When the rest is one letter A–D, optionally followed by `.`, `,`, or `)`, it chooses that option. When the rest is `skip`, it skips the question. When the rest is `yes`, `ok`, or `recommended`, it takes that question's recommendation (source `counsel, accepted`); a `no recommendation` question stays unresolved. Anything else is free text.
- Any other part is read word by word, ignoring `,`, `;`, `.`, and a leading `-` or `*` around each word: `yes`, `ok`, `recommended`, `stop`, or a compact `VnX` (X is A–D). Any other word is an unknown token.

In the table below, `ok` and `recommended` count as `yes`.

| Reply | Result | Source recorded in the log |
|---|---|---|
| `yes`, `ok`, or `recommended` as the whole reply | Accept every recommendation | `counsel, accepted` |
| `VnX`, `Vn: X` (X is A–D) | Choose option X; D skips the question. A letter equal to the recommendation counts as accepted | `user override` (D: `user skip`; same letter: `counsel, accepted`) |
| `Vn: skip` | Skip the question (`no-op`) | `user skip` |
| `Vn: <text>` | Map the text to the option whose label it matches in meaning. When no single option clearly matches, the question is unresolved | `user override` (text mapped to D: `user skip`) |
| `yes` with other words, such as `yes V3C` or `yes please` | Answers win; every other question takes its recommendation. Unknown tokens and V-ids that do not exist are ignored and listed in the output. A word that names an existing question without a valid answer, such as `V2` in `yes V2 B`, leaves that question unresolved | answered: as above; the rest: `counsel, accepted` |
| No `yes`, question not mentioned | Take the recommendation, but only when the reply has no unknown token outside a `Vn:` answer | `counsel, implied` |
| `stop` anywhere outside a `Vn:` answer | Write nothing and end | — |
| No `yes`, with an unknown token or a V-id that does not exist | Every question without an explicit answer is unresolved | — |
| Two answers for one question | That question is unresolved | — |

- A "no recommendation" question never takes a value from `yes` or from being left out; it needs an explicit answer. Record any explicit answer to it with source `user (no counsel)`, which replaces the sources above for that question.
- On `stop`, print `Validation stopped — nothing written.` and end.

### Repair prompt

Ask at most one repair prompt, for the unresolved questions only. Answers from the first reply stay. If the reply asked a question instead of answering, answer it at the top of the repair prompt.

```text
{answer to the user's question, if the reply asked one}
{k} of {total} questions are still unresolved. Reply once more; `stop` writes nothing.

| V | Question | Recommended | Why (evidence) |
|---|---|---|---|
| V4 | {question} | A — {label} | {reason} (`{file:line}`) |

V4: A) {label} · B) {label} · C) {label} · D) Skip

`yes` accepts the recommendations above. Questions you leave out take their recommendation, except `no recommendation` questions.
```

Then stop and wait. Read the repair reply with the same rules, applied to the listed questions only: `yes` and omission cover only those questions, and answers to questions that are not listed are ignored and listed in the output. If any question is still unresolved, print `Validation stopped — nothing written.`, list the unresolved V-ids, and end.

## 6. Pre-Write Check

Re-read `plan.md` and every phase file before writing, in full (past any line or length limit of the read tool), and recompute their hashes. If any file changed since section 2, or a phase file was added or removed, print `Validation stopped — nothing written.`, list the changed files, and end.

Save a copy of the re-read `plan.md` to a new temporary file and keep the printed path for section 7:

```bash
PRE=$(mktemp "${TMPDIR:-/tmp}/tdk-validate-plan.XXXXXX") && cp "{FEATURE_DIR}/plan.md" "$PRE" && echo "$PRE"
```

## 7. Write

First compute `recommendation` from the final actions per `validate-question-framework.md`:
- `proceed` if all `no-op`.
- `revise` if any `revise` (and none `spec-update-needed`).
- `spec-update-needed` if any `spec-update-needed`.

Then build the new `plan.md` from the text re-read in section 6, copied verbatim, and write it once with the Write tool. Apply only these changes:

1. Increment `validation_session` once, in the final write. When the field is missing, add it as `1` on the last frontmatter line.
2. Remove `validation_cursor` from the frontmatter when the field exists. Leave every other frontmatter field unchanged.
3. On Discard, delete every discarded `(in-progress)` session block: its heading and every following line up to, not including, the next line that starts with `### ` or `## `, or to the end of the file. `#### ` lines belong to the block.
4. On Discard, delete every line that starts with `<!-- Updated: Validation Session {K} `, where `{K}` is a discarded session number from section 1 followed by a space. Markers of completed sessions stay.
5. Insert a plan-level marker (see Markers) on its own line right after the closing `---` of the frontmatter, for every `revise` question about the plan as a whole.
6. Insert the new session at the end of the `## Validation Log` section, before the next `## ` heading or at the end of the file. When the heading is missing, add it at the end of the file.

Keep every part of `plan.md` not named in items 1–6 byte-for-byte. The new session:

```markdown
### Session {N} — {ISO8601} (completed)
**Mode trigger:** {hard | default | manual}
**Validation focus:** {USER_CONTENT or none}
**Counsel:** {consulted | retried | unavailable}{; missing rows: V…}{; Note: …}

#### Spec-Plan Drift Preflight

| ID | Severity | Type | Spec Anchor | Plan Anchor | Summary | Suggested Action |
|---|---|---|---|---|---|---|

| V | Template id | Category | Layer | Question | Answer | Source | Action |
|---|---|---|---|---|---|---|---|

**Answered:** {total} — {a} accepted, {i} implied, {o} override, {s} skip, {u} without counsel
**Recommendation:** {proceed | revise | spec-update-needed}
```

Sanitize every cell of both tables like the question message. Answer cell formats:

| Source | Answer cell |
|---|---|
| `counsel, accepted`, `counsel, implied` | `B — {label}; why: {reason} ({file:line})` |
| `user override`, `user (no counsel)` | `C — {label}`, or `C — {label} (from: "{text}")` for a free-text answer |
| `user skip` | `D — Skip this question` |

Each question counts once. A `user (no counsel)` answer counts only in `{u}`.

After the Write, compare the file with the saved copy. Exit status 1 only means the files differ, which is expected here; status 2 is an error:

```bash
diff "{saved path}" "{FEATURE_DIR}/plan.md"
```

Every difference must come from items 1–6. If any other line changed, restore the copy with `cp "{saved path}" "{FEATURE_DIR}/plan.md"`, print `Validation stopped — nothing written.`, report the unexpected lines, print the new session block so the answers are not lost, and end. In every case, delete the saved copy afterwards.

Then edit every phase file that gets a new marker or, on Discard, holds a discarded session's marker. In each, first delete the discarded markers (item 4's rule), then add a marker for every phase-level `revise` question. Use the Edit tool and change no other line. If a phase edit fails, report the markers that are missing; do not roll back `plan.md`.

### Markers

```html
<!-- Updated: Validation Session {N} — {short summary, ≤120 chars} -->
```

A phase marker belongs to the phase file the question is about (`Phase {N}` in the template, or each phase named in the drift rows' Plan Anchors). Put a phase marker on its own line at the end of the phase file. If the file ends with managed delegate sections (canonical `## Delegate Skills` and/or `## Delegate Agents` headings outside fences, with no other `#` or `##` heading after them), put the marker on the line immediately before the first of those trailing headings instead, so it ends the preceding section and stays outside the managed delegate range defined in `delegate-routing-injection.md`. A question about the plan as a whole, or whose phase cannot be resolved, is marked in `plan.md` (item 5).

`{summary}` is the question's `id` + the chosen answer's `label`, truncated. Same sanitizer as Phase 06 (`-->`, `<!--`, `<`, `>`, newline strip; pipe escape).

## 8. Recommendation Output

After the write, print to terminal:

```text
Validation Session {N} — completed — Recommendation: {recommendation}
{total} questions: {a} accepted, {i} implied, {o} override, {s} skip, {u} answered without counsel.
Full Q/A logged in plan.md ## Validation Log.
```

List every `Vn: <text>` answer with the option it was mapped to, and every ignored token or answer.

If `recommendation == spec-update-needed` → also print `Hint: run /tdk-specify update {TASK_ID} to refresh the spec before /tdk-implement.` (auto-invoke deferred to v2).

## Reports

Validation logs live **inline in plan.md** (single source of truth, easier diff
in PRs). Do not create `reports/validate-*.md`. Red-team keeps one final
timestamped report; validation does not need a parallel artifact.
