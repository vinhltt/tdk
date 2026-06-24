import { describe, expect, it } from 'bun:test';
import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs';
import { join, resolve } from 'node:path';

const CORE_SKILLS_DIR = resolve(import.meta.dir, '../../../plugins/tdk-core/skills');

type SkillContract = {
  name: string;
  references: string[];
  template: string;
  requiredSections: string[];
  loadPhrases: string[];
};

const GREENFIELD: SkillContract = {
  name: 'tdk-greenfield-start',
  references: [
    'references/workflow-full.md',
    'references/workflow-quick.md',
    'references/workflow-unknown.md',
    'references/inception-question-taxonomy.md',
    'references/project-inception-output-contract.md',
  ],
  template: 'templates/project-inception.md.tpl',
  requiredSections: [
    '## Readiness Status',
    '## Interview Summary',
    '## Assumptions',
    '## Unresolved Questions',
    '## Recommended Next Route',
  ],
  loadPhrases: ['Load shared references before writing', 'Load exactly one mode workflow'],
};

const BROWNFIELD: SkillContract = {
  name: 'tdk-brownfield-start',
  references: [
    'references/workflow-full.md',
    'references/workflow-config-only.md',
    'references/workflow-unknown.md',
    'references/repo-evidence-taxonomy.md',
    'references/brownfield-onboarding-output-contract.md',
  ],
  template: 'templates/brownfield-onboarding.md.tpl',
  requiredSections: [
    '## Readiness Status',
    '## Observed Evidence',
    '## Inferred Recommendations',
    '## Assumptions',
    '## Unresolved Repo Questions',
    '## Recommended Next Route',
  ],
  loadPhrases: ['Load shared references before writing', 'Load exactly one mode workflow'],
};

const FORBIDDEN_RUNTIME_REFERENCES = [
  'ck:bootstrap',
  '.agents/skills/bootstrap',
  'workflow-auto.md',
  '/ck:plan',
  '/ck:cook',
];

function skillDir(name: string): string {
  return resolve(CORE_SKILLS_DIR, name);
}

function read(path: string): string {
  return readFileSync(path, 'utf-8');
}

function walkFiles(dir: string): string[] {
  return readdirSync(dir).flatMap((entry) => {
    const path = join(dir, entry);
    return statSync(path).isDirectory() ? walkFiles(path) : [path];
  });
}

function assertSkillContract(contract: SkillContract): void {
  const dir = skillDir(contract.name);
  const skill = read(join(dir, 'SKILL.md'));

  for (const reference of contract.references) {
    const path = join(dir, reference);
    expect(existsSync(path)).toBe(true);
    expect(skill).toContain(reference);
  }

  const templatePath = join(dir, contract.template);
  const template = read(templatePath);
  expect(existsSync(templatePath)).toBe(true);
  expect(skill).toContain(contract.template);

  for (const phrase of contract.loadPhrases) {
    expect(skill).toContain(phrase);
  }

  for (const section of contract.requiredSections) {
    expect(template).toContain(section);
  }
}

function assertNoForbiddenReferences(contract: SkillContract): void {
  const dir = skillDir(contract.name);
  const combined = walkFiles(dir)
    .filter((path) => path.endsWith('.md') || path.endsWith('.tpl'))
    .map((path) => read(path))
    .join('\n');

  for (const forbidden of FORBIDDEN_RUNTIME_REFERENCES) {
    expect(combined).not.toContain(forbidden);
  }
}

describe('TDK inception workflow depth contracts', () => {
  it('requires greenfield mode references, taxonomy, output contract, and template', () => {
    assertSkillContract(GREENFIELD);
  });

  it('requires brownfield mode references, taxonomy, output contract, and template', () => {
    assertSkillContract(BROWNFIELD);
  });

  it('keeps runtime start skills TDK-native with no CK workflow hard references', () => {
    assertNoForbiddenReferences(GREENFIELD);
    assertNoForbiddenReferences(BROWNFIELD);
  });
});
