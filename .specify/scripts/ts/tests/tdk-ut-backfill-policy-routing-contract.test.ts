import { describe, expect, it } from 'bun:test';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const UT_BACKFILL_SKILL = resolve(import.meta.dir, '../../../plugins/tdk-core/skills/tdk-ut-backfill-plan/SKILL.md');
const SKILLS_GUIDE = resolve(import.meta.dir, '../../../docs/en/guides/skills-guide.md');
const WORKFLOW_MAP = resolve(import.meta.dir, '../../../docs/en/guides/workflow-map.md');

function read(path: string): string {
  return readFileSync(path, 'utf-8');
}

describe('TDK UT backfill module policy routing contracts', () => {
  const skill = read(UT_BACKFILL_SKILL);
  const usage = `${read(SKILLS_GUIDE)}\n${read(WORKFLOW_MAP)}`;

  it('does not offer ad hoc module creation from UT planning', () => {
    expect(skill).not.toContain('Create a module');
    expect(skill).not.toContain('add a module entry to `.specify.json`');
    expect(skill).not.toContain('Append module to `modules[]`');
    expect(skill).not.toContain('write `.specify.json` back');
  });

  it('routes missing module ownership to topology and policy workflow', () => {
    expect(skill).toContain('/tdk-workspace-layout-propose');
    expect(skill).toContain('/tdk-workflow-config-apply');
    expect(skill).not.toContain('/tdk-workflow-config-apply --dry-run');
    expect(skill).toContain('/tdk-workspace-dependency-policy');
    expect(skill).toContain('does not edit `.specify/.specify.json`');
    expect(skill).toContain('Proceed at sub-workspace level');
  });

  it('documents layout and policy as the durable module ownership path', () => {
    expect(usage).toContain('/tdk-ut-backfill-plan <id>');
    expect(usage).toContain('/tdk-workspace-layout-propose');
    expect(usage).toContain('/tdk-workflow-config-apply');
    expect(usage).not.toContain('/tdk-workflow-config-apply --dry-run');
    expect(usage).toContain('/tdk-workspace-dependency-policy');
  });
});
