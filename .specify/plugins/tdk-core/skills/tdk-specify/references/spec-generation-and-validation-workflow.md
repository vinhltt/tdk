# Spec Generation And Validation Workflow

Use this reference for `/tdk-specify` Steps 2, 2.5, 3, 5, and 6.

## Step 2: Specification Generation (9-Section Format)

If `SPEC_REPLAY_INTERVIEW=true`, skip spec generation, read the current
`spec.md`, then continue to Step 2.5. Do not create, rewrite, or seed a new
spec before the existing artifact interview.

For normal creation:

1. Parse user description from Input. If empty, ERROR "No feature description provided".
2. Extract key concepts: actors, actions, data, constraints.
3. If `SPEC_MODE = full`, apply embedded brainstorming at every scope boundary decision:
   - Is this core to the feature? In scope.
   - Is this a future enhancement? Out of scope, note as future.
   - Are there multiple interpretations? Generate alternatives, recommend one.
   - Apply YAGNI: if uncertain, default to out-of-scope with rationale.
4. If `SPEC_MODE = fast`, apply direct YAGNI/KISS reasoning without multi-option comparison.

Generate all 9 sections in order:

1. `## 1. Problem Statement`
   - Extract concrete problem, affected users, and why now.
   - If the description comes from a `tasks-breakdown` seed, summarize that child seed's problem context.
   - Do not read parent discovery as direct spec context. Reject vague statements such as "improve UX".
2. `## 2. Scope Boundary`
   - Include >=1 in-scope and >=1 out-of-scope item with rationale.
   - Full mode: brainstorm each scope decision.
   - Fast mode: direct YAGNI/KISS reasoning.
3. `## 3. Impact Surface`
   - Insert `IMPACT_SURFACE` table from Step 1.5.
   - If monolith: "N/A — monolith project".
4. `## 4. Evaluated Approaches`
   - Use current full/fast behavior from the explicit description or child seed.
   - Full mode: 2-3 scope-level options. No tech/framework/library mentions.
   - Fast mode: single recommended scope. No tech/framework/library mentions.
5. `## 5. User Requirements & Testing`
   - P1/P2/P3 prioritization, Independent Test, Given/When/Then acceptance scenarios.
   - Tag each UR with `[subworkspace/module]` from `IMPACT_SURFACE`.
   - Skip tags if `IMPACT_SURFACE` is empty. Include Edge Cases subsection.
6. `## 6. Functional Requirements`
   - FR-001 format, tag with `[subworkspace/module]`.
   - Include Key Entities subsection.
   - No inline [NEEDS CLARIFICATION] markers; move all to `## 9. Unresolved Questions`.
7. `## 7. Success Criteria`
   - Measurable, technology-agnostic outcomes.
   - No frameworks, languages, databases. Keep section name "Success Criteria".
8. `## 8. Risks & Mitigations`
   - Identify risks from scope decisions, multi-subworkspace coordination, data model complexity.
   - Table format: Risk | Impact | Mitigation.
9. `## 9. Unresolved Questions`
   - Numbered list with `Recommend: [suggestion]`.
   - No max limit. Continue asking until requirements are clear.
   - Write "None" if all clear.

Append `## Clarifications` at the end, reserved for `/tdk-clarify`.

Write `SPEC_FILE` using `.specify/templates/spec-template.md.tpl`, preserving section order and headings.
Emit the YAML frontmatter block at the top with `title`, `status`, `feature_branch`, `milestone_branch`, `created`, `input`, `memory_context_loaded`, `memory_validation` (only when the memory-validation gate produced a decision — see the gate in `SKILL.md`; omit the key otherwise), and `schema_version: 1`.
Keep `# Feature Specification: <title>` directly below closing `---`.

Set `feature_branch` to the starting value `<defaultFolder>/<TICKET_ID>` — the same form the branch warning
computes. It is a starting value only: `/tdk-implement` presents it as an editable suggestion and enforces no
format on what the user types. Never leave the title placeholder in `feature_branch`.

`feature_branch` names the branch created *for* this task. The branch it is created *from* is a separate
per-repository base ref, settled at `/tdk-implement` and recorded in `git-map.md`; it never appears here.

Seed `milestone_branch` from the root workspace repo's current branch with
`git -C "$PROJECT_DIR" branch --show-current`, anchored at the project root so a session opened inside a
sub-workspace does not record that sub-repository's branch instead. This read is observational —
`/tdk-specify` still creates and switches no branch. When the result is empty, as on a detached HEAD, write
the placeholder instead; branch preflight then treats it as missing and asks.

### Confirming `milestone_branch`

`milestone_branch` records the milestone or epic this task belongs to. `/tdk-implement` compares the root
workspace repo's live branch against it to catch a task being implemented under the wrong milestone. It is
neither the branch created for the task (`feature_branch`) nor the base ref each sub-workspace branches from
(per repository, settled at Step 6A, stored in `git-map.md`).

The seed is observed from the root repo, but the value is a **declaration of intent** — a user who is
deliberately specifying work for a milestone other than the one currently checked out corrects it here.

**When `PROJECT_CONTEXT.subWorkspaces` is non-empty, confirm the detected value with one `AskUserQuestion`
before writing the frontmatter.** State plainly what is being recorded and what is not, so the distinction is
settled at the moment the value is captured rather than discovered later:

