import { describe, expect, it } from 'bun:test';
import { existsSync, readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';

const PLAN_SKILL = resolve(
  import.meta.dir,
  '../../../plugins/tdk-core/skills/tdk-plan/SKILL.md',
);
const REFERENCES_DIR = resolve(dirname(PLAN_SKILL), 'references');

function read(path: string): string {
  return readFileSync(path, 'utf-8');
}

function extractStep3c(skill: string): string {
  const start = skill.indexOf('#### 3c');
  expect(start).toBeGreaterThanOrEqual(0);

  const nextSection = skill.indexOf('\n### ', start + 1);
  return nextSection === -1 ? skill.slice(start) : skill.slice(start, nextSection);
}

function extractReferenceLoads(skill: string): string[] {
  return Array.from(skill.matchAll(/Load:\s*`(references\/[^`]+\.md)`/g), (match) => {
    const referencePath = match[1];
    expect(referencePath).toBeDefined();
    return referencePath as string;
  });
}

describe('tdk-plan reference contract', () => {
  const skill = read(PLAN_SKILL);
  const step3c = extractStep3c(skill);

  it('loads the merged plan output contract in Step 3c', () => {
    expect(step3c).toContain('Load: `references/plan-output-contract.md`');
  });

  it('does not load old split output references in Step 3c', () => {
    expect(step3c).not.toContain('Load: `references/plan-organization.md`');
    expect(step3c).not.toContain('Load: `references/output-standards.md`');
  });

  it('hard-gates plan artifact writes on loading the output contract', () => {
    expect(step3c).toContain('STOP before writing');
    expect(step3c).toContain('`plan.md`, `phases/*.md`, `research.md`, `data-model.md`, or `contracts/`');
    expect(step3c).toContain('do not guess or reconstruct the layout');
  });

  it('defines deterministic required-reference loading behavior', () => {
    expect(skill).toContain('## Required Reference Load Contract');
    expect(skill).toContain('SKILL_BASE_DIR');
    expect(skill).toContain('expected absolute path');
    expect(skill).toContain('current step');
    expect(skill).toContain('begins with `<!-- DO NOT LOAD`');
  });

  it('only loads internal references that exist and are not stubs', () => {
    for (const referencePath of extractReferenceLoads(skill)) {
      const absolutePath = resolve(REFERENCES_DIR, referencePath.replace('references/', ''));

      expect(existsSync(absolutePath), `${referencePath} should exist`).toBe(true);
      expect(read(absolutePath).split('\n')[0]).not.toStartWith('<!-- DO NOT LOAD');
    }
  });
});
