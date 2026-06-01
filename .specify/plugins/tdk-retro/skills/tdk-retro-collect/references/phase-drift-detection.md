# Phase Drift Detection

Phase drift is a semantic difference between planned intent and actual implementation notes.

## Inputs

- `{FEATURE_DIR}/plan.md`
- Phase files linked from the `## Phases` table
- User answer from the drift question

## Method

For each phase:
1. Read the phase row from `plan.md`.
2. Read the linked phase file.
3. Identify intended outcome, related files, and success criteria.
4. Compare against phase content, status, and user feedback.

## Drift Categories

| Category | Meaning |
|---|---|
| rule-gap | Existing project rule did not prevent a mistake. |
| spec-ambiguity | Spec lacked context and caused rework. |
| skill-mismatch | Wrong skill or delegate path was selected. |
| behavior-issue | Agent repeatedly made the same process mistake. |
| external-constraint | Tool, API, or environment forced a change. |
| legitimate-change | Requirement changed; no learning target needed. |

## Output

Record each drift as:

```markdown
- [severity] {summary}
  - Planned: {plan intent}
  - Actual: {actual behavior}
  - Category: {category}
  - Evidence: `{phase-file}`
```

If no drift is found, write `Status: none found`.
