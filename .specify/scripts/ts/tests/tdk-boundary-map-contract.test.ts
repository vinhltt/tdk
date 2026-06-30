import { describe, expect, it } from 'bun:test';
import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { parseWorkspaceTopology } from '../src/commands/config/topology/schema';

const CORE_SKILLS_DIR = resolve(import.meta.dir, '../../../plugins/tdk-core/skills');
const DOCS_DIR = resolve(import.meta.dir, '../../../docs/en/guides');
const MANIFEST_PATH = resolve(import.meta.dir, '../../../plugins/manifest.json');
const README_PATH = resolve(import.meta.dir, '../../../../README.md');
const LAYOUT_NAME = 'tdk-workspace-layout-propose';
const LEGACY_LAYOUT_NAME = 'tdk-boundary-map';

const REQUIRED_REFERENCES = [
  'references/workspace-layout-proposal-output-contract.md',
  'references/workspace-layout-taxonomy-and-runtime-projection.md',
  'references/workflow-standard.md',
  'references/workflow-from-existing.md',
  'references/workflow-unknown.md',
];

const REQUIRED_TEMPLATES = [
  'templates/workspace-layout-proposal.md.tpl',
  'templates/workspace-layout-proposal.json.tpl',
];

const REQUIRED_MARKDOWN_TEMPLATE_SECTIONS = [
  '## Evidence Inputs',
  '## Architecture Source',
  '## C4 And DDD Mapping',
  '## Proposed Sub-Workspaces',
  '## Proposed Modules',
  '## Runtime Projection',
  '## Report-Only Fields',
  '## Confidence',
  '## Risks',
  '## Recommended Next Route',
  '## Unresolved Questions',
];

const REQUIRED_REPORT_ONLY_FIELDS = [
  'boundaryType',
  'owner',
  'contracts',
  'allowedDependencies',
  'routing',
];

