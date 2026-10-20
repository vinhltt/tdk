import { describe, expect, it } from 'bun:test';
import { readdirSync, readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';

const IMPLEMENT_SKILL = resolve(
  import.meta.dir,
  '../../../plugins/tdk-core/skills/tdk-implement/SKILL.md',
);
const IMPLEMENT_REFERENCES_DIR = resolve(dirname(IMPLEMENT_SKILL), 'references');

const STATUS_SKILL = resolve(
  import.meta.dir,
  '../../../plugins/tdk-core/skills/tdk-status/SKILL.md',
);

const STATUS_SOURCE = resolve(import.meta.dir, '../src/commands/feature/status.ts');

function read(path: string): string {
  return readFileSync(path, 'utf-8');
}

describe('status preflight skill contract', () => {
  const implementSkill = read(IMPLEMENT_SKILL);
  const implementReferenceText = readdirSync(IMPLEMENT_REFERENCES_DIR)
    .filter((file) => file.endsWith('.md'))
    .map((file) => read(resolve(IMPLEMENT_REFERENCES_DIR, file)))
    .join('\n');
  const implementContract = `${implementSkill}\n${implementReferenceText}`;
  const statusSkill = read(STATUS_SKILL);

  it('tdk-implement runs the status collector before execution', () => {
    expect(implementSkill).toContain('### Step 2: Status Preflight');
    expect(implementContract).toContain('src/commands/feature/status.ts {TASK_ID}');
    expect(implementContract).toContain('Do NOT invoke `/tdk-status`');
  });

  it('tdk-implement branches on structured status fields', () => {
    for (const term of [
      'feature_status',
      'phases.currentPhase',
      'phases.nextPhase',
      'planned',
      'in_progress',
      'blocked',
      'done',
    ]) {
      expect(implementContract).toContain(term);
    }
  });

  it('tdk-implement stops on every lifecycle status that has nothing to implement', () => {
    const rows = new Map<string, string>();
    for (const line of implementContract.split('\n')) {
      const match = /^\| `([a-z_]+)`[^|]*\| (.+) \|$/.exec(line);
      if (match) rows.set(match[1]!, match[2]!);
    }
    for (const status of ['draft', 'ready', 'blocked', 'done', 'cancelled', 'archived', 'empty']) {
      expect(rows.get(status)).toMatch(/^STOP/);
    }
    expect(rows.get('draft')).toContain('/tdk-clarify {TASK_ID}');
    expect(rows.get('ready')).toContain('/tdk-plan {TASK_ID}');
    expect(rows.get('planned')).toStartWith('Show todo count');
    expect(rows.get('in_progress')).toBeDefined();
    // Done plus only blocked rows derives in_progress with no runnable phase.
    expect(implementContract).toMatch(
      /^\| `in_progress` \+ no `nextPhase` \+ no `currentPhase` \| STOP\..*`\/tdk-plan \{TASK_ID\}`/m,
    );
  });

  it('feature-status vocabulary no longer uses the pre-lifecycle values', () => {
    const statusSource = read(STATUS_SOURCE);
    const lifecycleSource = read(resolve(dirname(STATUS_SOURCE), 'feature-lifecycle-status.ts'));
    for (const text of [implementContract, statusSkill, statusSource, lifecycleSource]) {
      expect(text).not.toMatch(/feature_status[^\n]*`(specified|complete)`/);
      expect(text).not.toMatch(/\| `(specified|complete)` \|/);
      expect(text).not.toMatch(/FeatureStatus[^\n]*'(specified|complete)'/);
      expect(text).not.toMatch(/case '(specified|complete)'/);
    }
  });

  it('tdk-implement keeps parser as execution source of truth', () => {
    expect(implementContract).toContain('This preflight is read-only');
    expect(implementContract).toContain('phase parser below remains the execution source of truth');
    expect(implementContract).toContain('parse-phases-table.ts "{FEATURE_DIR}/plan.md" --json');
  });

  it('tdk-status documents the shared JSON contract', () => {
    expect(statusSkill).toContain('## Shared JSON Contract');
    expect(statusSkill).toContain('src/commands/feature/status.ts <feature-id>');
    expect(statusSkill).toContain('Use structured JSON fields');
    expect(statusSkill).toContain('phases.rows[].phase_status');
  });

  it('status recommendations point to /tdk-plan test-mode flags, not the retired /tdk-ut-backfill-plan skill', () => {
    const statusSource = read(STATUS_SOURCE);
    expect(statusSource).not.toContain('/tdk-ut-backfill-plan');
    expect(statusSource).toContain('`/tdk-plan ${id} --tdd`');
    expect(statusSource).toContain('`/tdk-plan ${id} --ut-backfill`');
  });

  it('status treats canonical plan test modes as UT workflow presence', () => {
    const statusSource = read(STATUS_SOURCE);
    expect(statusSource).toContain('extractFrontmatter');
    expect(statusSource).toContain('readPlanTestMode');
    expect(statusSource).toContain("frontmatter?.parsed['test_mode']");
    expect(statusSource).toContain("value === 'tdd' || value === 'ut_backfill'");
    expect(statusSource).toContain('const hasUt = hasPlanTestMode ||');
    expect(statusSource).toContain('testMode,');
  });
});
