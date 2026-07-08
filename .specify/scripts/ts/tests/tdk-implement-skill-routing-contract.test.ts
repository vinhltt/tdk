import { describe, expect, it } from 'bun:test';
import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';

const IMPLEMENT_SKILL = resolve(
  import.meta.dir,
  '../../../plugins/tdk-core/skills/tdk-implement/SKILL.md',
);
const IMPLEMENT_REFERENCES_DIR = resolve(dirname(IMPLEMENT_SKILL), 'references');
const IMPLEMENT_ROUTING_REFERENCE = resolve(IMPLEMENT_REFERENCES_DIR, 'routing-preflight.md');
const IMPLEMENT_PHASE_REFERENCE = resolve(IMPLEMENT_REFERENCES_DIR, 'phase-execution.md');
const IMPLEMENT_PROJECT_REFERENCE = resolve(IMPLEMENT_REFERENCES_DIR, 'project-and-phase-contract.md');
const PLAN_SKILL_ROUTING = resolve(
  import.meta.dir,
  '../../../plugins/tdk-core/skills/tdk-plan/references/skill-routing.md',
);
const PLAN_DESIGN_PHASE = resolve(
  import.meta.dir,
  '../../../plugins/tdk-core/skills/tdk-plan/references/design-phase.md',
);

function read(path: string): string {
  return readFileSync(path, 'utf-8');
}

