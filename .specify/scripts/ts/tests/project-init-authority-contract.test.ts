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

function section(content: string, heading: string): string {
  const start = content.search(new RegExp(`^${heading.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}$`, 'm'));
  expect(start).toBeGreaterThanOrEqual(0);
  const rest = content.slice(start + heading.length);
  const next = rest.search(/\n### /);
  return next === -1 ? rest : rest.slice(0, next);
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

  it('wires constitution init to arc42 summaries and typed memory templates', () => {
    const skill = readSpecify('plugins/tdk-core/skills/tdk-constitution/SKILL.md');

    const canonicalSection = section(skill, '### Arc42 And Typed Memory Templates');
    const templateTargets = [
      ['templates/memory/arc42-readme-template.md.tpl', '.specify/templates/memory/arc42-readme-template.md.tpl', 'arc42/README.md'],
      ['templates/memory/arc42-summary-template.md.tpl', '.specify/templates/memory/arc42-summary-template.md.tpl', 'arc42/01-introduction-and-goals.md'],
      ['templates/memory/decision-record-template.md.tpl', '.specify/templates/memory/decision-record-template.md.tpl', 'decisions/{decision-id}.md'],
      ['templates/memory/risk-debt-template.md.tpl', '.specify/templates/memory/risk-debt-template.md.tpl', 'risks-and-debt/{risk-or-debt-id}.md'],
      ['templates/memory/quality-requirement-template.md.tpl', '.specify/templates/memory/quality-requirement-template.md.tpl', 'quality-requirements/{quality-attribute}.md'],
    ];

    for (const [sourcePath, skillPath, target] of templateTargets) {
      expect(existsSync(resolve(SPECIFY_ROOT, sourcePath))).toBe(true);
      expect(canonicalSection).toContain(skillPath);
      expect(canonicalSection).toContain(target);
    }

    expect(canonicalSection).toContain('binding: false');
    expect(canonicalSection).toContain('start from the matching memory template');
    expect(canonicalSection).not.toContain('project-overview-prd.md');
    expect(canonicalSection).not.toContain('product-context.md');
    expect(canonicalSection).not.toContain('system-architecture.md');
    expect(canonicalSection).not.toContain('project-roadmap.md');
  });

  it('handles legacy root project docs with report plus stub policy', () => {
    const skill = readSpecify('plugins/tdk-core/skills/tdk-constitution/SKILL.md');
    const legacySection = section(skill, '### Legacy Root Project Docs Policy');

    for (const legacyFile of [
      'project-overview-prd.md',
      'product-context.md',
      'system-architecture.md',
      'project-roadmap.md',
    ]) {
      expect(legacySection).toContain(legacyFile);
    }

    expect(legacySection).toContain('Policy: report + stub');
    expect(legacySection).toContain('markerless');
    expect(legacySection).toContain('not overwrite');
    expect(legacySection).toContain('legacy and non-authoritative');
    expect(skill).toContain('update only matching AUTO-GEN sections');
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

  it('spec template points durable facts at memory v3 routes', () => {
    const template = readSpecify('templates/spec-template.md.tpl');

    expect(template).toContain('constitution and memory v3 typed routes');
    expect(template).toContain('arc42 summaries only as read-model context');
    expect(template).not.toContain('constitution/product-context.md');
  });
});
