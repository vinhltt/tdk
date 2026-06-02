import { describe, expect, it } from 'bun:test';
import { existsSync, readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';

const PLAN_SKILL = resolve(
  import.meta.dir,
  '../../../plugins/tdk-core/skills/tdk-plan/SKILL.md',
);
const REFERENCES_DIR = resolve(dirname(PLAN_SKILL), 'references');
const PLUGINS_DIR = resolve(import.meta.dir, '../../../plugins');
const MANIFEST = resolve(PLUGINS_DIR, 'manifest.json');
const UTILS_PLANNING_SKILL = resolve(PLUGINS_DIR, 'tdk-utils/skills/planning');

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
    expect(step3c).toContain('`plan.md`, `phases/*.md`, `research/*.md`, `data-model.md`, or `contracts/`');
    expect(step3c).toContain('do not guess or reconstruct the layout');
  });

  it('documents timestamped research report output instead of top-level research.md', () => {
    const outputContract = read(resolve(REFERENCES_DIR, 'plan-output-contract.md'));
    const researchPhase = read(resolve(REFERENCES_DIR, 'research-phase.md'));

    expect(outputContract).toContain('research/');
    expect(outputContract).toContain('yyMMdd-HHmmss-{slug}.md');
    expect(outputContract).not.toContain('researcher-NN-{topic}.md');
    expect(researchPhase).toContain('Spawn `N` `researcher` subagents in parallel');
    expect(researchPhase).toContain('{FEATURE_DIR}/research/yyMMdd-HHmmss-{slug}.md');
    expect(researchPhase).toContain('do not create a top-level `research.md`');
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

  it('does not keep the retired tdk-utils planning skill packaged', () => {
    const manifest = JSON.parse(read(MANIFEST)) as {
      plugins?: Record<string, {
        components?: { skills?: Record<string, unknown> };
        files?: Record<string, unknown>;
      }>;
    };
    const utils = manifest.plugins?.['tdk-utils'];

    expect(existsSync(UTILS_PLANNING_SKILL)).toBe(false);
    expect(utils?.components?.skills ?? {}).not.toHaveProperty('planning');
    expect(Object.keys(utils?.files ?? {})).not.toContain('skills/planning/SKILL.md');
    expect(Object.keys(utils?.files ?? {}).some((file) => file.startsWith('skills/planning/'))).toBe(false);
  });

  it('does not depend on the retired tdk-utils planning references', () => {
    const planFiles = [
      PLAN_SKILL,
      ...extractReferenceLoads(skill).map((referencePath) =>
        resolve(REFERENCES_DIR, referencePath.replace('references/', '')),
      ),
    ];

    for (const planFile of planFiles) {
      const content = read(planFile);
      expect(content).not.toContain('tdk-utils/skills/planning');
      expect(content).not.toContain('planning/references/output-standards.md');
    }
  });
});
