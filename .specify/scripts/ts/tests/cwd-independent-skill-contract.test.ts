import { describe, expect, it } from 'bun:test';
import { readdirSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const IMPLEMENT_SKILL = resolve(
  import.meta.dir,
  '../../../plugins/tdk-core/skills/tdk-implement/SKILL.md',
);

const STATUS_SKILL = resolve(
  import.meta.dir,
  '../../../plugins/tdk-core/skills/tdk-status/SKILL.md',
);

const PLAN_SKILL = resolve(
  import.meta.dir,
  '../../../plugins/tdk-core/skills/tdk-plan/SKILL.md',
);

const PLAN_REFERENCES_DIR = resolve(
  import.meta.dir,
  '../../../plugins/tdk-core/skills/tdk-plan/references',
);

const PLAN_REFERENCES = readdirSync(PLAN_REFERENCES_DIR)
  .filter((file) => file.endsWith('.md'))
  .map((file) => resolve(PLAN_REFERENCES_DIR, file));

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

const LEGACY_TDK_SCRIPT_SKILLS = [
  '../../../plugins/tdk-core/skills/tdk-config-sync/SKILL.md',
  '../../../plugins/tdk-core/skills/tdk-config-diff/SKILL.md',
  '../../../plugins/tdk-core/skills/tdk-config-index/SKILL.md',
  '../../../plugins/tdk-core/skills/tdk-analyze/SKILL.md',
  '../../../plugins/tdk-core/skills/tdk-checklist/SKILL.md',
  '../../../plugins/tdk-core/skills/tdk-clarify/SKILL.md',
  '../../../plugins/tdk-core/skills/tdk-ut-backfill-plan/SKILL.md',
  '../../../plugins/tdk-utils/skills/tdk-setup-guide/SKILL.md',
].map((path) => resolve(import.meta.dir, path));

const AGENT_ROOT_GUIDANCE_SKILLS = [
  '../../../plugins/tdk-core/skills/tdk-sub-workspace-docs/SKILL.md',
  '../../../plugins/tdk-utils/skills/tdk-scout/SKILL.md',
].map((path) => resolve(import.meta.dir, path));

const AGENT_PROJECT_ROOT_ARG = '-- "<agent-resolved-project-root>"';

function read(path: string): string {
  return readFileSync(path, 'utf-8');
}

function expectNoPowerShellSyntax(skillText: string): void {
  expect(skillText).not.toMatch(/\$env:/);
  expect(skillText).not.toMatch(/\belseif\b/);
  expect(skillText).not.toContain('2>$null');
  expect(skillText).not.toMatch(/\$[A-Z_]+\s+=\s+if \(/);
}

function expectNoShellRootDiscovery(skillText: string): void {
  expectNoPowerShellSyntax(skillText);
  expect(skillText).not.toContain('CLAUDE_PROJECT_DIR');
  expect(skillText).not.toContain('GITHUB_WORKSPACE');
  expect(skillText).not.toContain('git rev-parse --show-toplevel');
  expect(skillText).not.toContain('$PWD');
  expect(skillText).not.toContain('PROJECT_DIR=""');
  expect(skillText).not.toContain('Cannot resolve project root. Run from a git workspace');
}

function expectAgentProvidedProjectRoot(skillText: string): void {
  expectNoShellRootDiscovery(skillText);
  expect(skillText).toContain('PROJECT_DIR="$1"');
  expect(skillText).toContain('[ -z "$PROJECT_DIR" ] || [ ! -d "$PROJECT_DIR/.specify/scripts/ts" ]');
  expect(skillText).toContain('Invalid project root: $PROJECT_DIR');
  expect(skillText).toContain(AGENT_PROJECT_ROOT_ARG);
  expect(skillText).toContain('Ask the user for the project root');
}

function expectSafeScriptCommand(skillText: string, command: string): void {
  expect(skillText).toContain(`(cd "$PROJECT_DIR/.specify/scripts/ts" && bun ${command})`);
}

function expectNoFragilePlanCommand(skillText: string): void {
  expect(skillText).not.toContain('cd .specify/scripts/ts');
  expect(skillText).not.toContain('cd $CLAUDE_PROJECT_DIR/.specify/scripts/ts');
  expect(skillText).not.toContain('cd "$CLAUDE_PROJECT_DIR/.specify/scripts/ts"');
  expect(skillText).not.toContain('bun .specify/scripts/ts/src/commands/');
}

describe('cwd-independent skill command contract', () => {
  const implementSkill = read(IMPLEMENT_SKILL);
  const statusSkill = read(STATUS_SKILL);
  const planSkill = read(PLAN_SKILL);
  const planReferenceText = PLAN_REFERENCES.map((path) => read(path)).join('\n');
  const loadProjectContextSkill = read(LOAD_PROJECT_CONTEXT_SKILL);
  const retroCollectSkill = read(RETRO_COLLECT_SKILL);
  const retroProposeSkill = read(RETRO_PROPOSE_SKILL);
  const retroApplySkill = read(RETRO_APPLY_SKILL);
  const legacyTdkScriptSkills = LEGACY_TDK_SCRIPT_SKILLS.map((path) => read(path));
  const agentRootGuidanceSkills = AGENT_ROOT_GUIDANCE_SKILLS.map((path) => read(path));

  it('tdk-implement receives project root as an agent-provided argument before script calls', () => {
    expectAgentProvidedProjectRoot(implementSkill);
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
      expectAgentProvidedProjectRoot(skillText);
    }

    expectSafeScriptCommand(statusSkill, 'src/commands/feature/status.ts <feature-id>');
    expectSafeScriptCommand(loadProjectContextSkill, 'src/commands/detect-config.ts');
  });

  it('tdk-plan uses the same portable script command contract', () => {
    const allPlanText = `${planSkill}\n${planReferenceText}`;

    expectAgentProvidedProjectRoot(planSkill);
    expectNoShellRootDiscovery(planReferenceText);
    expectSafeScriptCommand(
      planSkill,
      'src/commands/util/scan-cross-plan-deps.ts --current <TASK_ID> --json',
    );
    expectSafeScriptCommand(planSkill, 'src/commands/util/setup-plan.ts {task_id} --json');
    expectSafeScriptCommand(planReferenceText, 'src/commands/util/setup-plan.ts {task_id} --force --json');
    expectSafeScriptCommand(planReferenceText, 'src/commands/util/plan-prose-validator.ts <plan-md-path> --json');
    expectSafeScriptCommand(planReferenceText, 'src/commands/util/plan-status-validator.ts <plan-md-path> --json');
    expect(planReferenceText).toContain(
      '(cd "$PROJECT_DIR/.specify/scripts/ts" && bun src/commands/util/spec-plan-drift.ts',
    );
    expectSafeScriptCommand(
      planReferenceText,
      'src/commands/util/update-phase-frontmatter-status.ts "{phasePath}" {status}',
    );
    expectSafeScriptCommand(
      planReferenceText,
      'src/commands/util/update-phase-status.ts "{FEATURE_DIR}/plan.md" {phaseNumber} {status}',
    );
    expectNoFragilePlanCommand(allPlanText);
  });

  it('retro skills use the same portable script command contract', () => {
    for (const skillText of [retroCollectSkill, retroProposeSkill, retroApplySkill]) {
      expectAgentProvidedProjectRoot(skillText);
    }

    expectSafeScriptCommand(retroCollectSkill, 'src/commands/util/check-prerequisites.ts {task_id} --json');
    expectSafeScriptCommand(retroProposeSkill, 'src/commands/util/check-prerequisites.ts {task_id} --paths-only --json');
    expectSafeScriptCommand(retroApplySkill, 'src/commands/util/check-prerequisites.ts {task_id} --paths-only --json');
    expectSafeScriptCommand(retroCollectSkill, 'src/commands/util/parse-phases-table.ts "{FEATURE_DIR}/plan.md" --json');
    expect(retroCollectSkill).toContain('(cd "$PROJECT_DIR" && langfuse --env .env api traces list --session-id "{session_id}")');
  });

  it('legacy TDK script examples use the agent-provided project root contract', () => {
    for (const skillText of legacyTdkScriptSkills) {
      expectAgentProvidedProjectRoot(skillText);
      expectNoFragilePlanCommand(skillText);
    }
  });

  it('project-root guidance examples do not require shell-side root discovery', () => {
    for (const skillText of agentRootGuidanceSkills) {
      expectNoShellRootDiscovery(skillText);
      expect(skillText).toContain('<agent-resolved-project-root>');
      expect(skillText).toContain('Ask the user for the project root');
    }
  });
});