describe('tdk-implement skill routing contract', () => {
  const implementSkill = read(IMPLEMENT_SKILL);
  const implementRouting = read(IMPLEMENT_ROUTING_REFERENCE);
  const implementPhase = read(IMPLEMENT_PHASE_REFERENCE);
  const implementProject = read(IMPLEMENT_PROJECT_REFERENCE);
  const implementContract = [
    implementSkill,
    implementProject,
    implementRouting,
    implementPhase,
  ].join('\n');
  const planRouting = read(PLAN_SKILL_ROUTING);
  const designPhase = read(PLAN_DESIGN_PHASE);

  it('loads skill routing from the exact project routing path after project context', () => {
    const contextStep = implementSkill.indexOf('### Step 0.2 — Load Project Context');
    const routingStep = implementSkill.indexOf('### Step 0.3 — Load Skill Routing');
    const prerequisitesStep = implementSkill.indexOf('### Step 1: Check Prerequisites');

    expect(contextStep).toBeGreaterThanOrEqual(0);
    expect(routingStep).toBeGreaterThan(contextStep);
    expect(routingStep).toBeLessThan(prerequisitesStep);
    expect(implementSkill).toContain('Load: `references/routing-preflight.md`');
    expect(implementContract).toContain('PROJECT_CONTEXT.docsPath');
    expect(implementContract).toContain('raw project config `docs.path`');
    expect(implementContract).toContain('ROUTING_FILE = {docs.path}/custom-workflow/plan-skill-routing.md');
    expect(implementContract).toContain('read the exact resolved path');
    expect(implementContract).toContain('Do not use Search, Grep, Glob');
    expect(implementContract).toContain('set `SKILL_ROUTING = empty` and continue');
    expect(implementContract).toContain('Never auto-create the routing file');
    expect(planRouting).toContain('ROUTING_FILE = {docs.path}/custom-workflow/plan-skill-routing.md');
  });

  it('runs read-only routing preflight before the first in_progress status write', () => {
    const routingPreflight = implementContract.indexOf('#### 7A. Routing Preflight');
    const statusWrite = implementContract.indexOf('update-phase-frontmatter-status.ts "{phasePath}" in_progress');

    expect(routingPreflight).toBeGreaterThanOrEqual(0);
    expect(statusWrite).toBeGreaterThan(routingPreflight);
    expect(implementContract).toContain('read-only before the first `in_progress` status transition');
    expect(implementContract).toContain('Actual status writes still keep phase frontmatter first, then `plan.md`');
    expect(implementContract).toContain('Read `phasePath`');
    expect(implementContract).toContain('Compute expected delegates');
    expect(implementContract).toContain('Parse actual `## Delegate Skills`');
  });

  it('keeps the minimal routing subset aligned with tdk-plan behavior', () => {
    for (const domain of ['test', 'database', 'design', 'implement', 'research']) {
      expect(implementContract).toContain(domain);
      expect(designPhase).toContain(domain);
    }

    expect(implementContract).toContain('PROJECT_CONTEXT.subWorkspaces[].path');
    expect(implementContract).toContain('path-prefix match selects the subworkspace object');
    expect(implementContract).toContain('Route lookup uses `subWorkspace.name` case-insensitively');
    expect(implementContract).toContain('global fallback');
    expect(implementContract).toContain('^## Delegate Skills$');
    expect(implementContract).toContain('until the next `^## ` heading');
    expect(implementContract).toContain('deduplicate while preserving routing order');
    expect(designPhase).toContain('Match against `PROJECT_CONTEXT.subWorkspaces[].path`');
    expect(planRouting).toContain('Replace everything from that heading until the next `^## ` heading');
  });

  it('requires explicit refresh, generic override, or cancel on delegate drift', () => {
    for (const term of [
      'expected delegates',
      'actual phase delegates',
      'Refresh `## Delegate Skills`',
      'Run generic override',
      'Cancel',
      'Insert or replace `## Delegate Skills` after `## Key Insights`',
      'Re-read the phase file',
      'stops without status mutation',
      'User chose generic implementation despite routing delegates',
    ]) {
      expect(implementContract).toContain(term);
    }
  });

  it('blocks test-like routed phases from generic fallback and strengthens the generic checklist', () => {
    for (const term of [
      'Generic override is available only when the phase is not test-like',
      'test-like phase',
      'expected routing includes a `test` delegate',
      'ordered domain list',
      '`design`, then `implement`',
      'omit `Run generic override`',
      'refresh or cancel',
      'no inline generic unit-test implementation',
      './docs/code-standards.md or the project equivalent',
      'Scout adjacent file patterns',
      'Check existing helpers',
      'Verify public or interface contracts',
      'run compile/lint',
      'Validate phase success criteria',
    ]) {
      expect(implementContract).toContain(term);
    }
  });

  it('does not import ck:cook modes or generated Codex mirror scope', () => {
    expect(implementContract).not.toContain('--auto');
    expect(implementContract).not.toContain('--parallel');
    expect(implementContract).not.toContain('tester/code-reviewer/project-management');
    expect(implementContract).not.toContain('.specify/codex-plugins');
  });

  it('documents TDD phase execution: test delegate first, then implementation, then regression gate', () => {
    expect(implementContract).toContain('## TDD Phase Execution');
    for (const heading of [
      '## Tests Before',
      '## Refactor / Implementation',
      '## Tests After',
      '## Test Quality Gate',
      '## Regression Gate',
    ]) {
      expect(implementContract).toContain(heading);
    }
    expect(implementContract).toContain('Test delegate success alone never marks a TDD phase done');
    expect(implementContract).toContain('/tdk-plan <TASK_ID> --ut-backfill');
    expect(implementContract).not.toContain('/tdk-ut-backfill-plan');
  });

  it('documents UT backfill phase execution and matrix implementation gate', () => {
    expect(implementContract).toContain('## UT Backfill Phase Execution');
    for (const heading of [
      '## Code Summary',
      '## Mocks & Fixtures Required',
      '## Test Matrix',
      '## Test Quality Gate',
    ]) {
      expect(implementContract).toContain(heading);
    }

    for (const term of [
      'Run the routed `test` delegate',
      'each non-N/A `## Test Matrix` row',
      'the `Impl` column filled with a test file path',
      'Run the phase\'s test command(s)',
      'do not mark the phase done',
      'Backfill phases are test implementation work only.',
    ]) {
      expect(implementContract).toContain(term);
    }
  });

  it('enforces Test Quality Gate commands before test-mode phase completion', () => {
    for (const term of [
      'Run every safe runnable `Command` in `## Test Quality Gate`',
      'A gate row can pass only when structural target evidence is satisfied and any runnable command exits 0',
      'Do not parse coverage percentages',
      'required gate row is `pending` or `fail`',
      'unsafe command',
      'missing structural evidence',
      'invalid N/A encoding',
      'Bare `Command: N/A` is invalid',
      'A non-applicable row must use `Command: -` and `Status: N/A: <reason>`',
    ]) {
      expect(implementContract).toContain(term);
    }
  });

  it('stops old-shape TDD and backfill phases that lack Test Quality Gate', () => {
    for (const term of [
      'Old-shape TDD/backfill phase missing `## Test Quality Gate`',
      'rerun `/tdk-plan` with the same test-mode flag',
      'manually add `## Test Quality Gate` before rerunning `/tdk-implement`',
      'do not fall through to delegate completion or generic done',
    ]) {
      expect(implementContract).toContain(term);
    }
  });

  it('requires gate validation after delegate execution and before done status writes', () => {
    for (const term of [
      'Delegate completion alone cannot mark a TDD or backfill phase done',
      'validate `## Test Quality Gate` after delegates and before any phase `done` write',
      'TDD ID reuse',
      'rubric dimensions by test ID or `N/A: <reason>`',
      'backfill matrix rows',
      'branch traceability',
      'dependency traceability',
    ]) {
      expect(implementContract).toContain(term);
    }
  });
});
