import { describe, expect, it } from 'bun:test';
import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const SOURCE_MANIFEST_PATH = resolve(import.meta.dir, '../../../../plugins/manifest.json');
const CODEX_MANIFEST_PATH = resolve(import.meta.dir, '../../../../codex-plugins/manifest.json');
const SHARED_PROTOCOL_PATH = resolve(
  import.meta.dir,
  '../../../../_shared/skills/interview-alignment-protocol.md',
);
const ROOT_README_PATH = resolve(import.meta.dir, '../../../../../README.md');
const SETUP_README_PATH = resolve(import.meta.dir, '../../../../../packages/tdk-setup/README.md');
const PRIMARY_WORKFLOW_ROUTING_PATH = resolve(
  import.meta.dir,
  '../../../../claude-rules/primary-workflow-routing.md',
);

const EPIC_SKILLS = [
  'tdk-discovery',
  'tdk-epic-prd',
  'tdk-epic-hld',
  'tdk-task-breakdown',
];

function read(path: string): string {
  return existsSync(path) ? readFileSync(path, 'utf-8') : '';
}

function readJson(path: string): any {
  const content = read(path);
  return content ? JSON.parse(content) : { plugins: {} };
}

describe('tdk-epic plugin ownership', () => {
  it('declares source plugin skill ownership in .specify/plugins/manifest.json', () => {
    const manifest = readJson(SOURCE_MANIFEST_PATH);
    const coreSkills = manifest.plugins?.['tdk-core']?.components?.skills ?? {};
    const epicSkills = manifest.plugins?.['tdk-epic']?.components?.skills ?? {};

    expect(manifest.plugins?.['tdk-epic']).toBeDefined();
    for (const skill of EPIC_SKILLS) {
      expect(epicSkills[skill]).toBeDefined();
      expect(coreSkills[skill]).toBeUndefined();
    }
  });

  it('declares generated Codex package ownership by file path', () => {
    const manifest = readJson(CODEX_MANIFEST_PATH);
    const coreFiles = manifest.plugins?.['tdk-core']?.files ?? {};
    const epicFiles = manifest.plugins?.['tdk-epic']?.files ?? {};

    expect(manifest.plugins?.['tdk-epic']).toBeDefined();
    for (const skill of EPIC_SKILLS) {
      expect(epicFiles[`skills/${skill}/SKILL.md`]).toBeDefined();
      expect(coreFiles[`skills/${skill}/SKILL.md`]).toBeUndefined();
    }
  });

  it('ships the shared interview protocol as root shared payload', () => {
    expect(existsSync(SHARED_PROTOCOL_PATH)).toBe(true);

    const sourceManifest = readJson(SOURCE_MANIFEST_PATH);
    const sourceFiles = sourceManifest.plugins?.['tdk-core']?.files ?? {};
    expect(sourceFiles['skills/_shared/interview-alignment-protocol.md']).toBeUndefined();

    const codexManifest = readJson(CODEX_MANIFEST_PATH);
    const codexCoreFiles = codexManifest.plugins?.['tdk-core']?.files ?? {};
    expect(codexCoreFiles['skills/_shared/interview-alignment-protocol.md']).toBeUndefined();
  });

  it('documents workflow command availability in root README and CLI package selection in setup README', () => {
    const rootReadme = read(ROOT_README_PATH);
    const setupReadme = read(SETUP_README_PATH);
    const primaryWorkflowRouting = read(PRIMARY_WORKFLOW_ROUTING_PATH);

    expect(rootReadme).toContain('**tdk-epic**');
    expect(rootReadme).toContain('For selective harness installs, make sure the parent epic commands are');
    expect(rootReadme).not.toContain('tdk-epic,tdk-utils');
    expect(primaryWorkflowRouting).toContain('Route only to workflow commands available in the current session');
    expect(primaryWorkflowRouting).not.toContain('selective harness installs');
    expect(primaryWorkflowRouting).not.toContain('tdk-epic,tdk-utils');
    expect(primaryWorkflowRouting).not.toContain('tdk-core,tdk-utils');
    expect(primaryWorkflowRouting).not.toContain('--all-plugins');
    expect(setupReadme).toContain('--plugins tdk-core,tdk-utils');
    expect(setupReadme).toContain('--plugins tdk-epic,tdk-utils');
    expect(setupReadme).toContain('--plugins tdk-core,tdk-epic,tdk-utils');
  });
});
