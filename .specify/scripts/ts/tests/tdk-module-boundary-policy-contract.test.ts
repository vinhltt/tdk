import { describe, expect, it } from 'bun:test';
import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs';
import { join, resolve } from 'node:path';

const INCEPTION_SKILLS_DIR = resolve(import.meta.dir, '../../../plugins/tdk-inception/skills');
const UTILS_SKILLS_DIR = resolve(import.meta.dir, '../../../plugins/tdk-utils/skills');
const CORE_SKILLS_DIR = resolve(import.meta.dir, '../../../plugins/tdk-core/skills');
const DOCS_DIR = resolve(import.meta.dir, '../../../docs/en/guides');
const MANIFEST_PATH = resolve(import.meta.dir, '../../../plugins/manifest.json');
const README_PATH = resolve(import.meta.dir, '../../../../README.md');
const POLICY_NAME = 'tdk-workspace-dependency-policy';
const LEGACY_POLICY_NAME = 'tdk-module-boundary-policy';

const REQUIRED_REFERENCES = [
  'references/workspace-dependency-policy-output-contract.md',
  'references/enforcement-snippet-catalog.md',
  'references/ecosystem-boundary-candidates.md',
  'references/workflow-standard.md',
  'references/workflow-audit.md',
  'references/workflow-suggest.md',
];

const REQUIRED_TEMPLATES = [
  'templates/workspace-dependency-policy.md.tpl',
  'templates/enforcement-snippets.md.tpl',
];

const REQUIRED_POLICY_SECTIONS = [
  '## Evidence Inputs',
  '## Boundary Inventory',
  '## Dependency Matrix',
  '## Allowed Edges',
  '## Forbidden Edges',
  '## Stack Support',
  '## Enforcement Snippets',
  '## Confidence',
  '## Risks',
  '## Recommended Next Route',
  '## Unresolved Questions',
];

const FORBIDDEN_POLICY_PROMISES = [
  'automatically apply',
  'writes eslint config',
  'writes nx config',
  'writes turbo.json',
  'writes package.json',
  'updates package.json',
  'writes dependency-cruiser config',
  'moves source folders',
  'scaffolds source',
  'creates source modules',
  'updates plan-skill-routing.md',
  'writes ADR files',
  'enforcement is active',
];

