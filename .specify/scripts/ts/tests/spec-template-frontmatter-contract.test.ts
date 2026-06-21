import { describe, expect, it } from 'bun:test';
import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';

const TEMPLATE_PATH = resolve(
  import.meta.dir,
  '../../../templates/spec-template.md.tpl',
);
const SKILL_PATH = resolve(
  import.meta.dir,
  '../../../plugins/tdk-core/skills/tdk-specify/SKILL.md',
);

function read(path: string): string {
  return readFileSync(path, 'utf-8');
}

describe('spec-template YAML frontmatter migration contract', () => {
  const template = read(TEMPLATE_PATH);
  const skill = read(SKILL_PATH);

  describe('Template structure', () => {
    it('begins with YAML frontmatter block', () => {
      expect(template).toMatch(/^---\n/);
      expect(template).toContain('---\n# Feature Specification');
    });

    it('contains all required frontmatter keys', () => {
      expect(template).toContain('title:');
      expect(template).toContain('status:');
      expect(template).toContain('branch:');
      expect(template).toContain('created:');
      expect(template).toContain('input:');
      expect(template).toContain('memory_context_loaded:');
      expect(template).toContain('schema_version:');
    });

    it('includes schema_version: 1', () => {
      expect(template).toContain('schema_version: 1');
    });

    it('contains the H1 title', () => {
      expect(template).toContain('# Feature Specification:');
    });

    it('removes bold-header metadata lines', () => {
      expect(template).not.toContain('**Feature Branch**');
      expect(template).not.toContain('**Created**');
      expect(template).not.toContain('**Status**');
      expect(template).not.toContain('**Input**');
      expect(template).not.toContain('**Memory context loaded**');
    });
  });

  describe('Skill instruction on frontmatter emission', () => {
    it('instructs agent to emit schema_version in frontmatter', () => {
      expect(skill).toContain('schema_version: 1');
    });

    it('instructs agent to set memory_context_loaded based on memory validation', () => {
      expect(skill).toContain('memory_context_loaded');
      expect(skill).toContain('Step 0.memory');
      expect(skill).toContain('true');
      expect(skill).toContain('false');
    });

    it('removes stale unconditional memory_context_loaded: false bullet', () => {
      expect(skill).not.toContain(
        'Note in `spec.md` frontmatter: `memory_context_loaded: false`',
      );
    });

    it('describes frontmatter emission in Step 2 specification section', () => {
      expect(skill).toContain(
        'Emit the YAML frontmatter block at the top with `title`, `status`, `branch`, `created`, `input`, `memory_context_loaded`',
      );
      expect(skill).toContain('schema_version: 1');
    });
  });
});
