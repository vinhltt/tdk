import { describe, expect, it } from 'bun:test';
import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { join, relative, resolve, sep } from 'node:path';

const PLUGINS_DIR = resolve(import.meta.dir, '../../../../plugins');
const SOURCE_MANIFEST_PATH = join(PLUGINS_DIR, 'manifest.json');
const INCEPTION_PLUGIN_DIR = join(PLUGINS_DIR, 'tdk-inception');
const INCEPTION_SKILLS_DIR = join(INCEPTION_PLUGIN_DIR, 'skills');
const INCEPTION_AGENTS_DIR = join(INCEPTION_PLUGIN_DIR, 'agents');
const CORE_PLUGIN_DIR = join(PLUGINS_DIR, 'tdk-core');
const CORE_SKILLS_DIR = join(CORE_PLUGIN_DIR, 'skills');
const UTILS_SKILLS_DIR = join(PLUGINS_DIR, 'tdk-utils', 'skills');

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
const INCEPTION_SKILLS = [...CORE_MOVED_SKILLS, ...UTILS_MOVED_SKILLS];
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
const DOCS_WRITER_AGENT_VERSION = '1.0.0';
const RETAINED_CORE_SKILLS = [
  'tdk-specify',
  'tdk-clarify',
  'tdk-plan',
  'tdk-implement',
  'tdk-analyze',
  'tdk-status',
];
const DOCS_WRITER_AGENT = 'tdk-docs-writer';

type PluginManifest = {
  plugins?: Record<
    string,
    {
      version?: string;
      components?: {
        skills?: Record<string, unknown>;
        agents?: Record<string, unknown>;
      };
      files?: Record<string, string>;
    }
  >;
};

function readSourceManifest(): PluginManifest {
  return JSON.parse(readFileSync(SOURCE_MANIFEST_PATH, 'utf-8')) as PluginManifest;
}

function readComponentVersion(path: string): string | undefined {
  return readFileSync(path, 'utf-8').match(/metadata:\s*\n\s+version:\s*["']([^"']+)["']/)?.[1];
}

function listPluginFiles(pluginDir: string, subtree: string): string[] {
  const subtreeRoot = join(pluginDir, subtree);
  if (!existsSync(subtreeRoot)) {
    return [];
  }

  const files: string[] = [];
  const visit = (directory: string): void => {
    for (const entry of readdirSync(directory, { withFileTypes: true })) {
      const entryPath = join(directory, entry.name);
      if (entry.isDirectory()) {
        visit(entryPath);
      } else if (entry.isFile()) {
        files.push(relative(pluginDir, entryPath).split(sep).join('/'));
      }
    }
  };

  visit(subtreeRoot);
  return files.sort();
}

function expectCoreOnlyRuntimeSurface(
  coreFiles: Record<string, string>,
  inceptionFiles: Record<string, string>,
): void {
  for (const directory of ['hooks', 'lib', '__tests__']) {
    expect(existsSync(join(CORE_PLUGIN_DIR, directory))).toBe(true);
    expect(existsSync(join(INCEPTION_PLUGIN_DIR, directory))).toBe(false);

    const runtimeFiles = listPluginFiles(CORE_PLUGIN_DIR, directory);
    expect(runtimeFiles.length).toBeGreaterThan(0);
    for (const runtimeFile of runtimeFiles) {
      expect(coreFiles[runtimeFile]).toBeDefined();
    }
    expect(Object.keys(inceptionFiles).some((file) => file.startsWith(`${directory}/`))).toBe(false);
  }
}

