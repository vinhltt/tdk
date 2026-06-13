import { describe, expect, it } from 'bun:test';
import { existsSync, readFileSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { resolve } from 'node:path';
import { parseAutoGenSections } from '../src/lib/auto-gen-markers';

const TS_ROOT = resolve(import.meta.dir, '..');
const SPECIFY_ROOT = resolve(import.meta.dir, '../../..');

function readSpecify(relativePath: string): string {
  return readFileSync(resolve(SPECIFY_ROOT, relativePath), 'utf-8');
}

describe('constitution-driven project init contract', () => {
  it('does not expose tdk-docs as a user-facing skill or manifest component', () => {
    const removedSkillPath = ['plugins/tdk-core/skills', 'tdk-docs', 'SKILL.md'].join('/');
    expect(existsSync(resolve(SPECIFY_ROOT, removedSkillPath))).toBe(false);

    const manifest = JSON.parse(readSpecify('plugins/manifest.json')) as {
      plugins?: Record<string, { components?: { skills?: Record<string, unknown> }; files?: Record<string, string> }>;
    };
    const core = manifest.plugins?.['tdk-core'];
    expect(core?.components?.skills ?? {}).not.toHaveProperty('tdk-docs');
    const removedSkillPrefix = ['skills', 'tdk-docs', ''].join('/');
    expect(Object.keys(core?.files ?? {}).some(file => file.startsWith(removedSkillPrefix))).toBe(false);
  });

  it('removes public project-docs CLI surfaces while keeping sub-workspace docs', () => {
    const index = readSpecify('scripts/ts/src/index.ts');
    expect(index).not.toContain('createProjectDocsCommandGroup');
    expect(index).not.toContain("new Command('docs')");

    const rootHelp = spawnSync(
      'bun',
      ['src/index.ts', '--help'],
      {
      cwd: TS_ROOT,
      stdout: 'pipe',
      stderr: 'pipe',
      encoding: 'utf-8',
    });
    expect(rootHelp.status).toBe(0);
    expect(rootHelp.stdout.toString()).not.toMatch(/\n\s+docs\b/);

    const subWorkspaceHelp = spawnSync(
      'bun',
      ['src/index.ts', 'sub-workspace', '--help'],
      {
      cwd: TS_ROOT,
      stdout: 'pipe',
      stderr: 'pipe',
      encoding: 'utf-8',
    });
    expect(subWorkspaceHelp.status).toBe(0);
    expect(subWorkspaceHelp.stdout.toString()).toMatch(/\n\s+docs\b/);
  });

  it('preserves tdk-docs-writer for sub-workspace documentation', () => {
    expect(existsSync(resolve(SPECIFY_ROOT, 'plugins/tdk-core/agents/tdk-docs-writer.md'))).toBe(true);

    const subWorkspaceSkill = readSpecify('plugins/tdk-core/skills/tdk-sub-workspace-docs/SKILL.md');
    expect(subWorkspaceSkill).toContain('tdk-docs-writer');

    const manifest = JSON.parse(readSpecify('plugins/manifest.json')) as {
      plugins?: Record<string, { components?: { agents?: Record<string, unknown> }; files?: Record<string, string> }>;
    };
    const core = manifest.plugins?.['tdk-core'];
    expect(core?.components?.agents ?? {}).toHaveProperty('tdk-docs-writer');
    expect(Object.keys(core?.files ?? {})).toContain('agents/tdk-docs-writer.md');
  });

  it('documents fresh and existing memory behavior in tdk-constitution', () => {
    const skill = readSpecify('plugins/tdk-core/skills/tdk-constitution/SKILL.md');

    expect(skill).toContain('--init');
    expect(skill).toContain('create-if-missing');
    expect(skill).toContain('.specify/memory/constitution.md');
    expect(skill).toContain('memory-index.md');
    expect(skill).toContain('memory.yaml');
    expect(skill).toContain('tdk-memory-init');
    expect(skill).toContain('tdk-memory-update');
    expect(skill).toContain('README conflicts');
    expect(skill).toContain('stop for confirmation');
    expect(skill).not.toContain('always operate on the existing `.specify/memory/constitution.md` file');
  });

  it('wires constitution init to project knowledge templates', () => {
    const skill = readSpecify('plugins/tdk-core/skills/tdk-constitution/SKILL.md');

    const templateTargets = [
      ['templates/project-docs/project-overview-prd.md.tpl', '.specify/templates/project-docs/project-overview-prd.md.tpl', 'project-overview-prd.md'],
      ['templates/project-docs/system-architecture.md.tpl', '.specify/templates/project-docs/system-architecture.md.tpl', 'system-architecture.md'],
      ['templates/project-docs/project-roadmap.md.tpl', '.specify/templates/project-docs/project-roadmap.md.tpl', 'project-roadmap.md'],
    ];

    for (const [sourcePath, skillPath, target] of templateTargets) {
      expect(existsSync(resolve(SPECIFY_ROOT, sourcePath))).toBe(true);
      expect(skill).toContain(skillPath);
      expect(skill).toContain(target);
    }

    expect(skill).toContain('start from the matching template');
    expect(skill).toContain('update only matching AUTO-GEN sections');
    expect(skill).toContain('README.md.tpl');
    expect(skill).toContain('not part of the default');
  });

  it('constitution bootstrap template has source and instruction comments', () => {
    const template = readSpecify('plugins/tdk-core/skills/tdk-constitution/templates/constitution.md.tpl');
    const sections = parseAutoGenSections(template);
    const ids = sections.map(section => section.id);

    expect(ids).toEqual([
      'constitution-title',
      'core-principles',
      'additional-constraints',
      'development-workflow',
      'project-knowledge-authority',
      'governance',
    ]);
    for (const section of sections) {
      expect(section.sources.length).toBeGreaterThan(0);
      expect(section.instruction.length).toBeGreaterThan(0);
    }
    expect(template).toContain('[PROJECT_NAME]');
    expect(template).toContain('[CONSTITUTION_VERSION]');
  });
});
