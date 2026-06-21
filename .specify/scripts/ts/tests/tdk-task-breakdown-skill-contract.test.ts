import { describe, expect, it } from 'bun:test';
import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';

const SKILL_PATH = resolve(
  import.meta.dir,
  '../../../plugins/tdk-core/skills/tdk-task-breakdown/SKILL.md',
);
const REFERENCE_PATH = resolve(
  dirname(SKILL_PATH),
  'references/task-breakdown-output-contract.md',
);

function read(path: string): string {
  return readFileSync(path, 'utf-8');
}

describe('tdk-task-breakdown skill contract', () => {
  const skill = read(SKILL_PATH);
  const reference = read(REFERENCE_PATH);

  it('declares the portable task breakdown command and hard boundary', () => {
    expect(skill).toContain('tdk-task-breakdown');
    expect(skill).toContain('Markdown work-item artifacts');
    expect(skill).toContain('does NOT create GitHub, GitLab, Backlog, or other tracker issues');
    expect(skill).not.toMatch(/\bgh\s+issue\s+create\b/);
    expect(skill).not.toMatch(/\bglab\s+issue\s+create\b/i);
    expect(skill).not.toMatch(/\bbacklog\s+(issue|ticket)\s+create\b/i);
  });

  it('blocks unresolved specs before writing task files', () => {
    expect(skill).toContain('## 9. Unresolved Questions');
    expect(skill).toContain('STOP before writing any file');
    expect(skill).toContain('None');
  });

  it('restricts output to the tasks-breakdown manifest and task files', () => {
    expect(skill).toContain('tasks-breakdown/index.md');
    expect(skill).toContain('tasks-breakdown/task-NNN-{slug}.md');
    expect(skill).toContain('`index.md` is the authoritative manifest');
    expect(reference).toContain('tasks-breakdown/index.md');
    expect(reference).toContain('task-NNN-{slug}.md');
    expect(reference).toContain('Consumer tracker sync must read task files listed in `index.md`');
  });

  it('requires task files to cite source requirements', () => {
    expect(reference).toContain('UR-*');
    expect(reference).toContain('FR-*');
    expect(reference).toContain('SC-*');
    expect(reference).toContain('Source Requirements');
  });

  it('documents the promoted-work-item Status column, marker, and demote checklist', () => {
    // Reference: output-contract documents the Status column header, promoted marker, back-link field, demote section
    expect(reference).toContain('| # | Task | Source Requirements | File | Status |');
    expect(reference).toContain('promoted → ');
    expect(reference).toContain('promoted_from');
    expect(reference).toContain('Demote');
    expect(reference).toContain('parent_spec');

    // Skill: documents regeneration preserve rule, promoted marker format, and crosslink to promote-convention
    expect(skill).toContain('Preserve any row whose');
    expect(skill).toContain('promoted → <child-id>');
    expect(skill).toContain('promote-convention.md');
  });
});