```json
{
  "questions": [{
    "question": "Record 'epic-1' as milestone_branch — the milestone/epic this task belongs to? Seeded from the root workspace repo's current branch. /tdk-implement compares the root repo against it to catch work landing under the wrong milestone. It is NOT the branch created for the task (feature_branch), and NOT the base branch sub-workspaces (api, web) branch from — that is confirmed per repo at /tdk-implement.",
    "header": "Root branch",
    "options": [
      {"label": "Yes, record epic-1", "description": "This task belongs to the milestone the root repo is on"},
      {"label": "Let me enter another", "description": "This task belongs to a different milestone — enter it via Other"}
    ],
    "multiSelect": false
  }]
}
```

**Skip the confirmation when `subWorkspaces` is empty or absent.** The cross-epic guard it feeds is itself a
no-op on single-repository projects, so asking there adds a prompt that can change nothing. Phrase the check
as "empty or absent": config loading always sets `subWorkspaces` to `[]` when unset, so a missing-key test
never fires.

Replay (`SPEC_REPLAY_INTERVIEW=true`) writes no frontmatter and therefore never asks.

Promote case:

- If description was seeded from a parent work-item, emit `parent_spec: <[folder/]ticket>` and `promoted_from: "<work-item-id>"`.
- Include category folder when parent is non-default, e.g. `test/aa-100`.
- Confirm parent spec directory exists before writing child; advisory only because `/tdk-plan` enforces hard STOP.
- Omit both fields for a root spec. See `.specify/docs/en/guides/promote-convention.md`.

## Step 2.5: Optional Interview Alignment Gate

If `SPEC_INTERVIEW=true`, run the interview after the draft `spec.md` is written
for creation, or after current `spec.md` is read for `SPEC_REPLAY_INTERVIEW=true`,
and before unresolved-question handling:

1. Load `.specify/_shared/skills/interview-alignment-protocol.md`.
2. Read current `spec.md` and build an internal claim map from sections 1-9 and `## Clarifications`.
3. Ask 4-6 artifact-grounded questions, one at a time, covering problem, scope, impact surface, top UR/FR/entity, success criteria, risk, and unresolved questions.
4. For each answer, record classification: `aligned`, `mismatch`, or `unclear`.

Integration rules:

- Problem mismatch -> update `## 1. Problem Statement`.
- Scope mismatch -> update `## 2. Scope Boundary`.
- Impact mismatch -> update `## 3. Impact Surface`.
- UR/FR/entity mismatch -> update `## 5. User Requirements & Testing` or `## 6. Functional Requirements`.
- Success or risk mismatch -> update `## 7. Success Criteria` or `## 8. Risks & Mitigations`.
- Unclear answer -> add or retain an item in `## 9. Unresolved Questions` with `Recommend:`.
- Significant accepted decision -> append concise bullet under `## Clarifications`.

Any critical mismatch must be integrated into the relevant section or explicitly
accepted as unresolved before continuing. Do not persist a raw transcript. After
the interview, continue to Step 3 so remaining unresolved questions use the
existing resolution loop.

## Step 3: Handle Unresolved Questions

After writing spec, check `## 9. Unresolved Questions`:

- If "None": skip to Step 5.
- For each question, present via AskUserQuestion with context quote, question, suggested answers table, and custom option.
- Present all questions together before waiting for responses.
- Wait for user response.
- Update `## 9. Unresolved Questions`: replace resolved questions with chosen answers integrated into relevant section.
- Re-check: if new questions arose, add to `## 9. Unresolved Questions` and repeat.
- Continue until `## 9. Unresolved Questions` reads "None" or user explicitly accepts remaining questions.

## Step 5: Specification Quality Validation

After writing the spec and resolving unresolved questions:

1. Run every validation dimension in `references/spec-quality-guidelines.md`.
2. For each failure, record a concise issue anchored to the affected spec section.
3. If all dimensions pass, write `Status: pass` and proceed to Step 6.
4. If only non-blocking cautions remain, write `Status: warn` and
   `Blocking Issues: None.`.
5. If blocking dimensions fail:
   - List failing items and specific issues.
   - Update spec to address each issue.
   - Re-run validation until all pass, max 3 iterations.
   - If still failing after 3 iterations, write `Status: fail`, list remaining
     issues under `### Blocking Issues`, warn the user, and do not recommend
     `/tdk-plan`.
6. Write or replace only the heading-bounded `## Specification Quality Gate`
   block using the contract in `references/spec-quality-guidelines.md`. Set
   `Source` to `tdk-specify`; do not create `checklists/requirements.md` for a
   new spec.

## Step 6: Report Completion

Report:

- Branch name and spec file path.
- Embedded quality-gate status and iteration count.
- Impact Surface summary: N subworkspaces, M modules touched.
- Unresolved Questions count from `## 9. Unresolved Questions`; 0 if all resolved.
- Mode used: `SPEC_MODE` (`MODE_SOURCE`).
- Interview alignment: `creation`, `existing artifact`, or `disabled`.
- Readiness for next phase: `/tdk-clarify` or `/tdk-plan`.
