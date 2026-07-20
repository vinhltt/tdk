import { describe, expect, it } from 'bun:test';
import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { join, resolve } from 'node:path';

const CODEX_PLUGINS_DIR = resolve(import.meta.dir, '../../../../codex-plugins');
const CODEX_MANIFEST = JSON.parse(
  readFileSync(join(CODEX_PLUGINS_DIR, 'manifest.json'), 'utf-8'),
) as { plugins?: Record<string, { version?: string; files?: Record<string, string> }> };
const INCEPTION_ROOT = join(CODEX_PLUGINS_DIR, 'tdk-inception');

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
const INCEPTION_SKILL_VERSIONS: Record<string, string> = {
  'tdk-architecture-advisor': '1.0.0',
  'tdk-boundary-map': '1.0.0',
  'tdk-brownfield-start': '1.0.0',
  'tdk-config-diff': '1.0.0',
  'tdk-config-index': '1.0.0',
  'tdk-config-sync': '1.0.0',
  'tdk-constitution': '1.0.1',
  'tdk-greenfield-start': '1.0.0',
  'tdk-module-boundary-policy': '1.0.0',
  'tdk-sub-workspace-docs': '1.0.0',
  'tdk-sub-workspace-init': '1.0.0',
  'tdk-sub-workspace-list': '1.0.0',
  'tdk-workflow-config-apply': '1.0.0',
  'tdk-workspace-dependency-policy': '1.0.0',
  'tdk-workspace-layout-propose': '1.0.0',
};

function readComponentVersion(path: string): string | undefined {
  return readFileSync(path, 'utf-8').match(/metadata:\s*\n\s+version:\s*["']([^"']+)["']/)?.[1];
}

describe('tdk-inception generated Codex ownership', () => {
  it('owns exactly the 15 generated skill roots and no runtime or agent directory', () => {
    const generatedSkills = readdirSync(join(INCEPTION_ROOT, 'skills'), { withFileTypes: true })
      .filter((entry) => entry.isDirectory())
      .map((entry) => entry.name)
      .sort();
    const files = CODEX_MANIFEST.plugins?.['tdk-inception']?.files ?? {};

    expect(generatedSkills).toEqual(INCEPTION_SKILLS);
    expect(CODEX_MANIFEST.plugins?.['tdk-inception']?.version).toBe('1.0.1');
    for (const skill of INCEPTION_SKILLS) {
      expect(files[`skills/${skill}/SKILL.md`]).toBeDefined();
      expect(readComponentVersion(join(INCEPTION_ROOT, 'skills', skill, 'SKILL.md'))).toBe(
        INCEPTION_SKILL_VERSIONS[skill],
      );
    }
    for (const directory of ['agents', 'hooks', 'lib']) {
      expect(existsSync(join(INCEPTION_ROOT, directory))).toBe(false);
      expect(Object.keys(files).some((file) => file.startsWith(`${directory}/`))).toBe(false);
    }
  });

  it('removes every moved generated root from the old owners', () => {
    const coreFiles = CODEX_MANIFEST.plugins?.['tdk-core']?.files ?? {};
    const utilsFiles = CODEX_MANIFEST.plugins?.['tdk-utils']?.files ?? {};

    for (const skill of CORE_MOVED_SKILLS) {
      expect(existsSync(join(CODEX_PLUGINS_DIR, 'tdk-core', 'skills', skill))).toBe(false);
      expect(coreFiles[`skills/${skill}/SKILL.md`]).toBeUndefined();
    }
    for (const skill of UTILS_MOVED_SKILLS) {
      expect(existsSync(join(CODEX_PLUGINS_DIR, 'tdk-utils', 'skills', skill))).toBe(false);
      expect(utilsFiles[`skills/${skill}/SKILL.md`]).toBeUndefined();
    }
  });

  it('exposes the generated skills interface without a hooks contract', () => {
    const plugin = JSON.parse(
      readFileSync(join(INCEPTION_ROOT, '.codex-plugin', 'plugin.json'), 'utf-8'),
    ) as Record<string, unknown>;

    expect(plugin.name).toBe('tdk-inception');
    expect(plugin.version).toBe('1.0.1');
    expect(plugin.skills).toBe('./skills/');
    expect(plugin.hooks).toBeUndefined();
  });
});
