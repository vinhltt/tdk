import { describe, expect, it } from 'bun:test';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const UT_BACKFILL_SKILL = resolve(import.meta.dir, '../../../plugins/tdk-core/skills/tdk-ut-backfill-plan/SKILL.md');
const UT_USAGE_DOC = resolve(import.meta.dir, '../../../docs/en/guides/tdk-ut-backfill-skills-usage.md');

function read(path: string): string {
  return readFileSync(path, 'utf-8');
}

describe('TDK UT backfill module policy routing contracts', () => {
  const skill = read(UT_BACKFILL_SKILL);
  const usage = read(UT_USAGE_DOC);

  it('does not offer ad hoc module creation from UT planning', () => {
    expect(skill).not.toContain('Create a module');
    expect(skill).not.toContain('add a module entry to `.specify.json`');
    expect(skill).not.toContain('Append module to `modules[]`');
    expect(skill).not.toContain('write `.specify.json` back');
  });

  it('routes missing module ownership to topology and policy workflow', () => {
    expect(skill).toContain('/tdk-boundary-map');
    expect(skill).toContain('/tdk-workspace-topology-apply --dry-run');
    expect(skill).toContain('/tdk-module-boundary-policy');
    expect(skill).toContain('does not edit `.specify/.specify.json`');
    expect(skill).toContain('Proceed at sub-workspace level');
  });

  it('documents topology as the durable module ownership path', () => {
    expect(usage).toContain('Durable module ownership belongs in topology');
    expect(usage).toContain('/tdk-boundary-map');
    expect(usage).toContain('/tdk-workspace-topology-apply --dry-run');
    expect(usage).toContain('/tdk-module-boundary-policy');
  });
});
