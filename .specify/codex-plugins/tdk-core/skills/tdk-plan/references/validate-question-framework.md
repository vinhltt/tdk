# Validate Question Framework

Template-based deterministic question generation (Validation S4 D18). Same plan content + same algorithm → same questions, every run. No LLM creativity in question selection; that's the testability contract.

## Categories

3 tdk-specific layers (highest priority — they cover risk surfaces ck-plan doesn't model) + 5 ck-plan generic categories.

| # | Category | Layer | Detection Keywords |
|---|---|---|---|
| 1 | Constitution  | tdk | `principle`, `YAGNI`, `simplicity`, `standards`, `integrity`, `test-driven`, `i18n` |
| 2 | Memory        | tdk | `memory`, `decision`, `business logic`, `domain`, `entity`, `permission` |
| 3 | SpecKit       | tdk | `spec`, `artifact`, `implement`, `chain`, `dependency`, `contract` |
| 4 | Architecture  | ck  | `approach`, `pattern`, `design`, `API`, `structure`, `database` |
| 5 | Assumptions   | ck  | `assume`, `expect`, `should`, `will`, `must`, `default` |
| 6 | Tradeoffs     | ck  | `tradeoff`, `vs`, `alternative`, `option`, `choice` |
| 7 | Risks         | ck  | `risk`, `might`, `could fail`, `dependency`, `blocker`, `concern` |
| 8 | Scope         | ck  | `phase`, `MVP`, `future`, `out of scope`, `nice to have` |

## Generation Algorithm

```
1. Read persisted `#### Spec-Plan Drift Preflight` rows, plan.md, and every `phases/phase-NN-*.md`.
2. Generate drift questions first from persisted rows:
     group by questionId, preserve D# order, and sort by severity already emitted by the helper.
3. For each generic category:
     hits = sum(content.lowerCase().occurrences(kw)) for kw in category.keywords
4. Drop categories with hits < 2 (false-positive guard — single-word matches don't count).
5. Sort surviving categories by (priority, hits desc) — tdk layers always rank above ck layers when both have hits.
6. Take top min(5, surviving.length) generic categories.
7. For each selected category, instantiate 1–2 questions from the templates below
   (rule: 2 if category has >= 5 hits AND any phase has >= 2 hits in that category;
   else 1).
8. If total < 3 questions → pad with general Coverage / Risks templates to reach 3.
9. No global hard total is applied. Runtime must batch at most 4 questions per AskUserQuestion call and offer Continue / Stop after each batch.
```

Determinism property: identical plan content → identical question set. (Different YAML formatting / whitespace doesn't change keyword counts because the scan is `.toLowerCase()` on the raw text.)

## Spec-Plan Drift Questions

Spec-plan drift rows are produced by `src/commands/util/spec-plan-drift.ts`. They are deterministic facts, not LLM-generated guesses. Question generation consumes the persisted rows in the current `## Validation Log`; resume must not recompute them mid-session.

No global hard total is applied to drift questions because a real plan may have more than 8 material drift findings. To keep the interview usable, batch at most 4 questions, then ask whether to `Continue` or stop and mark the session `partial`.

| Drift Type | Question ID | Option | Action |
|---|---|---|---|
| `missing-fr-coverage` | `speckit.missing_fr_coverage` | spec is stale; add or update spec requirement | `spec-update-needed` |
| `missing-fr-coverage` | `speckit.missing_fr_coverage` | plan needs a phase/task covering this requirement | `revise` |
| `missing-fr-coverage` | `speckit.missing_fr_coverage` | false positive or already covered | `no-op` |
| `plan-only-phase` | `speckit.plan_only_phase` | spec should include this scope | `spec-update-needed` |
| `plan-only-phase` | `speckit.plan_only_phase` | phase is out of scope and should be removed/revised | `revise` |
| `plan-only-phase` | `speckit.plan_only_phase` | accepted follow-up already documented | `no-op` |
| `out-of-scope-contradiction` | `speckit.scope_drift` | spec out-of-scope is correct | `revise` |
| `out-of-scope-contradiction` | `speckit.scope_drift` | plan scope is correct; spec is stale | `spec-update-needed` |
| `out-of-scope-contradiction` | `speckit.scope_drift` | false positive | `no-op` |
| `impact-mismatch` | `speckit.impact_surface_drift` | spec impact surface is stale | `spec-update-needed` |
| `impact-mismatch` | `speckit.impact_surface_drift` | phase related files or scope are wrong | `revise` |
| `impact-mismatch` | `speckit.impact_surface_drift` | false positive | `no-op` |
| `new-entity-or-contract` | `speckit.new_entity_contract` | spec is missing this entity/contract | `spec-update-needed` |
| `new-entity-or-contract` | `speckit.new_entity_contract` | plan introduced the wrong entity/contract | `revise` |
| `new-entity-or-contract` | `speckit.new_entity_contract` | false positive or existing contract | `no-op` |

## Question Templates

Each template defines: `question` body, 3 substantive options + 1 `Skip this question` option, and an `action` field per option that maps to recommendation logic (`no-op | revise | spec-update-needed`).

### Constitution (tdk layer 1)

```yaml
- id: constitution.principles
  question: "Does Phase {N} violate any of the project's binding principles (YAGNI, KISS, DRY, simplicity, test-driven)?"
  options:
    - { label: "All principles honored",                    action: no-op }
    - { label: "Borderline — one principle needs justification", action: revise }
    - { label: "Violation — phase needs revision",          action: revise }
    - { label: "Skip this question",                        action: no-op }
- id: constitution.complexity_justification
  question: "Are all complexity Justifications in plan.md / phase files concrete (not 'maybe later')?"
  options:
    - { label: "Concrete — every justification names a measurable signal", action: no-op }
    - { label: "Mostly concrete — 1–2 are hand-wavy",        action: revise }
    - { label: "Hand-wavy — most justifications lack signals", action: revise }
    - { label: "Skip this question",                          action: no-op }
```

### Memory (tdk layer 2)

```yaml
- id: memory.conflicts
  question: "Has the tdk-memory-agent's report been addressed for every CONFLICT it raised?"
  options:
    - { label: "All CONFLICTs resolved or explicitly accepted in plan.md", action: no-op }
    - { label: "Some CONFLICTs deferred — listed under ## Memory Constraints", action: revise }
    - { label: "Not run yet — Phase 0.guardian skipped",     action: revise }
    - { label: "Skip this question",                         action: no-op }
- id: memory.business_rules
  question: "Do the new business rules in this plan conflict with rules already in `.specify/memory/`?"
  options:
    - { label: "No conflicts — rules are net-new",           action: no-op }
    - { label: "Override — plan supersedes prior rules; documented", action: no-op }
    - { label: "Override — undocumented",                    action: revise }
    - { label: "Skip this question",                         action: no-op }
```

### SpecKit (tdk layer 3)

```yaml
- id: speckit.spec_currency
  question: "Is `spec.md` for this TASK_ID up to date with the plan?"
  options:
    - { label: "Yes — spec was updated alongside or before the plan", action: no-op }
    - { label: "Partially — spec needs minor edit",          action: spec-update-needed }
    - { label: "No — spec is materially out of date",        action: spec-update-needed }
    - { label: "Skip this question",                         action: no-op }
- id: speckit.chain_artifacts
  question: "Will `/tdk-implement` find every artifact it needs (data-model.md, contracts/, quickstart.md, and canonical phase files with test-mode sections when applicable)?"
  options:
    - { label: "Yes — every artifact present or scheduled in a phase", action: no-op }
    - { label: "Partial — 1–2 artifacts deferred",           action: revise }
    - { label: "Missing — chain will break",                 action: revise }
    - { label: "Skip this question",                         action: no-op }
- id: speckit.test_mode_completeness
  question: "For TDD/backfill plans, do phase files apply the Test Case Completeness Rubric, trace every public surface to test rows, and include a Test Quality Gate?"
  options:
    - { label: "Complete — rubric, trace links, gate row statuses, numeric coverage policy source, and non-N/A commands are covered", action: no-op }
    - { label: "Partial — some dimensions, trace links, gate rows, or command evidence missing", action: revise }
    - { label: "Missing — test cases are mostly prose or the Test Quality Gate is absent", action: revise }
    - { label: "Skip this question",                         action: no-op }
```

### Architecture (ck)

```yaml
- id: architecture.approach
  question: "Were 2+ alternative approaches considered before the chosen one?"
  options:
    - { label: "Yes — Decisions Made table lists alternatives + rationale", action: no-op }
    - { label: "Partially — chosen, but alternatives unstated", action: revise }
    - { label: "No — single approach assumed",               action: revise }
    - { label: "Skip this question",                         action: no-op }
```

### Assumptions (ck)

```yaml
- id: assumptions.unstated
  question: "Are there must / should / will claims in the plan that haven't been verified?"
  options:
    - { label: "All verified or marked NEEDS CLARIFICATION", action: no-op }
    - { label: "1–2 claims unverified — minor",              action: revise }
    - { label: "Multiple claims unverified — material risk", action: revise }
    - { label: "Skip this question",                         action: no-op }
```

### Tradeoffs (ck)

```yaml
- id: tradeoffs.documented
  question: "Are tradeoffs surfaced (perf vs simplicity, build vs buy) for the major decisions?"
  options:
    - { label: "Yes — documented per decision",              action: no-op }
    - { label: "Partially — 1–2 decisions lack tradeoff analysis", action: revise }
    - { label: "No — decisions are presented as obvious",    action: revise }
    - { label: "Skip this question",                         action: no-op }
```

### Risks (ck)

```yaml
- id: risks.coverage
  question: "Are top risks per phase identified with mitigation?"
  options:
    - { label: "Yes — every phase has a Risk Assessment table", action: no-op }
    - { label: "Partial — some phases missing",              action: revise }
    - { label: "No — risks not surfaced",                    action: revise }
    - { label: "Skip this question",                         action: no-op }
```

### Scope (ck)

```yaml
- id: scope.boundary
  question: "Is the in-scope vs out-of-scope line explicit?"
  options:
    - { label: "Yes — `## Scope` section + 'Out of scope' notes", action: no-op }
    - { label: "Partial — implied but not written down",      action: revise }
    - { label: "No — scope is fuzzy",                         action: revise }
    - { label: "Skip this question",                          action: no-op }
```

## Coverage Padding

When `selected.length < 3`, add general Risks template + general Scope template until 3 questions. Padding uses the same templates above; never invent new questions.

## Recommendation Emission

```
proceed              if all answered actions == no-op
revise               if any action == revise (and none == spec-update-needed)
spec-update-needed   if any action == spec-update-needed
```

If validation ended via early-exit (cursor < N), recommendation is `partial` regardless of actions seen so far.
