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

  it('declares the parent epic child-spec-seed breakdown command and hard boundary', () => {
    expect(skill).toContain('tdk-task-breakdown');
    expect(skill).toContain('child-spec-seed');
    expect(skill).toContain('Use before child /tdk-specify loops');
    expect(skill).toContain('Create GitHub, GitLab, Backlog, or other tracker issues');
    expect(skill).toContain('Mint `UR-*`, `FR-*`, `SC-*`, or `FS-*` identifiers');
    expect(skill).not.toMatch(/\bgh\s+issue\s+create\b/);
    expect(skill).not.toMatch(/\bglab\s+issue\s+create\b/i);
    expect(skill).not.toMatch(/\bbacklog\s+(issue|ticket)\s+create\b/i);
  });

  it('blocks unready parent epic artifacts before writing seed files', () => {
    expect(skill).toContain('epic-prd/open-questions.md');
    expect(skill).toContain('high-level-design.md');
    expect(skill).toContain('STOP before writing any file');
    expect(skill).toContain('Blocking Questions');
  });

  it('restricts output to the tasks-breakdown manifest and child spec seed files', () => {
    expect(skill).toContain('tasks-breakdown.md');
    expect(skill).toContain('tasks-breakdown/task-NNN-{slice}.md');
    expect(skill).toContain('`tasks-breakdown.md` is the authoritative manifest');
    expect(reference).toContain('tasks-breakdown.md');
    expect(reference).toContain('task-NNN-{slice}.md');
    expect(reference).toContain('Child Spec Seeds');
  });

  it('updates the epic dashboard and detects legacy nested manifests', () => {
    const combined = `${skill}\n${reference}`;

    expect(combined).toContain('{FEATURE_DIR}/index.md');
    expect(combined).toContain('stage manifest');
    expect(combined).toContain('next command');
    expect(combined).toContain('legacy layout detected');
    expect(combined).toContain('tasks-breakdown/index.md');
    expect(combined).toContain('--force');
    expect(combined).toContain('do not auto-migrate');
  });

  it('requires seed files to cite parent slice and PRD/HLD sources, not child requirement IDs', () => {
    expect(reference).toContain('slice_key');
    expect(reference).toContain('Source PRD refs');
    expect(reference).toContain('Source HLD refs');
    expect(reference).toContain('Suggested Child Spec Command');
    expect(reference).toContain('must not mint `UR-*`, `FR-*`, `SC-*`, or `FS-*`');
  });

  it('keeps child implementation lane out of HLD by default', () => {
    expect(skill).toMatch(/Child specs are the\s+implementation units after this stage/);
    expect(skill).toContain('/tdk-specify <child-id> "<seed>"');
    expect(skill).toContain('use child `/tdk-plan`');
    expect(skill).not.toContain('child /tdk-epic-hld');
  });
});
