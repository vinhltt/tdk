import { describe, expect, it } from 'bun:test';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const root = resolve(import.meta.dir, '../../..');
const read = (path: string) => readFileSync(resolve(root, path), 'utf8');

describe('spike phase lifecycle contract', () => {
  it('limits plan generation to executable spike exceptions', () => {
    const output = read('plugins/tdk-core/skills/tdk-plan/references/plan-output-contract.md');
    const design = read('plugins/tdk-core/skills/tdk-plan/references/design-phase.md');
    expect(output).toContain('### Spike phase exception');
    expect(output).toContain('Use `phase_type: spike` only');
    expect(output).toContain('`## Spike Result` initialized with `Status: pending`');
    expect(output).toContain('starts with\n`Status: blocked`');
    expect(design).toContain('Reject research-only, investigate-only, and evaluate-only phases');
  });

  it('validates every phase before status mutation', () => {
    const execution = read('plugins/tdk-core/skills/tdk-implement/references/phase-execution.md');
    expect(execution).toContain('validate-phase-file.ts "{phasePath}"');
    expect(execution).toContain('Validation failure STOPs before status mutation');
    expect(execution).toContain('`--require-result`');
  });

  it('requires approval or replan before dependent work', () => {
    const execution = read('plugins/tdk-core/skills/tdk-implement/references/phase-execution.md');
    const contract = read('plugins/tdk-core/skills/tdk-implement/references/project-and-phase-contract.md');
    expect(execution).toContain('Approve result`, `Replan`, and `Cancel`');
    expect(execution).toContain('resolve-spike-decision.ts');
    expect(execution).toContain('returned in `unblock`');
    expect(execution).toContain('Never unblock a dependent from an unapproved result');
    expect(execution).toContain('mark the spike\n     `blocked`');
    expect(execution.indexOf('Change only phase numbers returned in `unblock`')).toBeLessThan(
      execution.indexOf('mark the spike `done`'),
    );
    expect(execution).toContain('F3\n     recovery anchor');
    expect(execution).toContain('`alreadyUnblocked`');
    expect(contract).toContain('Never offer direct `Mark done` or `Mark skipped`');
  });
});
