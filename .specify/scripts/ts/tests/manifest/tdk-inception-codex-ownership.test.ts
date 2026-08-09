import { describe, expect, it } from 'bun:test';
import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { join, resolve } from 'node:path';

const SOURCE_MANIFEST_PATH = resolve(import.meta.dir, '../../../../plugins/manifest.json');
const INCEPTION_ROOT = resolve(import.meta.dir, '../../../../plugins/tdk-inception');
const INCEPTION_INTERFACE_PATH = join(INCEPTION_ROOT, '.claude-plugin', 'interface.json');
const INCEPTION_PLUGIN_PATH = join(INCEPTION_ROOT, '.claude-plugin', 'plugin.json');

type SourceManifest = {
  plugins?: Record<string, {
    version?: string;
    components?: { skills?: Record<string, { version?: string }> };
    files?: Record<string, string>;
  }>;
};

const CORE_MOVED_SKILLS = [
  'tdk-greenfield-start',
  'tdk-brownfield-start',
  'tdk-constitution',
  'tdk-architecture-advisor',
  'tdk-workspace-layout-propose',
  'tdk-workflow-config-apply',
  'tdk-config-diff',
  'tdk-config-sync',
  'tdk-config-index',
  'tdk-sub-workspace-init',
  'tdk-sub-workspace-list',
  'tdk-sub-workspace-docs',
  'tdk-boundary-map',
];
const UTILS_MOVED_SKILLS = [
  'tdk-workspace-dependency-policy',
  'tdk-module-boundary-policy',
];
const INCEPTION_SKILLS = [...CORE_MOVED_SKILLS, ...UTILS_MOVED_SKILLS].sort();

const SOURCE_MANIFEST = JSON.parse(readFileSync(SOURCE_MANIFEST_PATH, 'utf-8')) as SourceManifest;

function readJson(path: string): Record<string, unknown> {
  return JSON.parse(readFileSync(path, 'utf-8')) as Record<string, unknown>;
}

describe('tdk-inception source plugin ownership', () => {
  it('owns exactly the 15 source skill roots', () => {
    const sourceSkills = readdirSync(join(INCEPTION_ROOT, 'skills'), { withFileTypes: true })
      .filter((entry) => entry.isDirectory())
      .map((entry) => entry.name)
      .sort();
    const inception = SOURCE_MANIFEST.plugins?.['tdk-inception'];
    const skills = inception?.components?.skills ?? {};
    const files = inception?.files ?? {};

    expect(sourceSkills).toEqual(INCEPTION_SKILLS);
    for (const skill of INCEPTION_SKILLS) {
      expect(skills[skill]).toBeDefined();
      expect(files[`skills/${skill}/SKILL.md`]).toBeDefined();
      expect(existsSync(join(INCEPTION_ROOT, 'skills', skill, 'SKILL.md'))).toBe(true);
    }
  });

  it('removes every moved skill from the old source owners', () => {
    const coreSkills = SOURCE_MANIFEST.plugins?.['tdk-core']?.components?.skills ?? {};
    const coreFiles = SOURCE_MANIFEST.plugins?.['tdk-core']?.files ?? {};
    const utilsSkills = SOURCE_MANIFEST.plugins?.['tdk-utils']?.components?.skills ?? {};
    const utilsFiles = SOURCE_MANIFEST.plugins?.['tdk-utils']?.files ?? {};

    for (const skill of CORE_MOVED_SKILLS) {
      expect(coreSkills[skill]).toBeUndefined();
      expect(coreFiles[`skills/${skill}/SKILL.md`]).toBeUndefined();
    }
    for (const skill of UTILS_MOVED_SKILLS) {
      expect(utilsSkills[skill]).toBeUndefined();
      expect(utilsFiles[`skills/${skill}/SKILL.md`]).toBeUndefined();
    }
  });

  it('defines canonical source plugin and interface metadata', () => {
    const plugin = readJson(INCEPTION_PLUGIN_PATH);
    const sourceInterface = readJson(INCEPTION_INTERFACE_PATH);

    expect(plugin.name).toBe('tdk-inception');
    expect(sourceInterface.displayName).toBe('TDK Inception');
    expect(sourceInterface.capabilities).toEqual(['Skills']);
  });
});
