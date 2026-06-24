import { describe, expect, it } from 'bun:test';
import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const CORE_SKILLS_DIR = resolve(import.meta.dir, '../../../plugins/tdk-core/skills');
const INDEX_PATH = resolve(import.meta.dir, '../src/index.ts');

function skillPath(name: string): string {
  return resolve(CORE_SKILLS_DIR, name, 'SKILL.md');
}

function read(path: string): string {
  return readFileSync(path, 'utf-8');
}

function readIfExists(path: string): string {
  return existsSync(path) ? read(path) : '';
}

function expectNoRuntimeConfigMutation(skill: string): void {
  expect(skill).toContain('does not create or update `.specify/.specify.json`');
  expect(skill).not.toContain('write `.specify/.specify.json`');
  expect(skill).not.toContain('mutate `.specify/.specify.json`');
}

function expectArchitectureWorkflowVersion(skill: string): void {
  expect(skill).toContain('  version: "5.5.0"');
}

describe('architecture workflow foundation contracts', () => {
  const greenfieldPath = skillPath('tdk-greenfield-start');
  const brownfieldPath = skillPath('tdk-brownfield-start');
  const topologyPath = skillPath('tdk-workspace-topology-apply');

  const greenfield = readIfExists(greenfieldPath);
  const brownfield = readIfExists(brownfieldPath);
  const topology = readIfExists(topologyPath);
  const hld = read(skillPath('tdk-high-level-design'));
  const index = read(INDEX_PATH);

  it('registers only the dry-run topology CLI surface for slice 1', () => {
    expect(index).toContain('createConfigTopologyApplyCommand');
    expect(index).toContain("new Command('topology')");
    expect(index).not.toContain("option('--yes'");
  });

  it('keeps new foundation skills at the selected architecture workflow version', () => {
    expectArchitectureWorkflowVersion(greenfield);
    expectArchitectureWorkflowVersion(brownfield);
    expectArchitectureWorkflowVersion(topology);
  });

  it('adds greenfield start as report-only new-project intake', () => {
    expect(existsSync(greenfieldPath)).toBe(true);
    expect(greenfield).toContain('name: tdk-greenfield-start');
    expect(greenfield).toContain('[brief|file] [--full|--quick|--unknown]');
    expect(greenfield).toContain('--full` is the default');
    expect(greenfield).toContain('--quick');
    expect(greenfield).toContain('--unknown');
    expect(greenfield).toContain('.specify/configurations/inception/project-inception.md');
    expect(greenfield).toContain('does not choose final architecture');
    expect(greenfield).not.toContain('--single-app');
    expect(greenfield).not.toContain('--monorepo');
    expectNoRuntimeConfigMutation(greenfield);
  });

  it('adds brownfield start as observe-first repo onboarding', () => {
    expect(existsSync(brownfieldPath)).toBe(true);
    expect(brownfield).toContain('name: tdk-brownfield-start');
    expect(brownfield).toContain('[repo-root] [--full|--config-only|--unknown]');
    expect(brownfield).toContain('--full` is the observe-first default');
    expect(brownfield).toContain('--config-only');
    expect(brownfield).toContain('--unknown');
    expect(brownfield).toContain('.specify/configurations/inception/brownfield-onboarding.md');
    expect(brownfield).toContain('redact');
    expect(brownfield).toContain('does not ask product-scope discovery questions by default');
    expect(brownfield).toContain('does not move, rename, scaffold, or refactor source folders');
    expectNoRuntimeConfigMutation(brownfield);
  });

  it('adds topology apply as a dry-run wrapper over the TypeScript CLI', () => {
    expect(existsSync(topologyPath)).toBe(true);
    expect(topology).toContain('name: tdk-workspace-topology-apply');
    expect(topology).toContain('[--dry-run] [--reconcile] [--topology <path>]');
    expect(topology).toContain('dry-run is the default');
    expect(topology).toContain('bun src/index.ts config topology apply');
    expect(topology).toContain('.specify/configurations/workspace-topology/workspace-topology.json');
    expect(topology).toContain('workspace-topology.json` is the authoring proposal');
    expect(topology).toContain('`.specify/.specify.json` is derived runtime config');
    expect(topology).toContain('shell-like routing values hard-fail');
    expect(topology).toContain('does not create directories');
    expect(topology).toContain('does not create or update `.specify/.specify.json`');
    expect(topology).toContain('TOPOLOGY_ARG="$PROJECT_DIR/$TOPOLOGY_PATH"');
    expect(topology).not.toContain('--create-dirs');
    expect(topology).not.toContain('supports `--yes`');
  });

  it('keeps HLD feature-scoped and out of project topology ownership', () => {
    expect(hld).toContain('Produce approval-level high-level design');
    expect(hld).toContain('This command does NOT:');
    expect(hld).toContain('Create implementation plans');
    expect(hld).toContain('Implement code');
    expect(hld).not.toContain('workspace-topology.json');
    expect(hld).not.toContain('topology apply');
    expect(hld).not.toContain('.specify/.specify.json');
  });
});
