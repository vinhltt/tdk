# Scenario: Quality Review & Analysis

> **When to use**: Before starting implementation or creating a PR, you want to validate that spec, plan, and tasks are consistent and complete.

## Command Sequence

```
/tdk-checklist → /tdk-analyze
```

## Step-by-Step

### 1. Generate a quality checklist (optional, before plan)

```
/tdk-checklist feat-001 security
```

**What happens**: Claude generates a domain-specific checklist (e.g., security, UX, API) that tests your *requirements quality* — not the implementation. Items follow the format: `- [ ] CHK### <question>`.

**Output**: `checklists/security.md` (or `ux.md`, `api.md`, etc.)

You can run this multiple times with different focus areas:

```
/tdk-checklist feat-001 ux
/tdk-checklist feat-001 api
```

### 2. Complete checklist items

Review each checklist item and mark them `[x]` as you verify each requirement is properly specified. Incomplete checklists will trigger a confirmation gate during `/tdk-implement`.

### 3. Run cross-artifact analysis

```
/tdk-analyze feat-001
```

**What happens**: Claude performs 6 detection passes across spec, plan, and tasks:

1. **Duplication** — repeated requirements or tasks
2. **Ambiguity** — vague language or unclear scope
3. **Underspecification** — missing details
4. **Constitution alignment** — violations of project principles
5. **Coverage gaps** — spec requirements not covered in tasks
6. **Inconsistency** — contradictions between artifacts

**Output**: Markdown report with findings table (severity: CRITICAL/HIGH/MEDIUM/LOW), coverage summary, and metrics. No files are modified — strictly read-only.

### 4. Fix issues

If critical findings are reported, Claude offers remediation suggestions. You can approve fixes or address them manually before running `/tdk-implement`.

## Tips

- `analyze` requires spec.md and plan.md.
- Run `analyze` after any manual edits to spec or plan to catch drift.
- Checklist items are "unit tests for requirements" — they validate spec quality, not code.
- Max 50 findings per analysis run. Constitution violations are auto-flagged as CRITICAL.
- After analysis, use `/tdk-implement` to execute the plan's `## Phases` table.
