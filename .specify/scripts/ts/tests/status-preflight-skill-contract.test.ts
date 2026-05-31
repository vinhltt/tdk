import { describe, expect, it } from 'bun:test';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const IMPLEMENT_SKILL = resolve(
  import.meta.dir,
  '../../../plugins/tdk-core/skills/tdk-implement/SKILL.md',
);

const STATUS_SKILL = resolve(
  import.meta.dir,
  '../../../plugins/tdk-core/skills/tdk-status/SKILL.md',
);

function read(path: string): string {
  return readFileSync(path, 'utf-8');
}

describe('status preflight skill contract', () => {
  const implementSkill = read(IMPLEMENT_SKILL);
  const statusSkill = read(STATUS_SKILL);

  it('tdk-implement runs the status collector before execution', () => {
    expect(implementSkill).toContain('### Step 2: Status Preflight');
    expect(implementSkill).toContain('src/commands/feature/status.ts {TASK_ID}');
    expect(implementSkill).toContain('Do NOT invoke `/tdk-status`');
  });

  it('tdk-implement branches on structured status fields', () => {
    for (const term of [
      'feature_status',
      'phases.currentPhase',
      'phases.nextPhase',
      'planned',
      'in_progress',
      'blocked',
      'complete',
    ]) {
      expect(implementSkill).toContain(term);
    }
  });

  it('tdk-implement keeps parser as execution source of truth', () => {
    expect(implementSkill).toContain('This preflight is read-only');
    expect(implementSkill).toContain('phase parser below remains the execution source of truth');
    expect(implementSkill).toContain('parse-phases-table.ts "{FEATURE_DIR}/plan.md" --json');
  });

  it('tdk-status documents the shared JSON contract', () => {
    expect(statusSkill).toContain('## Shared JSON Contract');
    expect(statusSkill).toContain('src/commands/feature/status.ts <feature-id>');
    expect(statusSkill).toContain('Use structured JSON fields');
    expect(statusSkill).toContain('phases.rows[].phase_status');
  });
});
