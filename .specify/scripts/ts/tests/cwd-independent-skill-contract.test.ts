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

const LOAD_PROJECT_CONTEXT_SKILL = resolve(
  import.meta.dir,
  '../../../plugins/tdk-utils/skills/tdk-load-project-context/SKILL.md',
);

const RETRO_COLLECT_SKILL = resolve(
  import.meta.dir,
  '../../../plugins/tdk-retro/skills/tdk-retro-collect/SKILL.md',
);

const RETRO_PROPOSE_SKILL = resolve(
  import.meta.dir,
  '../../../plugins/tdk-retro/skills/tdk-retro-propose/SKILL.md',
);

const RETRO_APPLY_SKILL = resolve(
  import.meta.dir,
  '../../../plugins/tdk-retro/skills/tdk-retro-apply/SKILL.md',
);

const ROOT_RESOLVER =
  'PROJECT_DIR="${CLAUDE_PROJECT_DIR:-${GITHUB_WORKSPACE:-$(git rev-parse --show-toplevel 2>/dev/null)}}"';

function read(path: string): string {
  return readFileSync(path, 'utf-8');
}

function expectPortableRootResolver(skillText: string): void {
  expect(skillText).toContain(ROOT_RESOLVER);
  expect(skillText).toContain('Cannot resolve project root. Run from a git workspace or set CLAUDE_PROJECT_DIR/GITHUB_WORKSPACE.');
}

function expectSafeScriptCommand(skillText: string, command: string): void {
  expect(skillText).toContain(`(cd "$PROJECT_DIR/.specify/scripts/ts" && bun ${command})`);
}

describe('cwd-independent skill command contract', () => {
  const implementSkill = read(IMPLEMENT_SKILL);
  const statusSkill = read(STATUS_SKILL);
  const loadProjectContextSkill = read(LOAD_PROJECT_CONTEXT_SKILL);
  const retroCollectSkill = read(RETRO_COLLECT_SKILL);
  const retroProposeSkill = read(RETRO_PROPOSE_SKILL);
  const retroApplySkill = read(RETRO_APPLY_SKILL);

  it('tdk-implement resolves project root portably before script calls', () => {
    expectPortableRootResolver(implementSkill);
    expect(implementSkill).toContain('GITHUB_WORKSPACE');
    expect(implementSkill).toContain('git rev-parse --show-toplevel');
  });

  it('tdk-implement wraps critical script calls in a PROJECT_DIR subshell', () => {
    for (const command of [
      'src/commands/util/check-prerequisites.ts {task_id} --json',
      'src/commands/feature/status.ts {TASK_ID}',
      'src/commands/util/parse-phases-table.ts "{FEATURE_DIR}/plan.md" --json',
      'src/commands/util/update-phase-frontmatter-status.ts "{phasePath}" {status}',
      'src/commands/util/update-phase-status.ts "{FEATURE_DIR}/plan.md" {phaseNumber} {status}',
      'src/commands/util/update-phase-frontmatter-status.ts "{phasePath}" in_progress',
      'src/commands/util/update-phase-status.ts "{FEATURE_DIR}/plan.md" {row.number} in_progress',
      'src/commands/util/update-phase-frontmatter-status.ts "{phasePath}" done',
      'src/commands/util/update-phase-status.ts "{FEATURE_DIR}/plan.md" {row.number} done',
    ]) {
      expectSafeScriptCommand(implementSkill, command);
    }
  });

  it('tdk-implement does not use cwd-fragile script command examples', () => {
    expect(implementSkill).not.toContain('cd .specify/scripts/ts');
    expect(implementSkill).not.toContain('cd $CLAUDE_PROJECT_DIR/.specify/scripts/ts');
    expect(implementSkill).not.toContain('cd "$CLAUDE_PROJECT_DIR/.specify/scripts/ts"');
  });

  it('helper skills use the same portable script command contract', () => {
    for (const skillText of [statusSkill, loadProjectContextSkill]) {
      expectPortableRootResolver(skillText);
    }

    expectSafeScriptCommand(statusSkill, 'src/commands/feature/status.ts <feature-id>');
    expectSafeScriptCommand(loadProjectContextSkill, 'src/commands/detect-config.ts');
  });

  it('retro skills use the same portable script command contract', () => {
    for (const skillText of [retroCollectSkill, retroProposeSkill, retroApplySkill]) {
      expectPortableRootResolver(skillText);
    }

    expectSafeScriptCommand(retroCollectSkill, 'src/commands/util/check-prerequisites.ts {task_id} --json');
    expectSafeScriptCommand(retroProposeSkill, 'src/commands/util/check-prerequisites.ts {task_id} --paths-only --json');
    expectSafeScriptCommand(retroApplySkill, 'src/commands/util/check-prerequisites.ts {task_id} --paths-only --json');
    expectSafeScriptCommand(retroCollectSkill, 'src/commands/util/parse-phases-table.ts "{FEATURE_DIR}/plan.md" --json');
    expect(retroCollectSkill).toContain('(cd "$PROJECT_DIR" && langfuse --env .env api traces list --session-id "{session_id}")');
  });
});
