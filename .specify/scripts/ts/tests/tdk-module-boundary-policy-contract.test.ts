import { describe, expect, it } from 'bun:test';
import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs';
import { join, resolve } from 'node:path';

const UTILS_SKILLS_DIR = resolve(import.meta.dir, '../../../plugins/tdk-utils/skills');
const CORE_SKILLS_DIR = resolve(import.meta.dir, '../../../plugins/tdk-core/skills');
const DOCS_DIR = resolve(import.meta.dir, '../../../docs/en');
const MANIFEST_PATH = resolve(import.meta.dir, '../../../plugins/manifest.json');
const README_PATH = resolve(import.meta.dir, '../../../../README.md');
const POLICY_NAME = 'tdk-module-boundary-policy';

const REQUIRED_REFERENCES = [
  'references/module-boundary-policy-output-contract.md',
  'references/enforcement-snippet-catalog.md',
  'references/ecosystem-boundary-candidates.md',
  'references/workflow-standard.md',
  'references/workflow-audit.md',
  'references/workflow-suggest.md',
];

const REQUIRED_TEMPLATES = [
  'templates/module-boundary-policy.md.tpl',
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

function policyDir(): string {
  return resolve(UTILS_SKILLS_DIR, POLICY_NAME);
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

describe('TDK module-boundary-policy contracts', () => {
  const skillDir = policyDir();
  const skillPath = join(skillDir, 'SKILL.md');
  const skill = existsSync(skillPath) ? read(skillPath) : '';

  it('registers module-boundary-policy as a TDK utils report skill', () => {
    expect(existsSync(skillPath)).toBe(true);
    expect(skill).toContain('name: tdk-module-boundary-policy');
    expect(skill).toContain('[topology|file] [--audit|--suggest]');
    expect(skill).toContain('category: architecture-workflow');
    expect(skill).toContain('.specify/configurations/module-boundary-policy/module-boundary-policy.md');
    expect(skill).toContain('.specify/configurations/module-boundary-policy/enforcement-snippets.md');
    expect(skill).toContain('does not create or update `.specify/.specify.json`');
    expect(skill).toContain('does not enforce imports directly');
    expect(existsSync(join(CORE_SKILLS_DIR, POLICY_NAME, 'SKILL.md'))).toBe(false);
  });

  it('uses progressive disclosure through required references and templates', () => {
    expect(skill).toContain('Load shared references before writing');
    expect(skill).toContain('Load exactly one mode workflow');

    for (const reference of REQUIRED_REFERENCES) {
      expect(existsSync(join(skillDir, reference))).toBe(true);
      expect(skill).toContain(reference);
    }

    for (const template of REQUIRED_TEMPLATES) {
      expect(existsSync(join(skillDir, template))).toBe(true);
      expect(skill).toContain(template);
    }
  });

  it('requires policy report sections and report-only topology guidance', () => {
    const policyTemplate = read(join(skillDir, 'templates/module-boundary-policy.md.tpl'));
    const outputContract = read(join(skillDir, 'references/module-boundary-policy-output-contract.md'));

    for (const section of REQUIRED_POLICY_SECTIONS) {
      expect(policyTemplate).toContain(section);
    }

    for (const field of ['boundaryType', 'owner', 'contracts', 'allowedDependencies', 'routing']) {
      expect(outputContract).toContain(field);
    }

    expect(outputContract).toContain('Report-only topology fields stay advisory');
  });

  it('keeps workflows observe-only and snippet-only', () => {
    const standard = read(join(skillDir, 'references/workflow-standard.md'));
    const audit = read(join(skillDir, 'references/workflow-audit.md'));
    const suggest = read(join(skillDir, 'references/workflow-suggest.md'));
    const snippets = read(join(skillDir, 'templates/enforcement-snippets.md.tpl'));

    expect(standard).toContain('Write `module-boundary-policy.md`');
    expect(audit).toContain('It is observe-only');
    expect(suggest).toContain('Write or update `enforcement-snippets.md`');
    expect(snippets).toContain('Copy after human review only');
    expect(snippets).toContain('base ESLint `no-restricted-imports` covers static imports');
  });

  it('keeps non-JS ecosystems manual or deferred without matching evidence', () => {
    const candidates = read(join(skillDir, 'references/ecosystem-boundary-candidates.md'));

    for (const ecosystem of ['CODEOWNERS', 'ArchUnit', 'Import Linter', 'Packwerk', 'Bazel']) {
      expect(candidates).toContain(ecosystem);
    }

    expect(candidates).toContain('manual/deferred');
    expect(candidates).toContain('matching repo evidence exists');
    expect(candidates).toContain('Do not add new dependencies');
  });

  it('keeps policy text free of config-write, source-move, and active-enforcement promises', () => {
    const combined = walkFiles(skillDir)
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
    const commandReference = read(join(DOCS_DIR, 'command-reference.md'));
    const documentFlow = read(join(DOCS_DIR, 'document-flow.md'));

    expect(manifest).toContain('"tdk-module-boundary-policy"');
    expect(readme).toContain('/tdk-module-boundary-policy');
    expect(readme).toContain('15 skills + 5 agents');
    expect(commandReference).toContain('/tdk-module-boundary-policy [topology|file] [--audit|--suggest]');
    expect(commandReference).toContain('module-boundary-policy.md');
    expect(documentFlow).toContain('/tdk-module-boundary-policy');
    expect(documentFlow).toContain('module-boundary-policy.md');
  });
});
