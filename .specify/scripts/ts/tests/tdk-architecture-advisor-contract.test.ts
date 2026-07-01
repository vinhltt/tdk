import { describe, expect, it } from 'bun:test';
import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs';
import { join, resolve } from 'node:path';

const CORE_SKILLS_DIR = resolve(import.meta.dir, '../../../plugins/tdk-core/skills');
const DOCS_DIR = resolve(import.meta.dir, '../../../docs/en/guides');
const MANIFEST_PATH = resolve(import.meta.dir, '../../../plugins/manifest.json');
const README_PATH = resolve(import.meta.dir, '../../../../README.md');
const HLD_PATH = resolve(CORE_SKILLS_DIR, 'tdk-epic-hld/SKILL.md');

const ADVISOR_NAME = 'tdk-architecture-advisor';

const REQUIRED_REFERENCES = [
  'references/workflow-standard.md',
  'references/workflow-recover-existing.md',
  'references/workflow-unknown.md',
  'references/architecture-evaluation-framework.md',
  'references/architecture-advisor-output-contract.md',
];

const REQUIRED_TEMPLATES = [
  'templates/architecture-options.md.tpl',
  'templates/architecture-decision.md.tpl',
  'templates/architecture-recovery.md.tpl',
];

const REQUIRED_TEMPLATE_SECTIONS = [
  '## Evidence Inputs',
  '## Constraints',
  '## Quality Attribute Scenarios',
  '## Options Evaluated',
  '## Rejected Options',
  '## Trust Boundaries And Data Classification',
  '## Trade-Offs',
  '## Kill Criteria',
  '## Assumptions',
  '## Unresolved Questions',
];

const OPTIONS_TEMPLATE_SECTIONS = [
  ...REQUIRED_TEMPLATE_SECTIONS,
  '## Decision Matrix',
  '## Recommendation',
  '## Confidence',
];

const DECISION_TEMPLATE_SECTIONS = [
  '## Status',
  '## Evidence Inputs',
  '## Context',
  '## Decision',
  '## Options Evaluated',
  '## Rejected Options',
  '## Quality Attribute Scenarios',
  '## Trust Boundaries And Data Classification',
  '## Consequences',
  '## Runtime Config Mapping',
  '## Kill Criteria',
  '## Assumptions',
  '## Unresolved Questions',
  '## Follow-Up Work',
];

const RECOVERY_TEMPLATE_SECTIONS = [
  '## Evidence Inputs',
  '## As-Is Architecture',
  '## Evidence Table',
  '## Confidence Levels',
  '## Constraints',
  '## Quality Attribute Scenarios',
  '## Options Evaluated',
  '## Rejected Options',
  '## Trust Boundaries And Data Classification',
  '## Desired Architecture',
  '## Trade-Offs',
  '## Delta And Risks',
  '## Consequences',
  '## Do Not Change Yet',
  '## Kill Criteria',
  '## Assumptions',
  '## Unresolved Questions',
  '## Unresolved Repo Questions',
];

const FORBIDDEN_RUNTIME_REFERENCES = [
  'ck:bootstrap',
  '.agents/skills/bootstrap',
  'workflow-auto.md',
  '/ck:plan',
  '/ck:cook',
];