describe('tdk-inception source plugin ownership', () => {
  it('owns exactly the approved skills and docs-writer agent in the source manifest', () => {
    const manifest = readSourceManifest();
    const inception = manifest.plugins?.['tdk-inception'];
    const core = manifest.plugins?.['tdk-core'];
    const utils = manifest.plugins?.['tdk-utils'];
    const inceptionSkills = inception?.components?.skills ?? {};
    const inceptionAgents = inception?.components?.agents ?? {};
    const coreSkills = core?.components?.skills ?? {};
    const utilsSkills = utils?.components?.skills ?? {};
    const coreAgents = core?.components?.agents ?? {};
    const inceptionFiles = inception?.files ?? {};
    const coreFiles = core?.files ?? {};
    const utilsFiles = utils?.files ?? {};

    expect(inception).toBeDefined();
    expect(inception?.version).toBe('1.0.1');
    expect(Object.keys(inceptionSkills).sort()).toEqual([...INCEPTION_SKILLS].sort());
    expect(Object.keys(inceptionAgents)).toEqual([DOCS_WRITER_AGENT]);

    for (const skill of INCEPTION_SKILLS) {
      const oldOwnerSkills = CORE_MOVED_SKILLS.includes(skill) ? coreSkills : utilsSkills;
      const oldOwnerFiles = CORE_MOVED_SKILLS.includes(skill) ? coreFiles : utilsFiles;
      const oldOwnerDir = CORE_MOVED_SKILLS.includes(skill) ? CORE_SKILLS_DIR : UTILS_SKILLS_DIR;
      const skillPrefix = `skills/${skill}/`;
      const movedFiles = listPluginFiles(INCEPTION_PLUGIN_DIR, skillPrefix);

      expect(Object.keys(oldOwnerFiles).filter((file) => file.startsWith(skillPrefix))).toEqual([]);
      expect(existsSync(join(INCEPTION_SKILLS_DIR, skill))).toBe(true);
      expect(existsSync(join(oldOwnerDir, skill))).toBe(false);
      expect(inceptionSkills[skill]).toBeDefined();
      expect(oldOwnerSkills[skill]).toBeUndefined();
      expect(movedFiles.length).toBeGreaterThan(0);
      for (const movedFile of movedFiles) {
        expect(inceptionFiles[movedFile]).toBeDefined();
        expect(oldOwnerFiles[movedFile]).toBeUndefined();
      }
    }

    const docsWriterFile = `agents/${DOCS_WRITER_AGENT}.md`;
    expect(coreFiles[docsWriterFile]).toBeUndefined();
    expect(existsSync(join(INCEPTION_AGENTS_DIR, `${DOCS_WRITER_AGENT}.md`))).toBe(true);
    expect(existsSync(join(CORE_PLUGIN_DIR, docsWriterFile))).toBe(false);
    expect(inceptionAgents[DOCS_WRITER_AGENT]).toBeDefined();
    expect(coreAgents[DOCS_WRITER_AGENT]).toBeUndefined();
    expect(inceptionFiles[docsWriterFile]).toBeDefined();
  });

  it('keeps retained core delivery skills and the core-only runtime surface', () => {
    const manifest = readSourceManifest();
    const core = manifest.plugins?.['tdk-core'];
    const inception = manifest.plugins?.['tdk-inception'];
    const coreSkills = core?.components?.skills ?? {};
    const coreFiles = core?.files ?? {};
    const inceptionFiles = inception?.files ?? {};

    for (const skill of RETAINED_CORE_SKILLS) {
      expect(existsSync(join(CORE_SKILLS_DIR, skill))).toBe(true);
      expect(coreSkills[skill]).toBeDefined();
      expect(coreFiles[`skills/${skill}/SKILL.md`]).toBeDefined();
    }

    expectCoreOnlyRuntimeSurface(coreFiles, inceptionFiles);
  });

  it('removes every moved skill from tdk-core source ownership', () => {
    const manifest = readSourceManifest();
    const coreSkills = manifest.plugins?.['tdk-core']?.components?.skills ?? {};

    expect(Object.keys(coreSkills).sort()).toEqual([...RETAINED_CORE_SKILLS].sort());
  });

  it('removes policy skills from tdk-utils source ownership', () => {
    const manifest = readSourceManifest();
    const utils = manifest.plugins?.['tdk-utils'];
    const utilsSkills = utils?.components?.skills ?? {};
    const utilsFiles = utils?.files ?? {};

    for (const skill of UTILS_MOVED_SKILLS) {
      expect(existsSync(join(UTILS_SKILLS_DIR, skill))).toBe(false);
      expect(utilsSkills[skill]).toBeUndefined();
      expect(utilsFiles[`skills/${skill}/SKILL.md`]).toBeUndefined();
    }
  });

  it('keeps each moved component at its independently-versioned baseline', () => {
    for (const skill of INCEPTION_SKILLS) {
      expect(readComponentVersion(join(INCEPTION_SKILLS_DIR, skill, 'SKILL.md'))).toBe(
        INCEPTION_SKILL_VERSIONS[skill],
      );
    }
    expect(readComponentVersion(join(INCEPTION_AGENTS_DIR, `${DOCS_WRITER_AGENT}.md`))).toBe(
      DOCS_WRITER_AGENT_VERSION,
    );
  });
});
