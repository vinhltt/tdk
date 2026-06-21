import { describe, expect, it } from 'bun:test';
import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { parseAutoGenSections } from '../src/lib/auto-gen-markers';

const CONSTITUTION_SKILL_PATH = resolve(
  import.meta.dir,
  '../../../plugins/tdk-core/skills/tdk-constitution/SKILL.md',
);
const PRODUCT_CONTEXT_TEMPLATE_PATH = resolve(
  import.meta.dir,
  '../../../templates/project-docs/product-context.md.tpl',
);

function readIfExists(path: string): string {
  return existsSync(path) ? readFileSync(path, 'utf-8') : '';
}

describe('tdk-constitution product context contract', () => {
  const skill = readIfExists(CONSTITUTION_SKILL_PATH);
  const template = readIfExists(PRODUCT_CONTEXT_TEMPLATE_PATH);

  it('renders product-context.md as constitution-owned project knowledge', () => {
    expect(skill).toContain('product-context.md');
    expect(skill).toContain('.specify/templates/project-docs/product-context.md.tpl');
    expect(skill).toContain('Product-level facts live in `product-context.md`');
    expect(skill).toContain('Validate project knowledge artifacts');
  });

  it('provides a marker-safe product-context template', () => {
    expect(existsSync(PRODUCT_CONTEXT_TEMPLATE_PATH)).toBe(true);
    const sections = parseAutoGenSections(template);

    expect(sections.length).toBeGreaterThan(0);
    expect(new Set(sections.map(s => s.id)).size).toBe(sections.length);
    for (const section of sections) {
      expect(section.sources.length).toBeGreaterThan(0);
      expect(section.instruction.length).toBeGreaterThan(0);
    }
  });

  it('separates product authority from epic discovery', () => {
    expect(template).toContain('market context');
    expect(template).toContain('business model');
    expect(template).toContain('audience/personas summary');
    expect(template).toContain('competitive context');
    expect(template).toContain('SOURCES: constitution, memory, accepted project brief, accepted update feedback');
  });
});