const FORBIDDEN_ADVISOR_PROMISES = [
  'supports `--yes`',
  'execute `/tdk-workflow-config-apply`',
  'run `/tdk-workflow-config-apply`',
  'scaffold source',
  'create GitHub issues',
  'write docs/decisions/',
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

describe('TDK architecture advisor contracts', () => {
  const advisorDir = skillDir(ADVISOR_NAME);
  const skillPath = join(advisorDir, 'SKILL.md');
  const skill = existsSync(skillPath) ? read(skillPath) : '';

  it('registers the advisor as a report-only TDK core skill', () => {
    expect(existsSync(skillPath)).toBe(true);
    expect(skill).toContain('name: tdk-architecture-advisor');
    expect(skill).toContain('[input|file] [--recover-existing|--unknown]');
    expect(skill).toMatch(/version: "[^"]+"/);
    expect(skill).toContain('.specify/configurations/architecture/architecture-options.md');
    expect(skill).toContain('.specify/configurations/architecture/architecture-decision.md');
    expect(skill).toContain('.specify/configurations/architecture/architecture-recovery.md');
    expect(skill).toContain('does not create or update `.specify/.specify.json`');
    expect(skill).toContain('does not write `workspace-layout-proposal.json`');
    expect(skill).toContain('does not create specs, HLD artifacts, plans, tasks, tracker issues, source code, layout proposal files, ADR files, or `.specify/.specify.json`');
  });

  it('uses progressive disclosure through required references and templates', () => {
    expect(skill).toContain('Load shared references before writing');
    expect(skill).toContain('Load exactly one mode workflow');

    for (const reference of REQUIRED_REFERENCES) {
      expect(existsSync(join(advisorDir, reference))).toBe(true);
      expect(skill).toContain(reference);
    }

    for (const template of REQUIRED_TEMPLATES) {
      expect(existsSync(join(advisorDir, template))).toBe(true);
      expect(skill).toContain(template);
    }
  });

  it('requires decision-quality sections across advisor report templates', () => {
    const optionsTemplate = read(join(advisorDir, 'templates/architecture-options.md.tpl'));
    const decisionTemplate = read(join(advisorDir, 'templates/architecture-decision.md.tpl'));
    const recoveryTemplate = read(join(advisorDir, 'templates/architecture-recovery.md.tpl'));
    const combinedTemplates = [optionsTemplate, decisionTemplate, recoveryTemplate].join('\n');

    for (const section of REQUIRED_TEMPLATE_SECTIONS) {
      expect(combinedTemplates).toContain(section);
    }

    for (const section of OPTIONS_TEMPLATE_SECTIONS) {
      expect(optionsTemplate).toContain(section);
    }

    for (const section of DECISION_TEMPLATE_SECTIONS) {
      expect(decisionTemplate).toContain(section);
    }

    for (const section of RECOVERY_TEMPLATE_SECTIONS) {
      expect(recoveryTemplate).toContain(section);
    }
  });

  it('keeps standard and recovery output semantics unambiguous', () => {
    const outputContract = read(join(advisorDir, 'references/architecture-advisor-output-contract.md'));
    const standardWorkflow = read(join(advisorDir, 'references/workflow-standard.md'));
    const recoveryWorkflow = read(join(advisorDir, 'references/workflow-recover-existing.md'));
    const decisionTemplate = read(join(advisorDir, 'templates/architecture-decision.md.tpl'));
    const commandReference = read(join(DOCS_DIR, 'command-reference.md'));

    expect(outputContract).toContain('Always write the decision artifact in standard mode');
    expect(standardWorkflow).toContain('Write `architecture-decision.md` every standard run');
    expect(standardWorkflow).toContain('set `## Status` to `Deferred`');
    expect(decisionTemplate).toContain('Deferred / Proposed / Accepted / Superseded');
    expect(commandReference).toContain('the decision artifact uses `Status: Deferred`');
    expect(recoveryWorkflow).toContain('Write `architecture-recovery.md` by default');
    expect(recoveryWorkflow).toContain('Write or update `architecture-decision.md` only after explicit user');
  });

  it('keeps advisor text TDK-native and free of forbidden runtime references', () => {
    const combined = walkFiles(advisorDir)
      .filter((path) => path.endsWith('.md') || path.endsWith('.tpl'))
      .map((path) => read(path))
      .join('\n');

    for (const forbidden of FORBIDDEN_RUNTIME_REFERENCES) {
      expect(combined).not.toContain(forbidden);
    }
  });

  it('keeps advisor report-only boundaries explicit', () => {
    const combined = walkFiles(advisorDir)
      .filter((path) => path.endsWith('.md') || path.endsWith('.tpl'))
      .map((path) => read(path))
      .join('\n');

    for (const forbidden of FORBIDDEN_ADVISOR_PROMISES) {
      expect(combined).not.toContain(forbidden);
    }

    expect(combined).toContain('does not create or update `.specify/.specify.json`');
    expect(combined).toContain('does not write `workspace-layout-proposal.json`');
    expect(combined).toContain('write or update `architecture-decision.md` only after explicit user confirmation');
  });

  it('keeps HLD epic-scoped and out of advisor layout ownership', () => {
    const hld = read(HLD_PATH);

    expect(hld).toContain('Produce parent epic high-level design');
    expect(hld).toContain('Create implementation plans');
    expect(hld).not.toContain('workspace-topology.json');
    expect(hld).not.toContain('/tdk-architecture-advisor');
    expect(hld).not.toContain('.specify/.specify.json');
  });

  it('registers advisor command docs and manifest entries', () => {
    const commandReference = read(join(DOCS_DIR, 'command-reference.md'));
    const documentFlow = read(join(DOCS_DIR, 'document-flow.md'));
    const manifest = read(MANIFEST_PATH);
    const readme = read(README_PATH);

    expect(commandReference).toContain('/tdk-architecture-advisor [input|file] [--recover-existing|--unknown]');
    expect(commandReference).toContain('.specify/configurations/architecture/architecture-decision.md');
    expect(documentFlow).toContain('/tdk-architecture-advisor');
    expect(documentFlow).toContain('.specify/configurations/architecture/architecture-options.md');
    expect(manifest).toContain('"tdk-architecture-advisor"');
    expect(readme).toContain('/tdk-architecture-advisor');
    expect(readme).toContain('25 skills + 1 agent');
  });
});
