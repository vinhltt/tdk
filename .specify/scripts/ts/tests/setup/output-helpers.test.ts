import { describe, it, expect } from 'bun:test';
import { manualSteps } from '../../src/commands/setup/utils/output-helpers';

function ordinals(output: string): number[] {
  const plain = output.replace(/\x1b\[[0-9;]*m/g, '');
  const matches = [...plain.matchAll(/^(\d+)\./gm)];
  return matches.map((m) => parseInt(m[1] as string, 10));
}

describe('manualSteps()', () => {
  it('gated npm install block present when repomix absent', () => {
    const output = manualSteps(true, false);
    expect(output).toContain('npm install -g repomix');
  });

  it('gated npm install block gone when repomix present', () => {
    const output = manualSteps(true, true);
    expect(output).not.toContain('npm install -g repomix');
  });

  it('/plugin install block present when both claude and repomix found', () => {
    const output = manualSteps(true, true);
    expect(output).toContain('claude plugin install repomix-explorer@repomix');
    expect(output).toContain('claude plugin install repomix-commands@repomix');
  });

  it('/plugin install block present when neither claude nor repomix found', () => {
    const output = manualSteps(false, false);
    expect(output).toContain('claude plugin install repomix-explorer@repomix');
    expect(output).toContain('claude plugin install repomix-commands@repomix');
  });

  it('repomix marketplace add accompanies the install lines in every combination', () => {
    // Without this the printed `claude plugin install …@repomix` cannot resolve, and
    // plugin-register's "see manual steps" warning points at absent remediation.
    for (const claudeFound of [true, false]) {
      for (const repomixFound of [true, false]) {
        const output = manualSteps(claudeFound, repomixFound);
        expect(output).toContain('claude plugin marketplace add https://github.com/yamadashy/repomix');
      }
    }
  });

  it('ordinals sequential with no gaps or duplicates across all four combinations', () => {
    // 4 unconditional blocks + 2 blocks gated on !claudeFound + 1 block gated on !repomixFound
    const expectedCount: Record<string, number> = {
      'true,true': 4,
      'true,false': 5,
      'false,true': 6,
      'false,false': 7,
    };
    for (const claudeFound of [true, false]) {
      for (const repomixFound of [true, false]) {
        const output = manualSteps(claudeFound, repomixFound);
        const nums = ordinals(output);
        expect(nums.length).toBe(expectedCount[`${claudeFound},${repomixFound}`] as number);
        expect(nums).toEqual(Array.from({ length: nums.length }, (_, i) => i + 1));
      }
    }
  });
});
