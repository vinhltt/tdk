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
Emit the YAML frontmatter block at the top with `title`, `status`, `branch`, `created`, `input`, `memory_context_loaded`, and `schema_version: 1`.
Keep `# Feature Specification: <title>` directly below closing `---`.

Promote case:

- If description was seeded from a parent work-item, emit `parent_spec: <[folder/]ticket>` and `promoted_from: "<work-item-id>"`.
- Include category folder when parent is non-default, e.g. `test/aa-100`.
- Confirm parent spec directory exists before writing child; advisory only because `/tdk-plan` enforces hard STOP.
- Omit both fields for a root spec. See `.specify/docs/en/guides/promote-convention.md`.

## Step 2.5: Optional Interview Alignment Gate

If `SPEC_INTERVIEW=true`, run the interview after the draft `spec.md` is written
for creation, or after current `spec.md` is read for `SPEC_REPLAY_INTERVIEW=true`,
and before unresolved-question handling:

1. Load `../_shared/interview-alignment-protocol.md`.
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

1. Create `FEATURE_DIR/checklists/requirements.md` from the "## Checklist Template" in `references/spec-quality-guidelines.md`.
2. Run validation against every checklist item.
3. For each item, mark pass/fail and document specific issues with quoted spec sections.
4. If all items pass, mark checklist complete and proceed to Step 6.
5. If items fail:
   - List failing items and specific issues.
   - Update spec to address each issue.
   - Re-run validation until all pass, max 3 iterations.
   - If still failing after 3 iterations, document remaining issues in checklist notes and warn user.
6. Update checklist after each validation iteration.

## Step 6: Report Completion

Report:

- Branch name and spec file path.
- Checklist results, pass/fail summary.
- Impact Surface summary: N subworkspaces, M modules touched.
- Unresolved Questions count from `## 9. Unresolved Questions`; 0 if all resolved.
- Mode used: `SPEC_MODE` (`MODE_SOURCE`).
- Interview alignment: `creation`, `existing artifact`, or `disabled`.
- Readiness for next phase: `/tdk-clarify` or `/tdk-plan`.
