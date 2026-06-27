import { describe, expect, it } from 'bun:test';
import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { parseWorkspaceTopology } from '../src/commands/config/topology/schema';

const CORE_SKILLS_DIR = resolve(import.meta.dir, '../../../plugins/tdk-core/skills');
const DOCS_DIR = resolve(import.meta.dir, '../../../docs/en');
const MANIFEST_PATH = resolve(import.meta.dir, '../../../plugins/manifest.json');
const README_PATH = resolve(import.meta.dir, '../../../../README.md');
const BOUNDARY_MAP_NAME = 'tdk-boundary-map';

const REQUIRED_REFERENCES = [
  'references/boundary-map-output-contract.md',
  'references/boundary-taxonomy-and-runtime-projection.md',
  'references/workflow-standard.md',
  'references/workflow-from-existing.md',
  'references/workflow-unknown.md',
];

const REQUIRED_TEMPLATES = [
  'templates/workspace-topology.md.tpl',
  'templates/workspace-topology.json.tpl',
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
  'run `/tdk-workspace-topology-apply`',
  'execute `/tdk-workspace-topology-apply`',
  'apply topology changes',
  'Create the proposal directory if needed',
  'create the proposal directory',
  'mkdir',
  'creates source directories',
  'moves source folders',
  'renames source folders',
  'scaffolds source',
  'enforces module boundaries',
  'create GitHub issues',
  'writes ADR files',
];

function boundaryMapDir(): string {
  return resolve(CORE_SKILLS_DIR, BOUNDARY_MAP_NAME);
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

describe('TDK boundary-map contracts', () => {
  const skillDir = boundaryMapDir();
  const skillPath = join(skillDir, 'SKILL.md');
  const skill = existsSync(skillPath) ? read(skillPath) : '';

  it('registers boundary-map as a proposal-only TDK core skill', () => {
    expect(existsSync(skillPath)).toBe(true);
    expect(skill).toContain('name: tdk-boundary-map');
    expect(skill).toContain('[input|file] [--from-existing|--unknown]');
    expect(skill).toContain('  version: "5.6.0"');
    expect(skill).toContain('.specify/configurations/workspace-topology/workspace-topology.md');
    expect(skill).toContain('.specify/configurations/workspace-topology/workspace-topology.json');
    expect(skill).toContain('does not create or update `.specify/.specify.json`');
    expect(skill).toContain('does not create directories');
    expect(skill).toContain('does not move or rename source folders');
    expect(skill).toContain('does not scaffold source');
    expect(skill).toContain('does not enforce module boundaries');
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

  it('requires topology proposal sections and report-only field labels', () => {
    const markdownTemplate = read(join(skillDir, 'templates/workspace-topology.md.tpl'));
    const runtimeReference = read(join(skillDir, 'references/boundary-taxonomy-and-runtime-projection.md'));
    const outputContract = read(join(skillDir, 'references/boundary-map-output-contract.md'));

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
    const standardWorkflow = read(join(skillDir, 'references/workflow-standard.md'));
    const fromExistingWorkflow = read(join(skillDir, 'references/workflow-from-existing.md'));
    const unknownWorkflow = read(join(skillDir, 'references/workflow-unknown.md'));

    expect(standardWorkflow).toContain('Write `workspace-topology.md` and `workspace-topology.json`');
    expect(fromExistingWorkflow).toContain('observed real folders or packages only');
    expect(fromExistingWorkflow).toContain('desired-state deltas stay in `workspace-topology.md`');
    expect(unknownWorkflow).toContain('Do not overwrite `workspace-topology.json` when evidence is insufficient');
  });

  it('keeps JSON template parser-compatible and labels report-only fields', () => {
    const jsonTemplate = read(join(skillDir, 'templates/workspace-topology.json.tpl'));
    const parsedJson = JSON.parse(jsonTemplate);
    const parsedTopology = parseWorkspaceTopology(parsedJson);

    expect(parsedTopology.topology.subWorkspaces.length).toBeGreaterThan(0);
    expect(parsedTopology.warnings.join('\n')).toContain('report-only');
    expect(parsedTopology.warnings.join('\n')).toContain('subWorkspaces.app.boundaryType');
    expect(JSON.stringify(parsedTopology.topology)).not.toContain('..');
  });

  it('keeps proposal text free of apply, scaffold, policy, and tracker promises', () => {
    const combined = walkFiles(skillDir)
      .filter((path) => path.endsWith('.md') || path.endsWith('.tpl'))
      .map((path) => read(path))
      .join('\n');

    for (const forbidden of FORBIDDEN_PROMISES) {
      expect(combined).not.toContain(forbidden);
    }

    expect(combined).toContain('does not create or update `.specify/.specify.json`');
    expect(combined).toContain('does not create directories');
    expect(combined).toContain('does not move or rename source folders');
    expect(combined).toContain('does not scaffold source');
    expect(combined).toContain('does not enforce module boundaries');
  });

  it('keeps topology apply dry-run-first while adding boundary-map route docs', () => {
    const topologyApply = read(join(CORE_SKILLS_DIR, 'tdk-workspace-topology-apply/SKILL.md'));
    const commandReference = read(join(DOCS_DIR, 'command-reference.md'));
    const documentFlow = read(join(DOCS_DIR, 'document-flow.md'));

    expect(topologyApply).toContain('dry-run is the default');
    expect(topologyApply).toContain('guarded two-step');
    expect(topologyApply).toContain('`--yes` without `--expect-hash` exits 1');
    expect(topologyApply).toContain('deferred: first-time config creation');
    expect(commandReference).toContain('/tdk-boundary-map [input|file] [--from-existing|--unknown]');
    expect(commandReference).toContain('guarded config apply');
    expect(documentFlow).toContain('/tdk-boundary-map');
  });

  it('registers boundary-map docs and manifest entries', () => {
    const manifest = read(MANIFEST_PATH);
    const readme = read(README_PATH);
    const commandReference = read(join(DOCS_DIR, 'command-reference.md'));

    expect(manifest).toContain('"tdk-boundary-map"');
    expect(readme).toContain('/tdk-boundary-map');
    expect(readme).toContain('23 skills + 1 agent');
    expect(commandReference).toContain('workspace-topology.md');
    expect(commandReference).toContain('workspace-topology.json');
  });
});
