# tdk-epic-prd Quality Guidelines

Use these checks before reporting `/tdk-epic-prd` completion.

## Source Trace

- Every durable claim should trace to `discovery.md`, `problem.md`,
  `personas.md`, or `mvp-scope.md`.
- Mark inferred claims with confidence: `high`, `medium`, or `low`.
- Low-confidence claims should become assumptions or open questions.
- Do not cite discovery as requirement authority. Child specs own requirements.

## Product Alignment

- Keep `prd.md` compact and decision-oriented.
- Capture user/persona value, current pain, MVP appetite, risks, and no-gos.
- Avoid implementation detail, task wording, technical architecture, and formal
  acceptance criteria.
- Product-wide facts stay with constitution/product context workflows, not epic
  PRD.

## Slice Map

- Use slug slice keys such as `onboard-admin-user` or `export-review-report`.
- Slug slice keys are navigation labels only; they are not requirement IDs.
- No catch-all slices.
- Reject rows whose capability is effectively "all features", "entire MVP",
  "complete platform", "everything", or a similarly bundled scope.
- Each slice should be independently specifiable through child `/tdk-specify`.
- At least one slice should be possible without depending on every other slice.
- Use priority for sequencing, not to define requirement authority.

## Open Questions

- `Blocking Questions` are decisions that block reliable downstream epic design
  or breakdown readiness.
- `Non-Blocking Questions` are useful follow-ups that do not block child spec
  seeding.
- Blocking questions must be reflected in `epic-prd.md` readiness.
- If Blocking Questions are non-empty, the PRD blocks downstream epic design or breakdown readiness.

## Interview Alignment

- Ask only artifact-grounded questions.
- Persist durable answers into `prd.md`, `slice-map.md`, `open-questions.md`, or
  `epic-prd.md`.
- Do not persist raw transcript content.
- Do not add `interview.md`.
