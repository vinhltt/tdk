import { describe, expect, it } from 'bun:test';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const PLAN_DESIGN_PHASE = resolve(
  import.meta.dir,
  '../../../plugins/tdk-core/skills/tdk-plan/references/design-phase.md',
);
const SKILLS_GUIDE = resolve(import.meta.dir, '../../../docs/en/guides/skills-guide.md');
const WORKFLOW_MAP = resolve(import.meta.dir, '../../../docs/en/guides/workflow-map.md');

function read(path: string): string {
  return readFileSync(path, 'utf-8');
}

describe('TDK UT backfill module policy routing contracts', () => {
  const planDesignPhase = read(PLAN_DESIGN_PHASE);
  const usage = `${read(SKILLS_GUIDE)}\n${read(WORKFLOW_MAP)}`;

  it('does not offer ad hoc module creation from UT planning', () => {
    expect(planDesignPhase).not.toContain('Create a module');
    expect(planDesignPhase).not.toContain('add a module entry to `.specify.json`');
    expect(planDesignPhase).not.toContain('Append module to `modules[]`');
    expect(planDesignPhase).not.toContain('write `.specify.json` back');
  });

  it('routes missing module ownership to topology and policy workflow', () => {
    expect(planDesignPhase).toContain('/tdk-workspace-layout-propose');
    expect(planDesignPhase).toContain('/tdk-workflow-config-apply');
    expect(planDesignPhase).not.toContain('/tdk-workflow-config-apply --dry-run');
    expect(planDesignPhase).toContain('/tdk-workspace-dependency-policy');
    expect(planDesignPhase).toContain('does not edit `.specify/.specify.json`');
    expect(planDesignPhase).toContain('Proceed at sub-workspace level');
  });

  it('documents layout and policy as the durable module ownership path', () => {
    expect(usage).toContain('/tdk-plan <id> --ut-backfill');
    expect(usage).toContain('/tdk-workspace-layout-propose');
    expect(usage).toContain('/tdk-workflow-config-apply');
    expect(usage).not.toContain('/tdk-workflow-config-apply --dry-run');
    expect(usage).toContain('/tdk-workspace-dependency-policy');
  });
});
