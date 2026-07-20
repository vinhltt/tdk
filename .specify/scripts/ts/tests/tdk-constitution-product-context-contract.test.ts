import { describe, expect, it } from 'bun:test';
import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const CONSTITUTION_SKILL_PATH = resolve(
  import.meta.dir,
  '../../../plugins/tdk-inception/skills/tdk-constitution/SKILL.md',
);
const ARC42_SUMMARY_TEMPLATE_PATH = resolve(
  import.meta.dir,
  '../../../templates/memory/arc42-summary-template.md.tpl',
);
const CURRENT_AUTHORITY_GUIDES = [
  ['English workflow map', '../../../docs/en/guides/workflow-map.md'],
  ['Vietnamese workflow map', '../../../docs/vi/guides/workflow-map.md'],
  ['English skills guide', '../../../docs/en/guides/skills-guide.md'],
  ['Vietnamese skills guide', '../../../docs/vi/guides/skills-guide.md'],
] as const;
const CONSTITUTION_SKILLS_GUIDES = [
  ['English skills guide', '../../../docs/en/guides/skills-guide.md'],
  ['Vietnamese skills guide', '../../../docs/vi/guides/skills-guide.md'],
] as const;
const CURRENT_AUTHORITY_TOKENS = [
  'constitution.md',
  'memory-index.md',
  'memory.yaml',
  'Typed Memory v3',
  'binding: true',
  'arc42/',
  'binding: false',
] as const;

function readIfExists(path: string): string {
  return existsSync(path) ? readFileSync(path, 'utf-8') : '';
}

function section(content: string, heading: string): string {
  const start = content.search(new RegExp(`^${heading.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}$`, 'm'));
  expect(start).toBeGreaterThanOrEqual(0);
  const rest = content.slice(start + heading.length);
  const next = rest.search(/\n### /);
  return next === -1 ? rest : rest.slice(0, next);
}

describe('tdk-constitution arc42 project context contract', () => {
  const skill = readIfExists(CONSTITUTION_SKILL_PATH);
  const template = readIfExists(ARC42_SUMMARY_TEMPLATE_PATH);

  it('renders project context through arc42 summaries and typed memory routes', () => {
    const canonicalSection = section(skill, '### Arc42 And Typed Memory Templates');

    expect(canonicalSection).toContain('arc42/01-introduction-and-goals.md');
    expect(canonicalSection).toContain('arc42/03-context-and-scope.md');
    expect(canonicalSection).toContain('arc42/04-solution-strategy.md');
    expect(canonicalSection).toContain('.specify/templates/memory/arc42-summary-template.md.tpl');
    expect(canonicalSection).toContain('Product-level facts live in constitution plus typed memory routes');
    expect(skill).toContain('Validate project knowledge artifacts');
    expect(canonicalSection).not.toContain('product-context.md');
    expect(canonicalSection).not.toContain('.specify/templates/project-docs/product-context.md.tpl');
  });

  it('provides a non-binding arc42 summary template', () => {
    expect(existsSync(ARC42_SUMMARY_TEMPLATE_PATH)).toBe(true);
    expect(template).toContain('type: arc42-summary');
    expect(template).toContain('binding: false');
    expect(template).toContain('related:');
    expect(template).toContain('typed binding files');
  });

  it('keeps legacy product context report-only unless explicitly migrated', () => {
    const legacySection = section(skill, '### Legacy Root Project Docs Policy');

    expect(legacySection).toContain('product-context.md');
    expect(legacySection).toContain('Report it for user review');
    expect(legacySection).toContain('do not recreate it as a canonical target');
    expect(skill).toContain('Delivery timelines and roadmap dates stay outside durable memory');
  });

  it.each(CURRENT_AUTHORITY_GUIDES)(
    'documents current constitution and Memory v3 authority in the %s',
    (_label, relativePath) => {
      const guidePath = resolve(import.meta.dir, relativePath);
      const guide = readIfExists(guidePath);

      expect(existsSync(guidePath)).toBe(true);
      expect(guide).not.toContain('product-context.md');
      expect(guide).not.toContain('/tdk-constitution --update');
      for (const token of CURRENT_AUTHORITY_TOKENS) {
        expect(guide).toContain(token);
      }
    },
  );

  it.each(CONSTITUTION_SKILLS_GUIDES)(
    'documents conditional memory bootstrap outputs in the %s',
    (_label, relativePath) => {
      const guide = readIfExists(resolve(import.meta.dir, relativePath));
      const constitutionRow = guide
        .split('\n')
        .find((line) => line.startsWith('| constitution |'));

      expect(constitutionRow).toContain('memory-index.md');
      expect(constitutionRow).toContain('memory.yaml');
    },
  );

  it('documents an explicit --update mode instead of implicit-only updates, and stops on conflicting or unknown modes', () => {
    expect(skill).toContain('/tdk-constitution --update');
    expect(skill).toContain('`--update`+existing updates');
    expect(skill).toContain('conflicting or unknown modes stop');
  });
});
