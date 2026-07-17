import { afterEach, describe, expect, it } from 'bun:test';
import { existsSync, mkdtempSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { planArtifactMigration } from '../src/commands/util/artifact-migration-planner';
import {
  applyArtifactMigration,
  findPendingArtifactMigration,
  rollbackArtifactMigration,
} from '../src/commands/util/artifact-migration-transaction';

const tempDirs: string[] = [];

function qualityGate(): string {
  return `## Specification Quality Gate

| Field | Value |
|---|---|
| Status | pass |
| Iterations | 1 |
| Source | tdk-clarify |
| Last Checked | 2026-07-17 12:00 |

### Blocking Issues

None.
`;
}

function createFeature(options: { secondOwner?: boolean; status?: string } = {}): string {
  const featureDir = mkdtempSync(join(tmpdir(), 'tdk-artifact-migration-'));
  tempDirs.push(featureDir);
  mkdirSync(join(featureDir, 'phases'));
  mkdirSync(join(featureDir, 'checklists'));
  mkdirSync(join(featureDir, 'contracts'));
  writeFileSync(join(featureDir, 'spec.md'), `# Spec\n\n${qualityGate()}`);
  writeFileSync(join(featureDir, 'checklists', 'requirements.md'), '# Legacy checklist\n\n- [x] Complete\n');
  writeFileSync(join(featureDir, 'data-model.md'), '# Legacy data model\n\nEntity: Order\n');
  writeFileSync(join(featureDir, 'quickstart.md'), '# Legacy quickstart\n\nRun the API check.\n');
  writeFileSync(join(featureDir, 'contracts', 'api.md'), '# Legacy API prose\n\nPOST /orders\n');
  writeFileSync(join(featureDir, 'plan.md'), `# Plan

Quality authority: [legacy checklist](checklists/requirements.md).

## Phases

| # | File | Status | Blocks | BlockedBy |
|---|---|---|---|---|
| 01 | [phase-01-schema](phases/phase-01-schema.md) | ${options.status ?? 'todo'} | 02 | - |
| 02 | [phase-02-api](phases/phase-02-api.md) | todo | - | 01 |
`);
  writeFileSync(join(featureDir, 'phases', 'phase-01-schema.md'), `# Schema

## Requirements

Migrate \`data-model.md\`.

## Data Model

Pending.
`);
  writeFileSync(join(featureDir, 'phases', 'phase-02-api.md'), `# API

## Requirements

${options.secondOwner ? 'Also consume `data-model.md`.' : 'Implement API.'} Migrate \`quickstart.md\` and \`contracts/api.md\`.

## Interfaces & Contracts

Pending.

## Verification / Runbook

Pending.
`);
  return featureDir;
}

afterEach(() => {
  for (const dir of tempDirs.splice(0)) rmSync(dir, { recursive: true, force: true });
});

describe('plan artifact migration', () => {
  it('produces a mutation-free dry-run with deterministic owners', () => {
    const featureDir = createFeature();
    const plan = planArtifactMigration(featureDir);

    expect(plan.errors).toEqual([]);
    expect(plan.operations.map((operation) => operation.kind)).toEqual([
      'data-model',
      'quickstart',
      'legacy-checklist',
      'prose-contract',
    ]);
    expect(plan.operations[0]).toMatchObject({
      ownerPhaseNumber: 1,
      targetSection: '## Data Model',
      deleteAfterValidation: true,
    });
    expect(plan.operations[0]!.validations).toContain('plan phase statuses remain unchanged');
    expect(existsSync(join(featureDir, 'data-model.md'))).toBe(true);
  });

  it('stages, validates, deletes, and becomes idempotent', () => {
    const featureDir = createFeature();
    const manifest = applyArtifactMigration(planArtifactMigration(featureDir), { yes: true });

    expect(manifest.state).toBe('committed');
    expect(existsSync(join(featureDir, 'data-model.md'))).toBe(false);
    expect(existsSync(join(featureDir, 'quickstart.md'))).toBe(false);
    expect(existsSync(join(featureDir, 'contracts', 'api.md'))).toBe(false);
    expect(existsSync(join(featureDir, 'checklists', 'requirements.md'))).toBe(false);
    expect(readFileSync(join(featureDir, 'phases', 'phase-01-schema.md'), 'utf8')).toContain(
      '<!-- migrated-from: data-model.md -->',
    );
    const migratedPlan = readFileSync(join(featureDir, 'plan.md'), 'utf8');
    expect(migratedPlan).toContain('[legacy checklist](spec.md#specification-quality-gate)');
    expect(migratedPlan).not.toContain('checklists/requirements.md');
    const rerun = planArtifactMigration(featureDir);
    expect(rerun.operations).toEqual([]);
    expect(rerun.warnings).toContain('No legacy artifacts found; migration is already complete');
  });

  it('blocks ambiguous owners and started owner phases', () => {
    const ambiguous = planArtifactMigration(createFeature({ secondOwner: true }));
    expect(ambiguous.errors).toContain('data-model.md: expected exactly one owner phase, found 2');

    const started = planArtifactMigration(createFeature({ status: 'in_progress' }));
    expect(started.errors.some((error) => error.includes('owner phase 1 is in_progress'))).toBe(true);
  });

  it('leaves a recoverable manifest after interruption and rolls back cleanly', () => {
    const featureDir = createFeature();
    expect(() => applyArtifactMigration(planArtifactMigration(featureDir), {
      yes: true,
      interruptAfterWrites: true,
    })).toThrow('SIMULATED_INTERRUPT');

    const pending = findPendingArtifactMigration(featureDir);
    expect(pending).not.toBeNull();
    const rolledBack = rollbackArtifactMigration(pending!);
    expect(rolledBack.state).toBe('rolled_back');
    expect(existsSync(join(featureDir, 'data-model.md'))).toBe(true);
    expect(readFileSync(join(featureDir, 'phases', 'phase-01-schema.md'), 'utf8')).not.toContain(
      '<!-- migrated-from: data-model.md -->',
    );
  });

  it('rolls back when interrupted after intended hashes persist but before writes', () => {
    const featureDir = createFeature();
    expect(() => applyArtifactMigration(planArtifactMigration(featureDir), {
      yes: true,
      interruptAfterPrepare: true,
    })).toThrow('SIMULATED_INTERRUPT');

    const pending = findPendingArtifactMigration(featureDir);
    expect(pending).not.toBeNull();
    const rolledBack = rollbackArtifactMigration(pending!);
    expect(rolledBack.state).toBe('rolled_back');
    expect(existsSync(join(featureDir, 'data-model.md'))).toBe(true);
    expect(readFileSync(join(featureDir, 'phases', 'phase-01-schema.md'), 'utf8')).not.toContain(
      '<!-- migrated-from: data-model.md -->',
    );
  });

  it('requires explicit deletion confirmation', () => {
    const featureDir = createFeature();
    expect(() => applyArtifactMigration(planArtifactMigration(featureDir), { yes: false })).toThrow(
      'explicit confirmation',
    );
  });

  it('never fabricates a quality gate to remove a legacy checklist', () => {
    const featureDir = createFeature();
    writeFileSync(join(featureDir, 'spec.md'), '# Legacy spec without gate\n');
    const plan = planArtifactMigration(featureDir);
    expect(plan.errors).toContain(
      'Legacy checklist cannot be removed until /tdk-clarify writes a valid embedded Specification Quality Gate',
    );
  });
});
