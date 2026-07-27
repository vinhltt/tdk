import { describe, expect, it } from 'bun:test';
import { existsSync, readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';

const PLAN_SKILL = resolve(
  import.meta.dir,
  '../../../plugins/tdk-core/skills/tdk-plan/SKILL.md',
);
const REFERENCES_DIR = resolve(dirname(PLAN_SKILL), 'references');
const MODES_REFERENCE = resolve(REFERENCES_DIR, 'modes.md');
const RED_TEAM_WORKFLOW = resolve(REFERENCES_DIR, 'red-team-workflow.md');
const GATES_REFERENCE = resolve(REFERENCES_DIR, 'gates.md');
const RESEARCH_PHASE_REFERENCE = resolve(REFERENCES_DIR, 'research-phase.md');
const SKILL_ROUTING_REFERENCE = resolve(REFERENCES_DIR, 'skill-routing.md');
const VALIDATE_WORKFLOW = resolve(REFERENCES_DIR, 'validate-workflow.md');
const VALIDATE_QUESTION_FRAMEWORK = resolve(REFERENCES_DIR, 'validate-question-framework.md');
const PLUGINS_DIR = resolve(import.meta.dir, '../../../plugins');
const MANIFEST = resolve(PLUGINS_DIR, 'manifest.json');
const UTILS_PLANNING_SKILL = resolve(PLUGINS_DIR, 'tdk-utils/skills/planning');
const RETIRED_OBSIDIAN_HELPERS = [
  'obsidian_simple_search',
  'obsidian_complex_search',
  'obsidian_batch_get_file_contents',
];

function read(path: string): string {
  return readFileSync(path, 'utf-8');
}

function extractStep3c(skill: string): string {
  const start = skill.indexOf('#### 3c');
  expect(start).toBeGreaterThanOrEqual(0);

  const nextSection = skill.indexOf('\n### ', start + 1);
  return nextSection === -1 ? skill.slice(start) : skill.slice(start, nextSection);
}

function extractReferenceLoads(skill: string): string[] {
  return Array.from(skill.matchAll(/Load:\s*`(references\/[^`]+\.md)`/g), (match) => {
    const referencePath = match[1];
    expect(referencePath).toBeDefined();
    return referencePath as string;
  });
}

describe('tdk-plan reference contract', () => {
  const skill = read(PLAN_SKILL);
  const step3c = extractStep3c(skill);

  it('loads the merged plan output contract in Step 3c', () => {
    expect(step3c).toContain('Load: `references/plan-output-contract.md`');
  });

  it('does not load old split output references in Step 3c', () => {
    expect(step3c).not.toContain('Load: `references/plan-organization.md`');
    expect(step3c).not.toContain('Load: `references/output-standards.md`');
  });

  it('hard-gates plan artifact writes on loading the output contract', () => {
    expect(step3c).toContain('STOP before writing');
    expect(step3c).toContain('`plan.md`, `phases/*.md`, or any conditional supporting');
    expect(step3c).toContain('supporting-artifact index');
    expect(step3c).toContain('or reconstruct the layout from memory');
  });

  it('defaults to core artifacts and indexes only justified supporting artifacts', () => {
    const outputContract = read(resolve(REFERENCES_DIR, 'plan-output-contract.md'));

    expect(outputContract).toContain('Default output is `spec.md`, `plan.md`, and `phases/*.md`');
    expect(outputContract).toContain('optional directories.');
    expect(outputContract).toContain('## Supporting Artifacts');
    expect(outputContract).toContain('| Path | Type | Reason | Owner Phase | Consumer |');
    expect(outputContract).toContain('Prose-only contracts are not');
    expect(outputContract).toContain('valid `contracts/` entries.');
    expect(outputContract).toContain('### Machine-contract classifier');
    expect(outputContract).toContain('`.json`, `.yaml`, `.yml`, `.graphql`, or `.proto`');
    expect(outputContract).toContain('`machine-contract:<format>`');
    expect(outputContract).toContain('exact validation command');
  });

  it('documents timestamped research report output instead of top-level research.md', () => {
    const outputContract = read(resolve(REFERENCES_DIR, 'plan-output-contract.md'));
    const researchPhase = read(RESEARCH_PHASE_REFERENCE);

    expect(outputContract).toContain('research/');
    expect(outputContract).toContain('yyMMdd-HHmmss-{slug}.md');
    expect(outputContract).not.toContain('researcher-NN-{topic}.md');
    expect(researchPhase).toContain('Spawn `N` `researcher` subagents in parallel');
    expect(researchPhase).toContain('{FEATURE_DIR}/research/yyMMdd-HHmmss-{slug}.md');
    expect(researchPhase).toContain('do not');
    expect(researchPhase).toContain('create a top-level `research.md`');
  });

  it('defines deterministic required-reference loading behavior', () => {
    expect(skill).toContain('## Required Reference Load Contract');
    expect(skill).toContain('SKILL_BASE_DIR');
    expect(skill).toContain('expected absolute path');
    expect(skill).toContain('current step');
    expect(skill).toContain('begins with `<!-- DO NOT LOAD`');
  });

  it('only loads internal references that exist and are not stubs', () => {
    for (const referencePath of extractReferenceLoads(skill)) {
      const absolutePath = resolve(REFERENCES_DIR, referencePath.replace('references/', ''));

      expect(existsSync(absolutePath), `${referencePath} should exist`).toBe(true);
      expect(read(absolutePath).split('\n')[0]).not.toStartWith('<!-- DO NOT LOAD');
    }
  });

  it('does not keep the retired tdk-utils planning skill packaged', () => {
    const manifest = JSON.parse(read(MANIFEST)) as {
      plugins?: Record<string, {
        components?: { skills?: Record<string, unknown> };
        files?: Record<string, unknown>;
      }>;
    };
    const utils = manifest.plugins?.['tdk-utils'];

    expect(existsSync(UTILS_PLANNING_SKILL)).toBe(false);
    expect(utils?.components?.skills ?? {}).not.toHaveProperty('planning');
    expect(Object.keys(utils?.files ?? {})).not.toContain('skills/planning/SKILL.md');
    expect(Object.keys(utils?.files ?? {}).some((file) => file.startsWith('skills/planning/'))).toBe(false);
  });

  it('does not depend on the retired tdk-utils planning references', () => {
    const planFiles = [
      PLAN_SKILL,
      ...extractReferenceLoads(skill).map((referencePath) =>
        resolve(REFERENCES_DIR, referencePath.replace('references/', '')),
      ),
    ];

    for (const planFile of planFiles) {
      const content = read(planFile);
      expect(content).not.toContain('tdk-utils/skills/planning');
      expect(content).not.toContain('planning/references/output-standards.md');
    }
  });

  it('documents spec-plan drift preflight over spec.md and canonical phase files', () => {
    const workflow = read(VALIDATE_WORKFLOW);

    expect(workflow).toContain('Load `spec.md`, `plan.md`, and every `phases/phase-NN-*.md`');
    expect(workflow).toContain('spec-plan-drift.ts');
    expect(workflow).toContain('--spec "{FEATURE_DIR}/spec.md"');
    expect(workflow).toContain('#### Spec-Plan Drift Preflight');
    expect(workflow).not.toContain('Load plan.md + every `phase-*.md`');
  });

  it('persists drift rows before validation questions and resumes from persisted rows', () => {
    const workflow = read(VALIDATE_WORKFLOW);

    expect(workflow).toContain('Persist the full drift rows before the Q/A table');
    expect(workflow).toContain('reuse the persisted drift table');
    expect(workflow).toContain('do not recompute drift during resume');
    expect(workflow).toContain('force Discard path');
  });

  it('uses severity-driven validation questions without fixed total caps', () => {
    const framework = read(VALIDATE_QUESTION_FRAMEWORK);

    expect(framework).toContain('No global hard total is applied');
    expect(framework).toContain('batch at most 4 questions');
    expect(framework).toContain('Continue');
    expect(framework).toContain('partial');
    expect(framework).not.toContain('Hard cap total at 8');
    expect(framework).not.toContain('Cap at 8');
  });

  it('maps every drift question family to explicit actions', () => {
    const framework = read(VALIDATE_QUESTION_FRAMEWORK);

    for (const id of [
      'speckit.missing_fr_coverage',
      'speckit.plan_only_phase',
      'speckit.scope_drift',
      'speckit.impact_surface_drift',
      'speckit.new_entity_contract',
    ]) {
      expect(framework).toContain(id);
    }
    expect(framework).toContain('spec-update-needed');
    expect(framework).toContain('revise');
    expect(framework).toContain('no-op');
  });

  it('accepts USER_CONTENT in every tdk-plan mode while keeping flag errors strict', () => {
    const modes = read(MODES_REFERENCE);

    expect(skill).toContain('USER_CONTENT');
    expect(skill).toContain('first argument token');
    expect(skill).toContain('remaining non-flag text');
    expect(modes).toContain('USER_CONTENT');
    expect(modes).toContain('<TASK_ID> <content>');
    expect(modes).toContain('<TASK_ID> --validate <content>');
    expect(modes).toContain('<TASK_ID> <content> --red-team');
    expect(modes).toContain('default, `--fast`, `--hard`');
    expect(modes).toContain('unknown flag --foo');
    expect(modes).toContain('unknown flag --foo=bar');
    expect(modes).toContain('unknown flag --phase=02');
    expect(modes).toContain('known mode flags must appear after TASK_ID');
    expect(modes).toContain('--fast and --hard are mutually exclusive');
  });

  it('routes USER_CONTENT as planning, red-team, or validation focus text', () => {
    const modes = read(MODES_REFERENCE);
    const redTeamWorkflow = read(RED_TEAM_WORKFLOW);
    const validateWorkflow = read(VALIDATE_WORKFLOW);

    expect(modes).toContain('planning instruction');
    expect(modes).toContain('red-team focus');
    expect(modes).toContain('validation focus');
    expect(redTeamWorkflow).toContain('USER_CONTENT');
    expect(redTeamWorkflow).toContain('review focus');
    expect(validateWorkflow).toContain('USER_CONTENT');
    expect(validateWorkflow).toContain('validation focus');
  });

  it('requires exact-path reads for plan-skill-routing.md instead of search-based absence checks', () => {
    const routing = read(SKILL_ROUTING_REFERENCE);
    const redTeamWorkflow = read(RED_TEAM_WORKFLOW);
    const validateWorkflow = read(VALIDATE_WORKFLOW);

    expect(skill).toContain('do not run the interactive missing-file AskUserQuestion/create flow');
    expect(skill).toContain('always perform exact-path inline routing reads');
    expect(routing).toContain('ROUTING_FILE = {docs.path}/custom-workflow/plan-skill-routing.md');
    expect(routing).toContain('reading the exact resolved path');
    expect(routing).toContain('Do not use Search, Grep, Glob');
    expect(routing).toContain('can return 0 results even when `{docs.path}/custom-workflow/plan-skill-routing.md` exists');
    expect(validateWorkflow).toContain('always resolve exact `ROUTING_FILE = {docs.path}/custom-workflow/plan-skill-routing.md`');
    expect(validateWorkflow).toContain('assess whether plan phases have correct skill assignments');
    expect(validateWorkflow).toContain('Do not use Search/Grep/Glob');
    expect(redTeamWorkflow).toContain('always resolve exact `ROUTING_FILE = {docs.path}/custom-workflow/plan-skill-routing.md`');
    expect(redTeamWorkflow).toContain('including missing or stale `## Delegate Skills`');
    expect(redTeamWorkflow).toContain('Do not use Search/Grep/Glob');
  });

  it('validates append dependencies through the complete resolver input', () => {
    const existingPlanWorkflow = read(resolve(REFERENCES_DIR, 'handle-existing-plan.md'));
    const outputContract = read(resolve(REFERENCES_DIR, 'plan-output-contract.md'));

    expect(existingPlanWorkflow).toContain('validates the complete resolver input and reciprocal graph');
    expect(outputContract).toContain(
      'resolve-parallel-phase-wave.ts --project-root "$PROJECT_DIR" --plan "$FEATURE_DIR/plan.md" --validate-only',
    );
  });

  it('requires the explicit --validate-only flag for planner validation and prohibits it in parallel-implementation scheduling examples', () => {
    const outputContract = read(resolve(REFERENCES_DIR, 'plan-output-contract.md'));
    const implementOrchestration = read(resolve(
      PLUGINS_DIR, 'tdk-core/skills/tdk-implement/references/parallel-phase-orchestration.md',
    ));

    expect(outputContract).toContain('--validate-only');
    expect(implementOrchestration).not.toContain('--validate-only');
  });

  it('places transactional parallel validation before guardian and reporting', () => {
    const validationStep = skill.indexOf('### Step 3d — Transactional Post-write Validation');
    const guardian = skill.indexOf('### Phase 0.guardian');
    const reporting = skill.indexOf('### Step 4 — Report Results');

    expect(validationStep).toBeGreaterThanOrEqual(0);
    expect(guardian).toBeGreaterThan(validationStep);
    expect(reporting).toBeGreaterThan(validationStep);
    expect(skill).toContain('roll back the complete invocation snapshot');
  });

  it('guards every mutating lifecycle with the shared mutation reservation', () => {
    expect(skill).toContain('### Step 0.2 — Mutation Reservation and Transaction Snapshot');
    expect(skill).toContain('parallel-controller.ts reserve --project-root "$PROJECT_DIR"');
    expect(skill).toContain('Successful, red-team, validate, and migrate paths');
    expect(skill).toContain('leave the reservation for explicit recovery');
  });

  it('uses current Obsidian action examples instead of retired project knowledge helpers', () => {
    const researchPhase = read(RESEARCH_PHASE_REFERENCE);

    for (const helper of RETIRED_OBSIDIAN_HELPERS) {
      expect(researchPhase).not.toContain(helper);
    }
    expect(researchPhase).toContain('vault(action="search"');
    expect(researchPhase).toContain('vault(action="read"');
    expect(researchPhase).toContain('verify important claims by read');
  });

  it('keeps memory guardian fallback semantics without smart-obsidian-specific wording', () => {
    const gates = read(GATES_REFERENCE);

    expect(gates).not.toContain('mcp__smart-obsidian');
    expect(gates).not.toContain('smart-obsidian');
    expect(gates).toContain('STATUS: MCP_UNAVAILABLE');
    expect(gates).toContain('--no-mcp');
    expect(gates).toContain('BLOCK_IMPL');
    expect(gates).toContain('REVIEW');
    expect(gates).toContain('CLEAR');
  });

  it('replaces flat v2 engineering-memory reads with harness-neutral instructions and route-aware memory guidance', () => {
    const researchPhase = read(RESEARCH_PHASE_REFERENCE);

    expect(researchPhase).not.toContain('.specify/memory/development-rules.md');
    expect(researchPhase).not.toContain('.specify/memory/codebase-summary.md');
    expect(researchPhase).not.toContain('.specify/memory/code-standards.md');
    expect(researchPhase).toContain('harness');
    expect(researchPhase).toContain('sub-workspace');
    expect(researchPhase).toContain('tdk-memory-query');
    expect(researchPhase).toContain('tdk-memory-agent');
  });
});
