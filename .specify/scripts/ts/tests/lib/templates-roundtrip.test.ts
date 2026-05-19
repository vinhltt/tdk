// Verify all sub-workspace-docs templates parse cleanly with Phase 1 lib
// and round-trip via splice (no replacement) produces byte-identical output.

import { describe, it, expect } from 'bun:test';
import { readFileSync, readdirSync } from 'node:fs';
import { join, resolve } from 'node:path';
import {
  parseAutoGenSections,
  spliceAutoGenSections,
} from '../../src/lib/auto-gen-markers';

const TEMPLATES_DIR = resolve(__dirname, '../../../../templates/sub-workspace-docs');

describe('sub-workspace-docs templates', () => {
  const templates = readdirSync(TEMPLATES_DIR).filter(f => f.endsWith('.md.tpl'));

  it('found 4 .tpl files', () => {
    expect(templates.length).toBe(4);
    expect(templates.sort()).toEqual([
      'README.md.tpl',
      'code-standards.md.tpl',
      'codebase-summary.md.tpl',
      'system-architecture.md.tpl',
    ]);
  });

  for (const file of templates) {
    describe(file, () => {
      const content = readFileSync(join(TEMPLATES_DIR, file), 'utf-8');

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
