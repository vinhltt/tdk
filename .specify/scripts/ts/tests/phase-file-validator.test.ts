import { describe, expect, it } from 'bun:test';
import { validatePhaseFile } from '../src/commands/util/phase-file-validator';
import { resolveSpikeDecisionTransitions } from '../src/commands/util/spike-decision-transitions';

function plan(dependentStatus = 'blocked', spikeStatus = 'todo'): string {
  return `## Phases

| # | File | Status | Blocks | BlockedBy |
|---|---|---|---|---|
| 01 | [phase-01-spike](phases/phase-01-spike.md) | ${spikeStatus} | 02 | - |
| 02 | [phase-02-build](phases/phase-02-build.md) | ${dependentStatus} | - | 01 |
`;
}

function spike(result = 'Status: pending'): string {
  return `---
phase: 1
title: Verify storage approach
phase_type: spike
---

## Spike Objective

Choose a storage approach with measured evidence.

## Experiment

Steps: run \`bun test storage-spike\` against both prototypes and record output.

## Deliverables

Prototype branch, timing table, and recommendation.

## Decision Gate

Approve the winning approach, or replan the dependent implementation phase.

## Spike Result

${result}
`;
}

describe('phase file validator', () => {
  it('keeps legacy normal phases valid', () => {
    const result = validatePhaseFile('# Normal phase\n\n## Implementation Steps\n\n1. Build it.');
    expect(result.valid).toBe(true);
    expect(result.phaseType).toBe('normal');
  });

  it('blocks malformed frontmatter instead of downgrading a spike to normal', () => {
    const result = validatePhaseFile('---\nphase_type: [spike\n---\n\n## Implementation Steps\n\nRun it.');
    expect(result.valid).toBe(false);
    expect(result.errors.some((error) => error.startsWith('Malformed phase frontmatter:'))).toBe(true);
  });

  it('accepts a reproducible spike with blocked downstream work', () => {
    const result = validatePhaseFile(spike(), { planMarkdown: plan(), phaseNumber: 1 });
    expect(result.valid).toBe(true);
    expect(result.dependentPhases).toEqual([2]);
  });

  it('rejects missing spike sections and vague research phases', () => {
    const missing = validatePhaseFile('---\nphase_type: spike\n---\n', { planMarkdown: plan(), phaseNumber: 1 });
    expect(missing.valid).toBe(false);
    expect(missing.errors.some((error) => error.includes('## Experiment'))).toBe(true);

    const vague = validatePhaseFile('---\ntitle: Research options\n---\n\nTake notes.');
    expect(vague.errors).toContain('Research-only phases must use phase_type: spike and define executable deliverables');
  });

  it('requires downstream phases to stay blocked', () => {
    const result = validatePhaseFile(spike(), { planMarkdown: plan('todo'), phaseNumber: 1 });
    expect(result.errors).toContain('Dependent phase 2 must remain blocked until the spike decision is approved');
  });

  it('requires evidence before the spike decision gate', () => {
    const pending = validatePhaseFile(spike(), {
      planMarkdown: plan(),
      phaseNumber: 1,
      requireResult: true,
    });
    expect(pending.valid).toBe(false);

    const recorded = validatePhaseFile(spike('Status: proposed\n\nEvidence: prototype A passed the command.'), {
      planMarkdown: plan(),
      phaseNumber: 1,
      requireResult: true,
    });
    expect(recorded.valid).toBe(true);
  });

  it('unblocks eligible dependents only after approval', () => {
    const approved = resolveSpikeDecisionTransitions(plan(), 1, 'approve');
    expect(approved).toMatchObject({ valid: true, spikeStatus: 'done', unblock: [2], remainBlocked: [] });

    const replanned = resolveSpikeDecisionTransitions(plan(), 1, 'replan');
    expect(replanned).toMatchObject({ valid: true, spikeStatus: 'blocked', unblock: [], remainBlocked: [2] });
  });

  it('resumes an approved partial unblock idempotently', () => {
    const partialPlan = plan('todo', 'in_progress');
    const recorded = spike('Status: approved\n\nEvidence: prototype A passed the command.');
    expect(validatePhaseFile(recorded, { planMarkdown: partialPlan, phaseNumber: 1 }).valid).toBe(true);

    const resumed = resolveSpikeDecisionTransitions(partialPlan, 1, 'approve');
    expect(resumed).toMatchObject({
      valid: true,
      unblock: [],
      alreadyUnblocked: [2],
      remainBlocked: [],
    });
  });

  it('serial-warning parity: an unknown parallel_safe value warns in serial mode and errors in parallel mode', () => {
    const markdown = '---\nparallel_safe: maybe\n---\n\n## Implementation Steps\n\n1. Build it.';

    const serial = validatePhaseFile(markdown);
    expect(serial.valid).toBe(true);
    expect(serial.warnings.some((w) => w.includes('Unknown parallel_safe'))).toBe(true);
    expect(serial.errors.some((e) => e.includes('Unknown parallel_safe'))).toBe(false);

    const parallel = validatePhaseFile(markdown, { validationMode: 'parallel', projectRoot: '/tmp/project' });
    expect(parallel.valid).toBe(false);
    expect(parallel.errors.some((e) => e.includes('Unknown parallel_safe'))).toBe(true);
    expect(parallel.warnings.some((w) => w.includes('Unknown parallel_safe'))).toBe(false);
  });

  it('requires projectRoot when validationMode is parallel', () => {
    const markdown = '# Normal phase\n\n## Implementation Steps\n\n1. Build it.';
    const result = validatePhaseFile(markdown, { validationMode: 'parallel' });
    expect(result.valid).toBe(false);
    expect(result.errors.some((e) => e.toLowerCase().includes('projectroot'))).toBe(true);
  });
});