function skillDir(name: string): string {
  return resolve(INCEPTION_SKILLS_DIR, name);
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

describe('TDK workspace dependency policy contracts', () => {
  const policyDir = skillDir(POLICY_NAME);
  const legacyPolicyDir = skillDir(LEGACY_POLICY_NAME);
  const skillPath = join(policyDir, 'SKILL.md');
  const legacySkillPath = join(legacyPolicyDir, 'SKILL.md');
  const skill = existsSync(skillPath) ? read(skillPath) : '';
  const legacySkill = existsSync(legacySkillPath) ? read(legacySkillPath) : '';

  it('registers workspace-dependency-policy as a TDK inception report skill', () => {
    expect(existsSync(skillPath)).toBe(true);
    expect(skill).toContain('name: tdk-workspace-dependency-policy');
    expect(skill).toContain('[layout|file] [--audit|--suggest]');
    expect(skill).toContain('category: architecture-workflow');
    expect(skill).toContain(
      '.specify/configurations/workspace-dependency-policy/workspace-dependency-policy.md',
    );
    expect(skill).toContain(
      '.specify/configurations/workspace-dependency-policy/enforcement-snippets.md',
    );
    expect(skill).toContain('does not create or update `.specify/.specify.json`');
    expect(skill).toContain('does not enforce imports directly');
    for (const oldOwnerSkillsDir of [CORE_SKILLS_DIR, UTILS_SKILLS_DIR]) {
      expect(existsSync(join(oldOwnerSkillsDir, POLICY_NAME, 'SKILL.md'))).toBe(false);
      expect(existsSync(join(oldOwnerSkillsDir, LEGACY_POLICY_NAME, 'SKILL.md'))).toBe(false);
    }
  });

  it('keeps module-boundary-policy as a deprecated compatibility wrapper', () => {
    expect(existsSync(legacySkillPath)).toBe(true);
    expect(legacySkill).toContain('name: tdk-module-boundary-policy');
    expect(legacySkill).toContain('deprecated compatibility route');
    expect(legacySkill).toContain('/tdk-workspace-dependency-policy');
    expect(legacySkill).toContain(
      '.specify/configurations/module-boundary-policy/module-boundary-policy.md',
    );
    expect(legacySkill).toContain('transition window');
  });

  it('uses progressive disclosure through required references and templates', () => {
    expect(skill).toContain('Load shared references before writing');
    expect(skill).toContain('Load exactly one mode workflow');

    for (const reference of REQUIRED_REFERENCES) {
      expect(existsSync(join(policyDir, reference))).toBe(true);
      expect(skill).toContain(reference);
    }

    for (const template of REQUIRED_TEMPLATES) {
      expect(existsSync(join(policyDir, template))).toBe(true);
      expect(skill).toContain(template);
    }
  });

  it('requires policy report sections and report-only layout guidance', () => {
    const policyTemplate = read(join(policyDir, 'templates/workspace-dependency-policy.md.tpl'));
    const outputContract = read(
      join(policyDir, 'references/workspace-dependency-policy-output-contract.md'),
    );

    for (const section of REQUIRED_POLICY_SECTIONS) {
      expect(policyTemplate).toContain(section);
    }

    for (const field of ['boundaryType', 'owner', 'contracts', 'allowedDependencies', 'routing']) {
      expect(outputContract).toContain(field);
    }

    expect(outputContract).toContain('Report-only layout fields stay advisory');
  });

  it('keeps workflows observe-only and snippet-only', () => {
    const standard = read(join(policyDir, 'references/workflow-standard.md'));
    const audit = read(join(policyDir, 'references/workflow-audit.md'));
    const suggest = read(join(policyDir, 'references/workflow-suggest.md'));
    const snippets = read(join(policyDir, 'templates/enforcement-snippets.md.tpl'));

    expect(standard).toContain('Write `workspace-dependency-policy.md`');
    expect(audit).toContain('It is observe-only');
    expect(suggest).toContain('Write or update `enforcement-snippets.md`');
    expect(snippets).toContain('Copy after human review only');
    expect(snippets).toContain('base ESLint `no-restricted-imports` covers static imports');
  });

  it('keeps non-JS ecosystems manual or deferred without matching evidence', () => {
    const candidates = read(join(policyDir, 'references/ecosystem-boundary-candidates.md'));

    for (const ecosystem of ['CODEOWNERS', 'ArchUnit', 'Import Linter', 'Packwerk', 'Bazel']) {
      expect(candidates).toContain(ecosystem);
    }

    expect(candidates).toContain('manual/deferred');
    expect(candidates).toContain('matching repo evidence exists');
    expect(candidates).toContain('Do not add new dependencies');
  });

  it('keeps policy text free of config-write, source-move, and active-enforcement promises', () => {
    const combined = walkFiles(policyDir)
      .filter((path) => path.endsWith('.md') || path.endsWith('.tpl'))
      .map((path) => read(path).toLowerCase())
      .join('\n');

    for (const forbidden of FORBIDDEN_POLICY_PROMISES) {
      expect(combined).not.toContain(forbidden);
    }

    expect(combined).toContain('does not create or update `.specify/.specify.json`');
    expect(combined).toContain('copy after human review');
    expect(combined).toContain('manual/deferred');
  });

  it('registers policy docs and manifest entries', () => {
    const manifest = read(MANIFEST_PATH);
    const readme = read(README_PATH);
    const skillsGuide = read(join(DOCS_DIR, 'skills-guide.md'));
    const workflowMap = read(join(DOCS_DIR, 'workflow-map.md'));

    expect(manifest).toContain('"tdk-workspace-dependency-policy"');
    expect(manifest).toContain('"tdk-module-boundary-policy"');
    expect(readme).toContain('/tdk-workspace-dependency-policy');
    expect(skillsGuide).toContain('/tdk-workspace-dependency-policy [layout|file] [--audit|--suggest]');
    expect(skillsGuide).toContain('/tdk-module-boundary-policy [topology|file] [--audit|--suggest]');
    expect(skillsGuide).toContain('workspace-dependency-policy.md');
    expect(skillsGuide).toContain('module-boundary-policy.md');
    expect(workflowMap).toContain('/tdk-workspace-dependency-policy');
    expect(workflowMap).toContain('/tdk-module-boundary-policy');
    expect(workflowMap).toContain('workspace-dependency-policy.md');
    expect(workflowMap).toContain('module-boundary-policy.md');
  });
});
