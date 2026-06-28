// Verify all sub-workspace-docs templates parse cleanly with Phase 1 lib
// and round-trip via splice (no replacement) produces byte-identical output.

import { describe, it, expect } from 'bun:test';
import { readFileSync, readdirSync } from 'node:fs';
import { join, resolve } from 'node:path';
import {
  parseAutoGenSections,
  spliceAutoGenSections,
} from '../../src/lib/auto-gen-markers';

const TEMPLATE_SUITES = [
  {
    name: 'sub-workspace-docs templates',
    dir: resolve(__dirname, '../../../../templates/sub-workspace-docs'),
    files: [
      'README.md.tpl',
      'code-standards.md.tpl',
      'codebase-summary.md.tpl',
      'system-architecture.md.tpl',
    ],
  },
  {
    name: 'legacy project-docs templates',
    dir: resolve(__dirname, '../../../../templates/project-docs'),
    files: [
      'README.md.tpl',
      'product-context.md.tpl',
      'project-overview-prd.md.tpl',
      'project-roadmap.md.tpl',
      'system-architecture.md.tpl',
    ],
  },
];

for (const suite of TEMPLATE_SUITES) {
describe(suite.name, () => {
  const templates = readdirSync(suite.dir).filter(f => f.endsWith('.md.tpl'));

  it(`found ${suite.files.length} .tpl files`, () => {
    expect(templates.length).toBe(suite.files.length);
    expect(templates.sort()).toEqual(suite.files);
  });

  for (const file of templates) {
    describe(file, () => {
      const content = readFileSync(join(suite.dir, file), 'utf-8');

      it('parses without throwing', () => {
        expect(() => parseAutoGenSections(content)).not.toThrow();
      });

      it('has at least one AUTO-GEN section', () => {
        const sections = parseAutoGenSections(content);
        expect(sections.length).toBeGreaterThan(0);
      });

      it('all section ids are unique within file', () => {
        const sections = parseAutoGenSections(content);
        const ids = sections.map(s => s.id);
        expect(new Set(ids).size).toBe(ids.length);
      });

      it('every section has SOURCES + INSTRUCTION', () => {
        const sections = parseAutoGenSections(content);
        for (const s of sections) {
          expect(s.sources.length).toBeGreaterThan(0);
          expect(s.instruction.length).toBeGreaterThan(0);
        }
      });

      if (suite.name === 'legacy project-docs templates') {
        it('uses constitution and memory authority wording for compatibility only', () => {
          expect(content).not.toContain('tdk-docs');
          expect(content).toContain('constitution');
          expect(content).toContain('memory');
        });
      }

      it('round-trips byte-identical with empty replacements', () => {
        const { content: out } = spliceAutoGenSections(content, new Map());
        expect(out).toBe(content);
      });

      it('round-trips byte-identical when replacements match existing bodies', () => {
        const sections = parseAutoGenSections(content);
        const replacements = new Map(sections.map(s => [s.id, s.body]));
        const { content: out } = spliceAutoGenSections(content, replacements);
        expect(out).toBe(content);
      });
    });
  }
});
}
