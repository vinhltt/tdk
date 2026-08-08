import { describe, expect, it } from 'bun:test';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const PLAN_SKILL = resolve(
  import.meta.dir,
  '../../../plugins/tdk-core/skills/tdk-plan/SKILL.md',
);
const REFERENCES_DIR = resolve(
  import.meta.dir,
  '../../../plugins/tdk-core/skills/tdk-plan/references',
);
const MODES_REFERENCE = resolve(REFERENCES_DIR, 'modes.md');
const OUTPUT_CONTRACT = resolve(REFERENCES_DIR, 'plan-output-contract.md');
const DESIGN_PHASE_REFERENCE = resolve(REFERENCES_DIR, 'design-phase.md');
const SKILL_ROUTING_REFERENCE = resolve(REFERENCES_DIR, 'delegate-routing-injection.md');
const VALIDATE_QUESTION_FRAMEWORK = resolve(REFERENCES_DIR, 'validate-question-framework.md');

function read(path: string): string {
  return readFileSync(path, 'utf-8');
}

function sliceBetween(content: string, start: string, end: string): string {
  const startIndex = content.indexOf(start);
  expect(startIndex).toBeGreaterThanOrEqual(0);
  const endIndex = content.indexOf(end, startIndex + start.length);
  expect(endIndex).toBeGreaterThan(startIndex);

  return content.slice(startIndex, endIndex);
}

function expectInOrder(content: string, terms: string[]): void {
  let previousIndex = -1;

  for (const term of terms) {
    const index = content.indexOf(term);
    expect(index).toBeGreaterThan(previousIndex);
    previousIndex = index;
  }
}

