import { afterEach, describe, expect, it } from 'bun:test';
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { analyzeSpecPlanDrift } from '../src/commands/util/spec-plan-drift';

const CLI = resolve(import.meta.dir, '../src/commands/util/spec-plan-drift.ts');

const specMd = `# Feature Spec

## 2. Scope Boundary

- In scope: profile export and audit email.
- Out of scope: payment processing and invoice collection.

## 3. Impact Surface

| Tag | Files |
|---|---|
| [backend/api] | src/api/profile.ts |
| [billing] | src/billing/invoices.ts |

## 6. Functional Requirements

- FR-001 [backend/api]: Export user profile data through the profile API.
- FR-002 [email]: Send audit email after profile export completes.
- FR-003 [billing]: Collect payment invoices for paid accounts.
- FR-004 [reports]: Generate monthly usage reports.

## 7. Success Criteria

- Profile export succeeds from the API.
`;

const planMd = `# Plan

## Phases

| # | File | Status | Blocks | BlockedBy |
|---|------|--------|--------|-----------|
| 01 | [Export API](phases/phase-01-export-api.md) | todo | - | - |
| 02 | [Payment Worker](phases/phase-02-payment-worker.md) | todo | - | - |
| 03 | [Audit Email](phases/phase-03-audit-email.md) | todo | - | - |
| 04 | [Team Contract](phases/phase-04-team-contract.md) | todo | - | - |
`;

const phases = [
  {
    path: 'phases/phase-01-export-api.md',
    content: `# Phase 1

## Requirements

- Implement FR-001 [backend/api] profile export endpoint.
`,
  },
  {
    path: 'phases/phase-02-payment-worker.md',
    content: `# Phase 2

## Requirements

- Implement payment processing and invoice collection worker for paid accounts.
`,
  },
  {
    path: 'phases/phase-03-audit-email.md',
    content: `# Phase 3

## Requirements

- Implement FR-002 [email] audit email sender.
`,
  },
  {
    path: 'phases/phase-04-team-contract.md',
    content: `# Phase 4

## Requirements

- Add TeamContract schema and persistence model for workspace membership.
`,
  },
];

describe('spec-plan drift analyzer', () => {
  let tempDir: string | undefined;

  afterEach(() => {
    if (tempDir) rmSync(tempDir, { recursive: true, force: true });
    tempDir = undefined;
  });

  it('emits stable findings for the supported drift types', () => {
    const result = analyzeSpecPlanDrift({ specMd, planMd, phases });

    expect(result.ok).toBe(true);
    const rows = result.findings.map(({ id, type, severity, suggestedAction, questionId }) =>
      ({ id, type, severity, suggestedAction, questionId }));
    expect(rows).toEqual([
      { id: 'D1', type: 'out-of-scope-contradiction', severity: 'critical', suggestedAction: 'revise', questionId: 'speckit.scope_drift' },
      { id: 'D2', type: 'missing-fr-coverage', severity: 'high', suggestedAction: 'spec-update-needed', questionId: 'speckit.missing_fr_coverage' },
      { id: 'D3', type: 'plan-only-phase', severity: 'medium', suggestedAction: 'revise', questionId: 'speckit.plan_only_phase' },
      { id: 'D4', type: 'impact-mismatch', severity: 'medium', suggestedAction: 'spec-update-needed', questionId: 'speckit.impact_surface_drift' },
      { id: 'D5', type: 'new-entity-or-contract', severity: 'medium', suggestedAction: 'spec-update-needed', questionId: 'speckit.new_entity_contract' },
    ]);
    expect(result.findings[0]?.planAnchor).toBe('phases/phase-02-payment-worker.md:1');
  });

  it('is deterministic for identical inputs', () => {
    const first = analyzeSpecPlanDrift({ specMd, planMd, phases });
    const second = analyzeSpecPlanDrift({ specMd, planMd, phases });

    expect(second).toEqual(first);
  });

  it('groups findings into deterministic question batches by question id', () => {
    const result = analyzeSpecPlanDrift({ specMd, planMd, phases });

    expect(result.questionGroups).toEqual([
      {
        questionId: 'speckit.scope_drift',
        findingIds: ['D1'],
        actionOptions: ['revise', 'spec-update-needed', 'no-op'],
      },
      {
        questionId: 'speckit.missing_fr_coverage',
        findingIds: ['D2'],
        actionOptions: ['spec-update-needed', 'revise', 'no-op'],
      },
      {
        questionId: 'speckit.plan_only_phase',
        findingIds: ['D3'],
        actionOptions: ['spec-update-needed', 'revise', 'no-op'],
      },
      {
        questionId: 'speckit.impact_surface_drift',
        findingIds: ['D4'],
        actionOptions: ['spec-update-needed', 'revise', 'no-op'],
      },
      {
        questionId: 'speckit.new_entity_contract',
        findingIds: ['D5'],
        actionOptions: ['spec-update-needed', 'revise', 'no-op'],
      },
    ]);
  });

  it('rejects malformed plan artifacts', () => {
    expect(() => analyzeSpecPlanDrift({ specMd, planMd: '# Plan without phases', phases }))
      .toThrow('## Phases section not found');
  });

  it('rejects missing canonical phase artifacts', () => {
    expect(() => analyzeSpecPlanDrift({ specMd, planMd, phases: phases.slice(0, -1) }))
      .toThrow("missing phase artifact 'phases/phase-04-team-contract.md'");
  });

  it('prints JSON from the CLI without treating drift as process failure', async () => {
    tempDir = mkdtempSync(join(tmpdir(), 'spec-plan-drift-'));
    const phasesDir = join(tempDir, 'phases');
    mkdirSync(phasesDir);
    writeFileSync(join(tempDir, 'spec.md'), specMd, 'utf-8');
    writeFileSync(join(tempDir, 'plan.md'), planMd, 'utf-8');
    for (const phase of phases) {
      writeFileSync(join(tempDir, phase.path), phase.content, 'utf-8');
    }

    const proc = Bun.spawn(['bun', CLI, '--spec', join(tempDir, 'spec.md'), '--plan', join(tempDir, 'plan.md'), '--phases-root', phasesDir, '--json'], {
      stdout: 'pipe',
      stderr: 'pipe',
    });
    const [stdout, stderr, exitCode] = await Promise.all([
      new Response(proc.stdout).text(),
      new Response(proc.stderr).text(),
      proc.exited,
    ]);

    expect(stderr).toBe('');
    expect(exitCode).toBe(0);
    expect(JSON.parse(stdout).summary.total).toBe(5);
  });
});
