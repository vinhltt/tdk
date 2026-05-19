import { describe, it, expect } from 'bun:test';
import {
  parseAutoGenSections,
  spliceAutoGenSections,
  type AutoGenSection,
} from '../../src/lib/auto-gen-markers';

const sectionFixture = (id: string, body = 'hello', sources = 'a, b', instr = 'do thing') =>
  `<!-- AUTO-GEN-START: ${id}\nSOURCES: ${sources}\nINSTRUCTION: ${instr}\n-->\n${body}\n<!-- AUTO-GEN-END -->`;

describe('parseAutoGenSections', () => {
  it('returns [] for empty content', () => {
    expect(parseAutoGenSections('')).toEqual([]);
  });

  it('returns [] for content with no markers', () => {
    expect(parseAutoGenSections('# Title\n\nJust prose.\n')).toEqual([]);
  });

  it('parses single section with sources + instruction', () => {
    const content = sectionFixture('tech-stack', 'TypeScript + Bun', 'package.json, tsconfig.json', 'List runtime');
    const [sec] = parseAutoGenSections(content);
    expect(sec).toBeDefined();
    expect(sec!.id).toBe('tech-stack');
    expect(sec!.sources).toEqual(['package.json', 'tsconfig.json']);
    expect(sec!.instruction).toBe('List runtime');
    expect(sec!.body).toBe('TypeScript + Bun');
  });

  it('parses multiple sections preserving order', () => {
    const content = `# Header\n${sectionFixture('one', 'A')}\n\nbetween\n\n${sectionFixture('two', 'B')}\n`;
    const secs = parseAutoGenSections(content);
    expect(secs.map(s => s.id)).toEqual(['one', 'two']);
    expect(secs[0]!.body).toBe('A');
    expect(secs[1]!.body).toBe('B');
  });

  it('throws on missing END', () => {
    const broken = `<!-- AUTO-GEN-START: x\nSOURCES: a\nINSTRUCTION: do\n-->\nbody never closed\n`;
    expect(() => parseAutoGenSections(broken)).toThrow(/Missing AUTO-GEN-END/);
  });

  it('throws on nested START in body', () => {
    const broken = `<!-- AUTO-GEN-START: outer\nSOURCES: a\nINSTRUCTION: x\n-->\n<!-- AUTO-GEN-START: inner\n-->\n<!-- AUTO-GEN-END -->`;
    expect(() => parseAutoGenSections(broken)).toThrow(/Nested AUTO-GEN-START/);
  });

  it('throws on duplicate id', () => {
    const dup = `${sectionFixture('same', 'A')}\n${sectionFixture('same', 'B')}`;
    expect(() => parseAutoGenSections(dup)).toThrow(/Duplicate.*"same"/);
  });

  it('throws on unclosed header (no -->)', () => {
    const broken = `<!-- AUTO-GEN-START: x\nSOURCES: a\nINSTRUCTION: do\n<!-- AUTO-GEN-END -->`;
    expect(() => parseAutoGenSections(broken)).toThrow(/AUTO-GEN-END before header/);
  });

  it('handles empty body', () => {
    const content = `<!-- AUTO-GEN-START: empty\nSOURCES: a\nINSTRUCTION: x\n-->\n<!-- AUTO-GEN-END -->`;
    const [sec] = parseAutoGenSections(content);
    expect(sec!.body).toBe('');
  });

  it('preserves embedded HTML-comment-like content in body', () => {
    const tricky = `body line\n<!-- not a real start -->\n  <!-- AUTO-GEN-START: indented-not-matched -->\nmore body`;
    const content = `<!-- AUTO-GEN-START: code\nSOURCES: x\nINSTRUCTION: y\n-->\n${tricky}\n<!-- AUTO-GEN-END -->`;
    const [sec] = parseAutoGenSections(content);
    expect(sec!.body).toBe(tricky);
  });
});

describe('spliceAutoGenSections', () => {
  it('round-trips with empty replacement map (byte-identical)', () => {
    const content = `# Doc\n\n${sectionFixture('one', 'A')}\n\nuser prose\n\n${sectionFixture('two', 'B')}\n`;
    const { content: out, warnings } = spliceAutoGenSections(content, new Map());
    expect(out).toBe(content);
    // Both sections lack replacements → both warn.
    expect(warnings.length).toBe(2);
  });

  it('replaces single section body, preserves outside bytes', () => {
    const content = `# Doc\n\n${sectionFixture('one', 'OLD')}\n\ntail prose\n`;
    const { content: out, warnings } = spliceAutoGenSections(
      content,
      new Map([['one', 'NEW BODY']]),
    );
    expect(out).toContain('NEW BODY');
    expect(out).not.toContain('OLD');
    expect(out).toContain('# Doc');
    expect(out).toContain('tail prose');
    // Old non-empty body replaced → warning.
    expect(warnings.some(w => /non-empty body for "one"/.test(w))).toBe(true);
  });

  it('replaces multiple sections at once', () => {
    const content = `${sectionFixture('a', 'AA')}\nmid\n${sectionFixture('b', 'BB')}`;
    const { content: out } = spliceAutoGenSections(
      content,
      new Map([
        ['a', 'A2'],
        ['b', 'B2'],
      ]),
    );
    expect(out).toContain('A2');
    expect(out).toContain('B2');
    expect(out).toContain('mid');
    expect(out).not.toContain('AA');
    expect(out).not.toContain('BB');
  });

  it('warns on replacement for unknown id', () => {
    const content = sectionFixture('known', 'x');
    const { warnings } = spliceAutoGenSections(content, new Map([['ghost', 'y']]));
    expect(warnings.some(w => /unknown section id "ghost"/.test(w))).toBe(true);
  });

  it('inserts empty body when replacement is empty string', () => {
    const content = sectionFixture('x', 'OLD');
    const { content: out } = spliceAutoGenSections(content, new Map([['x', '']]));
    // Body lines fully removed; markers remain adjacent.
    expect(out).toMatch(/-->\n<!-- AUTO-GEN-END -->/);
  });

  it('preserves CRLF line endings', () => {
    const content = sectionFixture('x', 'OLD').replace(/\n/g, '\r\n');
    const { content: out } = spliceAutoGenSections(content, new Map([['x', 'NEW']]));
    expect(out.includes('\r\n')).toBe(true);
    expect(out.includes('NEW')).toBe(true);
  });

  it('idempotent: splice with same body yields identical content + no loss warning', () => {
    const content = sectionFixture('x', 'SAME');
    const { content: out, warnings } = spliceAutoGenSections(
      content,
      new Map([['x', 'SAME']]),
    );
    expect(out).toBe(content);
    // Body equals replacement → no "non-empty replaced" warning.
    expect(warnings.some(w => /non-empty body for "x"/.test(w))).toBe(false);
  });

  it('parse → derive replacements from current bodies → splice yields original', () => {
    const content = `pre\n${sectionFixture('a', 'AA')}\nmid\n${sectionFixture('b', 'BB')}\npost`;
    const sections: AutoGenSection[] = parseAutoGenSections(content);
    const replacements = new Map(sections.map(s => [s.id, s.body]));
    const { content: out } = spliceAutoGenSections(content, replacements);
    expect(out).toBe(content);
  });
});