describe('tdk-plan test mode grammar contract', () => {
  const skill = read(PLAN_SKILL);
  const modes = read(MODES_REFERENCE);
  const outputContract = read(OUTPUT_CONTRACT);
  const validateQuestions = read(VALIDATE_QUESTION_FRAMEWORK);

  it('accepts --tdd and --ut-backfill as known flags after TASK_ID', () => {
    expect(skill).toContain('--fast | --hard | --tdd | --ut-backfill | --red-team | --validate');
    expect(modes).toContain(
      '/tdk-plan <TASK_ID> [USER_CONTENT...] [--fast | --hard] [--tdd | --ut-backfill] [--sub-workspace <name>] [--module <name>] [--standalone] [--red-team | --validate | --migrate-artifacts] [USER_CONTENT...]',
    );
  });

  it('documents --tdd and --ut-backfill as mutually exclusive test modes', () => {
    expect(modes).toContain('<TASK_ID> --tdd --ut-backfill');
    expect(modes).toContain('Error: --tdd and --ut-backfill are mutually exclusive.');
  });

  it('rejects --fast combined with either test mode', () => {
    expect(modes).toContain('<TASK_ID> --fast --tdd');
    expect(modes).toContain('<TASK_ID> --fast --ut-backfill');
    expect(modes).toContain('Error: --fast is incompatible with --tdd and --ut-backfill.');
  });

  it('allows default or --hard with either test mode', () => {
    expect(modes).toContain('<TASK_ID> --tdd` | dispatch default with `test_mode: tdd`');
    expect(modes).toContain('<TASK_ID> --hard --tdd` | dispatch hard with `test_mode: tdd`');
    expect(modes).toContain('<TASK_ID> --ut-backfill` | dispatch default with `test_mode: ut_backfill`');
    expect(modes).toContain('<TASK_ID> --hard --ut-backfill` | dispatch hard with `test_mode: ut_backfill`');
  });

  it('documents future rigor modes as composable with test modes', () => {
    expect(modes).toContain('Future rigor modes such as `--deep` or `--parallel`');
    expect(modes).toContain('compose with test modes the same way `--hard` does');
  });

  it('keeps review and migration action flags separate from test/speed modes', () => {
    expect(modes).toContain(
      'Flags fall into three independent categories: speed (`--fast`, `--hard`), test (`--tdd`, `--ut-backfill`), action (`--red-team`, `--validate`, `--migrate-artifacts`)',
    );
  });

  it('keeps strict unknown-flag STOP behavior including the new flags in the allow-list', () => {
    expect(modes).toContain(
      'Allowed: --fast, --hard, --tdd, --ut-backfill, --red-team, --validate, --migrate-artifacts.',
    );
  });

  it('documents test_mode in the plan output contract with none/tdd/ut_backfill defaults', () => {
    expect(outputContract).toContain('test_mode: none           # none | tdd | ut_backfill');
    expect(outputContract).toContain(
      '`test_mode`: write `tdd` on `--tdd`, `ut_backfill` on `--ut-backfill`',
    );
    expect(outputContract).toContain('test_target: {}');
    expect(outputContract).toContain('write only when `test_mode: ut_backfill`');
  });

  it('does not delegate test-mode phase generation to /tdk-ut-backfill-plan', () => {
    const designPhase = read(DESIGN_PHASE_REFERENCE);
    const skillRouting = read(SKILL_ROUTING_REFERENCE);

    expect(designPhase).not.toContain('/tdk-ut-backfill-plan');
    expect(skillRouting).not.toContain('/tdk-ut-backfill-plan');
    expect(designPhase).not.toContain('Delegate to: `/tdk-ut-backfill-plan');
  });

  it('does not introduce test-plan or test-implement domains', () => {
    const skillRouting = read(SKILL_ROUTING_REFERENCE);

    expect(skillRouting).toContain('Do not introduce separate `test-plan` or `test-implement` domains.');
    expect(skillRouting).not.toContain('domain: test-plan');
    expect(skillRouting).not.toContain('domain: test-implement');
  });

  it('documents TDD and backfill canonical phase section names', () => {
    const designPhase = read(DESIGN_PHASE_REFERENCE);

    expect(designPhase).toContain('## Tests Before');
    expect(designPhase).toContain('## Refactor / Implementation');
    expect(designPhase).toContain('## Tests After');
    expect(designPhase).toContain('## Regression Gate');
    expect(designPhase).toContain('## Code Summary');
    expect(designPhase).toContain('## Mocks & Fixtures Required');
    expect(designPhase).toContain('## Test Matrix');
    expect(outputContract).toContain('## Tests Before');
    expect(outputContract).toContain('## Code Summary');
  });

  it('routes test-mode phase delegates through /tdk-plan resolution, not a separate adapter', () => {
    const skillRouting = read(SKILL_ROUTING_REFERENCE);

    expect(skillRouting).toContain(
      '`/tdk-plan` itself resolves the matching `test` skill for TDD/backfill phases',
    );
    expect(skillRouting).toContain('Prefer the matched sub-workspace section\'s `test` entry.');
    expect(skillRouting).toContain('Fall back to `global.test`.');
    expect(skillRouting).toContain('emit a warning during planning');
  });

  it('documents backfill targeting flags gated behind --ut-backfill', () => {
    expect(modes).toContain('## Backfill Targeting Flags');
    expect(modes).toContain('--sub-workspace <name>');
    expect(modes).toContain('--module <name>');
    expect(modes).toContain('--standalone');
    expect(modes).toContain('BACKFILL_TARGET = {');
    expect(modes).toContain('Backfill targeting flag values are not `USER_CONTENT`');
    expect(modes).toContain('Error: --sub-workspace requires --ut-backfill.');
    expect(modes).toContain('Error: --sub-workspace requires a value.');
    expect(modes).toContain('Error: --module requires --sub-workspace.');
    expect(modes).toContain('Error: --module requires a value.');
    expect(skill).toContain('Store: `TASK_ID`, `TASK_ID_SOURCE`, `FLAGS`, `BACKFILL_TARGET`, `USER_CONTENT`');
  });

  it('documents semantic test ID guidance for backfill test matrices', () => {
    const designPhase = read(DESIGN_PHASE_REFERENCE);

    expect(designPhase).toContain('Semantic test ID format');
    expect(designPhase).toContain('parse_email__happy');
    expect(designPhase).toContain('Multi-file invariant');
  });

  it('documents TDD case tables with before/after traceability', () => {
    const designPhase = read(DESIGN_PHASE_REFERENCE);

    for (const term of [
      '| ID | Source | Scenario | Technique | Input | Expected | Command | Status |',
      'expected_fail',
      'characterization',
      'existing_pass',
      '`## Tests After` must reuse every `## Tests Before` ID',
      'Do not replace the table with prose.',
    ]) {
      expect(designPhase).toContain(term);
    }

    expect(outputContract).toContain('| ID | Source | Scenario | Technique | Input | Expected | Command | Status |');
    expect(outputContract).toContain('expected_fail');
    expect(outputContract).toContain('characterization');
    expect(outputContract).toContain('existing_pass');
    expect(outputContract).toContain('`## Tests After` must reuse every before-test ID');
  });

  it('documents Test Quality Gate rows for TDD and UT backfill phases', () => {
    const designPhase = read(DESIGN_PHASE_REFERENCE);

    for (const contract of [designPhase, outputContract]) {
      expect(contract).toContain('## Test Quality Gate');
      expect(contract).toContain('| Metric | Target | Source | Command | Status |');
      expect(contract).toContain(
        '| Tests Before reuse | 100% before IDs reused in Tests After | TDK core | <test command> | pending |',
      );
      expect(contract).toContain(
        '| Rubric dimensions | Happy/EP/BVA/Branch/Error/Deps/State/Regression covered by test IDs or N/A reasons | TDK core | <test command> | pending |',
      );
      expect(contract).toContain(
        '| Numeric cov | Project-defined or N/A reason | routed consumer test skill | <cov command> or - | pending |',
      );
      expect(contract).toContain(
        '| Matrix rows | 100% non-N/A rows implemented | TDK core | <test command> | pending |',
      );
      expect(contract).toContain(
        '| Branch traceability | 100% mapped or N/A reason | TDK core | <test command> | pending |',
      );
      expect(contract).toContain(
        '| Dependency traceability | 100% deps mapped or N/A reason | TDK core | <test command> | pending |',
      );
      expect(contract).not.toContain('pending or N/A: <reason>');
    }
  });

  it('orders Test Quality Gate within TDD and UT backfill phase sections', () => {
    const designPhase = read(DESIGN_PHASE_REFERENCE);
    const designTdd = sliceBetween(designPhase, '### test_mode: tdd', '### test_mode: ut_backfill');
    const designBackfill = sliceBetween(
      designPhase,
      '### test_mode: ut_backfill',
      '### Test Case Completeness Rubric',
    );
    const outputTdd = sliceBetween(
      outputContract,
      'When `test_mode: tdd`',
      'When `test_mode: ut_backfill`',
    );
    const outputBackfill = sliceBetween(
      outputContract,
      'When `test_mode: ut_backfill`',
      'Backfill phases must satisfy traceability before write:',
    );

    for (const tddContract of [designTdd, outputTdd]) {
      expectInOrder(tddContract, ['## Tests After', '## Test Quality Gate', '## Regression Gate']);
    }
    for (const backfillContract of [designBackfill, outputBackfill]) {
      expectInOrder(backfillContract, ['## Test Matrix', '## Test Quality Gate', '## Delegate Skills']);
    }
  });

  it('documents quality gate status, N/A, command, and numeric policy semantics', () => {
    const designPhase = read(DESIGN_PHASE_REFERENCE);

    for (const contract of [designPhase, outputContract]) {
      expect(contract).toContain('Status values: `pending`, `pass`, `fail`, `N/A: <reason>`');
      expect(contract).toContain('A non-applicable row uses `Command: -` and `Status: N/A: <reason>`');
      expect(contract).toContain('Bare `Command: N/A` is invalid');
      expect(contract).toContain(
        'A row can become `pass` only after structural target evidence is satisfied and any runnable command exits 0',
      );
      expect(contract).toContain('Numeric cov source order');
      expect(contract).toContain('routed consumer test skill');
      expect(contract).toContain('Do not invent numeric coverage thresholds');
    }
  });

  it('documents the baseline test case completeness rubric', () => {
    const designPhase = read(DESIGN_PHASE_REFERENCE);

    for (const term of [
      'Test Case Completeness Rubric',
      'Happy',
      'EP',
      'BVA',
      'Branch L\\<n\\>',
      'Error',
      'Deps',
      'State',
      'Regression',
      '`N/A: <reason>`',
      'TDK core owns the baseline coverage rubric',
    ]) {
      expect(designPhase).toContain(term);
    }

    expect(outputContract).toContain('All test-mode phases must apply the Test Case Completeness Rubric');
    expect(outputContract).toContain('Test-mode phases apply the completeness rubric');
    expect(outputContract).toContain(
      'TDD rubric dimensions must cite test IDs or `N/A: <reason>`, not prose-only claims.',
    );
  });

  it('documents backfill traceability from public surfaces to test matrix rows', () => {
    const designPhase = read(DESIGN_PHASE_REFERENCE);

    for (const term of [
      'Backfill traceability rule',
      'Every public export, route, command handler, method, or externally observable behavior',
      'must map to at least one `## Test Matrix` row',
      'Every non-trivial branch listed in `## Code Summary.Branches`',
      'Every dependency listed in `## Mocks & Fixtures Required`',
      'The `Impl` column starts empty during planning',
    ]) {
      expect(designPhase).toContain(term);
    }

    expect(outputContract).toContain('each public export / route / method in `## Code Summary` has at least one `## Test Matrix` row');
    expect(outputContract).toContain('each row has a semantic test ID and leaves `Impl` empty');
  });

  it('asks validation questions about test-mode completeness without legacy ut-plan artifacts', () => {
    expect(validateQuestions).toContain('speckit.test_mode_completeness');
    expect(validateQuestions).toContain('Test Case Completeness Rubric');
    expect(validateQuestions).toContain('trace every public surface to test rows');
    expect(validateQuestions).toContain('do phase files apply the Test Case Completeness Rubric');
    expect(validateQuestions).toContain('Test Quality Gate');
    expect(validateQuestions).toContain('gate row statuses');
    expect(validateQuestions).toContain('numeric coverage policy source');
    expect(validateQuestions).toContain('non-N/A commands');
    expect(validateQuestions).not.toContain('ut-plan.md');
  });

  it('keeps modes reference aligned with Test Quality Gate section shapes', () => {
    expect(modes).toContain('## Test Quality Gate');
    expect(modes).toContain(
      'TDD phases order `## Tests Before`, `## Refactor / Implementation`, `## Tests After`, `## Test Quality Gate`, `## Regression Gate`.',
    );
    expect(modes).toContain(
      'UT backfill phases order `## Code Summary`, `## Mocks & Fixtures Required`, `## Test Matrix`, `## Test Quality Gate`, then `## Delegate Skills` and `## Delegate Agents` when routing injects delegates.',
    );
    expect(modes).toContain('Each delegate section is omitted when its group is empty.');
  });

  it('special-cases test-mode delegate placement after Test Quality Gate', () => {
    const designPhase = read(DESIGN_PHASE_REFERENCE);
    const skillRouting = read(SKILL_ROUTING_REFERENCE);

    for (const contract of [designPhase, skillRouting]) {
      expect(contract).toContain(
        'Non-test phases inject `## Delegate Skills` after `## Key Insights` and before `## Requirements`.',
      );
      expect(contract).toContain(
        'TDD phases inject `## Delegate Skills` after `## Test Quality Gate` and before `## Regression Gate`.',
      );
      expect(contract).toContain(
        'UT backfill phases inject `## Delegate Skills` immediately after `## Test Quality Gate`.',
      );
    }
  });

  it('documents the module ownership guard for backfill planning', () => {
    const designPhase = read(DESIGN_PHASE_REFERENCE);

    expect(designPhase).toContain('never creates sub-workspaces, modules, or source directories');
    expect(designPhase).toContain('/tdk-workspace-layout-propose');
    expect(designPhase).toContain('/tdk-workflow-config-apply');
  });
});