const FORBIDDEN_PROMISES = [
  'supports `--yes`',
  'run `/tdk-workflow-config-apply`',
  'execute `/tdk-workflow-config-apply`',
  'apply topology changes',
  'creates source directories',
  'moves source folders',
  'renames source folders',
  'scaffolds source',
  'enforces module boundaries',
  'create GitHub issues',
  'writes ADR files',
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

describe('TDK workspace layout proposal contracts', () => {
  const layoutDir = skillDir(LAYOUT_NAME);
  const legacyDir = skillDir(LEGACY_LAYOUT_NAME);
  const skillPath = join(layoutDir, 'SKILL.md');
  const legacySkillPath = join(legacyDir, 'SKILL.md');
  const skill = existsSync(skillPath) ? read(skillPath) : '';
  const legacySkill = existsSync(legacySkillPath) ? read(legacySkillPath) : '';

  it('registers workspace-layout-propose as the proposal-only TDK core skill', () => {
    expect(existsSync(skillPath)).toBe(true);
    expect(skill).toContain('name: tdk-workspace-layout-propose');
    expect(skill).toContain('[input|file] [--from-existing|--unknown]');
    expect(skill).toContain('category: architecture-workflow');
    expect(skill).toContain('.specify/configurations/workspace-layout/workspace-layout-proposal.md');
    expect(skill).toContain('.specify/configurations/workspace-layout/workspace-layout-proposal.json');
    expect(skill).toContain('does not create or update `.specify/.specify.json`');
    expect(skill).toContain('does not create source directories');
    expect(skill).toContain('does not move or rename source folders');
    expect(skill).toContain('does not scaffold source');
    expect(skill).toContain('does not enforce dependency policy');
  });

  it('keeps boundary-map as a deprecated compatibility wrapper', () => {
    expect(existsSync(legacySkillPath)).toBe(true);
    expect(legacySkill).toContain('name: tdk-boundary-map');
    expect(legacySkill).toContain('deprecated compatibility route');
    expect(legacySkill).toContain('/tdk-workspace-layout-propose');
    expect(legacySkill).toContain('.specify/configurations/workspace-topology/workspace-topology.md');
    expect(legacySkill).toContain('.specify/configurations/workspace-topology/workspace-topology.json');
    expect(legacySkill).toContain('transition window');
  });

  it('uses progressive disclosure through required references and templates', () => {
    expect(skill).toContain('Load shared references before writing');
    expect(skill).toContain('Load exactly one mode workflow');

    for (const reference of REQUIRED_REFERENCES) {
      expect(existsSync(join(layoutDir, reference))).toBe(true);
      expect(skill).toContain(reference);
    }

    for (const template of REQUIRED_TEMPLATES) {
      expect(existsSync(join(layoutDir, template))).toBe(true);
      expect(skill).toContain(template);
    }
  });

  it('requires layout proposal sections and report-only field labels', () => {
    const markdownTemplate = read(join(layoutDir, 'templates/workspace-layout-proposal.md.tpl'));
    const runtimeReference = read(
      join(layoutDir, 'references/workspace-layout-taxonomy-and-runtime-projection.md'),
    );
    const outputContract = read(
      join(layoutDir, 'references/workspace-layout-proposal-output-contract.md'),
    );

    for (const section of REQUIRED_MARKDOWN_TEMPLATE_SECTIONS) {
      expect(markdownTemplate).toContain(section);
    }

    for (const field of REQUIRED_REPORT_ONLY_FIELDS) {
      expect(markdownTemplate).toContain(field);
      expect(runtimeReference).toContain(field);
      expect(outputContract).toContain(field);
    }
  });

  it('keeps mode semantics explicit and observe-first for brownfield repos', () => {
    const standardWorkflow = read(join(layoutDir, 'references/workflow-standard.md'));
    const fromExistingWorkflow = read(join(layoutDir, 'references/workflow-from-existing.md'));
    const unknownWorkflow = read(join(layoutDir, 'references/workflow-unknown.md'));

    expect(standardWorkflow).toContain(
      'Write `workspace-layout-proposal.md` and `workspace-layout-proposal.json`',
    );
    expect(fromExistingWorkflow).toContain('observed real folders or packages only');
    expect(fromExistingWorkflow).toContain('desired-state deltas stay in `workspace-layout-proposal.md`');
    expect(unknownWorkflow).toContain(
      'Do not overwrite `workspace-layout-proposal.json` when evidence is insufficient',
    );
  });

  it('keeps JSON template parser-compatible and labels report-only fields', () => {
    const jsonTemplate = read(join(layoutDir, 'templates/workspace-layout-proposal.json.tpl'));
    const parsedJson = JSON.parse(jsonTemplate);
    const parsedTopology = parseWorkspaceTopology(parsedJson);

    expect(parsedTopology.topology.subWorkspaces.length).toBeGreaterThan(0);
    expect(parsedTopology.warnings.join('\n')).toContain('report-only');
    expect(parsedTopology.warnings.join('\n')).toContain('subWorkspaces.app.boundaryType');
    expect(JSON.stringify(parsedTopology.topology)).not.toContain('..');
  });

  it('keeps proposal text free of apply, scaffold, policy, and tracker promises', () => {
    const combined = walkFiles(layoutDir)
      .filter((path) => path.endsWith('.md') || path.endsWith('.tpl'))
      .map((path) => read(path))
      .join('\n');

    for (const forbidden of FORBIDDEN_PROMISES) {
      expect(combined).not.toContain(forbidden);
    }

    expect(combined).toContain('does not create or update `.specify/.specify.json`');
    expect(combined).toContain('does not create source directories');
    expect(combined).toContain('does not move or rename source folders');
    expect(combined).toContain('does not scaffold source');
    expect(combined).toContain('does not enforce dependency policy');
  });

  it('keeps workflow config apply interactive while documenting new and legacy layout routes', () => {
    const topologyApply = read(join(CORE_SKILLS_DIR, 'tdk-workflow-config-apply/SKILL.md'));
    const commandReference = read(join(DOCS_DIR, 'command-reference.md'));
    const documentFlow = read(join(DOCS_DIR, 'document-flow.md'));

    expect(topologyApply).toContain('no flags is the default human mode');
    expect(topologyApply).toContain('Apply this workflow config patch to `.specify/.specify.json`?');
    expect(topologyApply).toContain('user copy it manually');
    expect(topologyApply).toContain('`--yes` without `--expect-hash` exits 1');
    expect(topologyApply).toContain('deferred: first-time config creation');
    expect(topologyApply).toContain(
      '.specify/configurations/workspace-layout/workspace-layout-proposal.json',
    );
    expect(topologyApply).toContain(
      '.specify/configurations/workspace-topology/workspace-topology.json',
    );
    expect(commandReference).toContain('/tdk-workspace-layout-propose [input|file] [--from-existing|--unknown]');
    expect(commandReference).toContain('/tdk-boundary-map [input|file] [--from-existing|--unknown]');
    expect(commandReference).toContain('Interactive runtime config review/apply');
    expect(documentFlow).toContain('/tdk-workspace-layout-propose');
    expect(documentFlow).toContain('/tdk-boundary-map');
  });

  it('registers layout proposal docs and manifest entries', () => {
    const manifest = read(MANIFEST_PATH);
    const readme = read(README_PATH);
    const commandReference = read(join(DOCS_DIR, 'command-reference.md'));

    expect(manifest).toContain('"tdk-workspace-layout-propose"');
    expect(manifest).toContain('"tdk-boundary-map"');
    expect(readme).toContain('/tdk-workspace-layout-propose');
    expect(readme).toContain('/tdk-boundary-map');
    expect(readme).toContain('24 skills + 1 agent');
    expect(commandReference).toContain('workspace-layout-proposal.md');
    expect(commandReference).toContain('workspace-layout-proposal.json');
    expect(commandReference).toContain('workspace-topology.md');
    expect(commandReference).toContain('workspace-topology.json');
  });
});
