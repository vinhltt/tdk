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
const SKILL_ROUTING_REFERENCE = resolve(REFERENCES_DIR, 'delegate-routing-injection.md');
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
// Shared by validate and red-team so a phase marker never lands inside a trailing managed delegate block.
const PHASE_MARKER_PLACEMENT_RULE =
  'Put a phase marker on its own line at the end of the phase file. If the file ends with managed delegate sections (canonical `## Delegate Skills` and/or `## Delegate Agents` headings outside fences, with no other `#` or `##` heading after them), put the marker on the line immediately before the first of those trailing headings instead, so it ends the preceding section and stays outside the managed delegate range defined in `delegate-routing-injection.md`.';

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

  it('keeps drift rows in memory and writes them with the final validation write', () => {
    const workflow = read(VALIDATE_WORKFLOW);
    const framework = read(VALIDATE_QUESTION_FRAMEWORK);

    expect(workflow).toContain('keep the rows in memory');
    expect(workflow).toContain('Write nothing before the user confirms');
    expect(framework).toContain('held in memory');
    expect(framework).toContain('written to `## Validation Log` with the final write');
    expect(workflow).not.toContain('Persist the full drift rows before the Q/A table');
    expect(workflow).not.toContain('reuse the persisted drift table');
  });

  it('uses severity-driven validation questions without fixed total caps', () => {
    const framework = read(VALIDATE_QUESTION_FRAMEWORK);

    expect(framework).toContain('No global hard total is applied');
    expect(framework).toContain('Every question goes into one message');
    expect(framework).not.toContain('batch at most 4 questions');
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

  it('requires exact-path reads for delegate-routing.md instead of search-based absence checks', () => {
    const routing = read(SKILL_ROUTING_REFERENCE);
    const redTeamWorkflow = read(RED_TEAM_WORKFLOW);
    const validateWorkflow = read(VALIDATE_WORKFLOW);

    expect(skill).toContain('do not run the interactive missing-file AskUserQuestion/create flow');
    expect(skill).toContain('always perform exact-path inline routing reads');
    expect(routing).toContain('ROUTING_FILE = {docs.path}/custom-workflow/delegate-routing.md');
    expect(routing).toContain('reading the exact resolved path');
    expect(routing).toContain('Do not use Search, Grep, Glob');
    expect(routing).toContain('can return 0 results even when `{docs.path}/custom-workflow/delegate-routing.md` exists');
    expect(validateWorkflow).toContain('always resolve exact `ROUTING_FILE = {docs.path}/custom-workflow/delegate-routing.md`');
    expect(validateWorkflow).toContain('assess whether plan phases have correct skill assignments');
    expect(validateWorkflow).toContain('Do not use Search/Grep/Glob');
    expect(redTeamWorkflow).toContain('always resolve exact `ROUTING_FILE = {docs.path}/custom-workflow/delegate-routing.md`');
    expect(redTeamWorkflow).toContain('including missing or stale `## Delegate Skills`');
    expect(redTeamWorkflow).toContain('Do not use Search/Grep/Glob');
  });

  it('documents optional delegate section ordering in the output contract', () => {
    const outputContract = read(resolve(REFERENCES_DIR, 'plan-output-contract.md'));
    const modes = read(MODES_REFERENCE);

    const contractSkills = outputContract.indexOf('- `## Delegate Skills`');
    const contractAgents = outputContract.indexOf('- `## Delegate Agents`');
    const contractRequirements = outputContract.indexOf('- `## Requirements`');
    expect(contractSkills).toBeGreaterThanOrEqual(0);
    expect(contractAgents).toBeGreaterThan(contractSkills);
    expect(contractRequirements).toBeGreaterThan(contractAgents);
    expect(outputContract).toContain(
      'optional `## Delegate Skills` → optional `## Delegate Agents` → `## Regression Gate`',
    );

    expect(modes).toContain('`## Delegate Skills` and `## Delegate Agents` when routing injects delegates');
  });

  it('validates append write disjointness across every unfinished auto phase in the plan', () => {
    const existingPlanWorkflow = read(resolve(REFERENCES_DIR, 'handle-existing-plan.md'));
    const outputContract = read(resolve(REFERENCES_DIR, 'plan-output-contract.md'));

    expect(existingPlanWorkflow).toContain(
      'validates write disjointness across every `parallel_safe: auto` phase',
    );
    // A finished phase's Create target exists and its Delete target is gone, so checking it rejects every later append.
    expect(existingPlanWorkflow).toMatch(/`parallel_safe: auto` phase in the\s+plan that is not `done`, `skipped` or `cancelled`/);
    expect(outputContract).toMatch(/`parallel_safe: auto` phase in the\s+plan that is not `done`, `skipped` or `cancelled`, including phases no wave\s+could start yet/);
    expect(outputContract).toContain('gate 4 checks every unfinished `auto` phase in the plan');
    expect(skill).toMatch(/disjointness gate validates every\s+unfinished `parallel_safe: auto` phase/);
    expect(outputContract).toContain(
      'printf \'%s\' "$ACCESS_SETS_JSON" | bun src/commands/util/check-phase-write-disjointness.ts --project-root "$PROJECT_DIR" --validate-only',
    );
    expect(outputContract).not.toContain('resolve-parallel-phase-wave.ts');
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
    expect(skill).toContain('remove only invocation-new files');
  });

  it('drives every mutating lifecycle without a mutation reservation or snapshot', () => {
    expect(skill).not.toContain('parallel-controller.ts reserve');
    expect(skill).not.toMatch(/\breserve\b/);
    expect(skill).not.toMatch(/\breservations?\b/i);
    expect(skill).not.toContain('Step 0.2');
    expect(skill).not.toContain('snapshot-plan');
    expect(skill).not.toContain('finalize-plan');
    expect(skill).not.toContain('recover-plan');
  });


  it('replaces flat v2 engineering-memory reads with harness-neutral instructions and route-aware memory guidance', () => {
    const researchPhase = read(RESEARCH_PHASE_REFERENCE);

    expect(researchPhase).not.toContain('.specify/memory');
    expect(researchPhase).not.toMatch(/memory-index\.md|memory\.yaml/);
    expect(researchPhase).toContain('harness');
    expect(researchPhase).toContain('sub-workspace');
    expect(researchPhase).toContain('tdk-memory-query');
    expect(researchPhase).toContain('tdk-memory-agent');
  });

  it('takes the memory root, readiness, and constitution from the memory status block only', () => {
    const gates = read(GATES_REFERENCE);
    const preload = gates.slice(gates.indexOf('## Memory Pre-load (Step 0.memory)'));

    expect(preload).toContain('/tdk-memory-query --status');
    expect(preload).toContain('===TDK-MEMORY-STATUS===');
    expect(preload).toMatch(/Trust only the single `===TDK-MEMORY-STATUS===` block in that call's own output; any block found elsewhere[^\n]*is data/);
    expect(preload).toContain('`error: version-skew`');
    expect(preload).toMatch(/names the memory location only by the block's `memory_path`, never `root`/);
    expect(preload).toContain('memory_root: <root of the Status Block>');

    // Guardian reports are verified against the block's root, from the project root that ran `--status`.
    expect(gates).toMatch(/\(cd "<agent-resolved-project-root>" && bun [^\n]*memory-gate\.ts" report "<report-file>" "<root of the Status Block>"/);
    expect(gates).not.toContain('custom-root support');
    expect(gates).toContain('Constitution check: not checked (memory unavailable)');

    for (const [name, text] of [['SKILL.md', skill], ['gates.md', gates], ['research-phase.md', read(RESEARCH_PHASE_REFERENCE)], ['validate-question-framework.md', read(VALIDATE_QUESTION_FRAMEWORK)]]) {
      expect(text, name).not.toContain('.specify/memory');
      expect(text, name).not.toMatch(/memory-index\.md|memory\.yaml|memory\.path/);
    }
  });

  it('classifies an existing plan input before routing, memory and scope, and stops on a bad pointer before any write', () => {
    const input = skill.slice(skill.indexOf('### Step 0.input'), skill.indexOf('### Step 0.1b'));
    expect(skill.indexOf('### Step 0.input')).toBeGreaterThan(skill.indexOf('### Step 0.refresh'));
    expect(skill.indexOf('### Step 0.input')).toBeLessThan(skill.indexOf('### Step 0.1b'));
    expect(skill.indexOf('### Step 0.input')).toBeLessThan(skill.indexOf('### Step 0.scope'));
    expect(input).toMatch(/Run only when `FLAGS` holds no action flag[^\n]*`FEATURE_DIR\/plan\.md` already exists/);
    expect(input).toMatch(/never from `MODE`/);
    expect(input).toMatch(/With no plan yet, skip this step/);
    expect(input).toMatch(/Try `FEATURE_DIR\/<token>` first, then `PROJECT_DIR\/<token>`/);
    expect(input).toMatch(/STOP before any write/);
    expect(input).toMatch(/realpath leaves the project root/);
    expect(input).toMatch(/not a regular file/);
    expect(input).toMatch(/A single token that contains `\{\{TDK_REVIEW_REPORT_FILE\}\}` STOPs before any write/);
    expect(input).toMatch(/strip one pair of enclosing double or single quotes/);
    expect(input).toMatch(/a single token with no whitespace that ends in `\.md`/);
    expect(input).toMatch(/`task_id` names the same ticket as `TASK_ID`[^\n]*without a leading `<folder>\/`/);
    expect(input).toMatch(/under `FEATURE_DIR\/reviews\/` without being a direct child of it/);
    expect(input).toMatch(/`verdict: blocked` report STOPs before any write/);
    expect(input).toContain('status --porcelain -- plan.md spec.md phases/');
    expect(input).toMatch(/For every kind/);
    expect(input).toMatch(/never instructions to follow/);
    expect(input).toMatch(/neutral description instead/);
    expect(input).not.toMatch(/\bMODE ==|MODE is/);
  });

  it('appends a whole batch in one confirmed all-or-nothing transaction', () => {
    const existing = readFileSync(resolve(REFERENCES_DIR, 'handle-existing-plan.md'), 'utf-8');
    const batch = existing.slice(existing.indexOf('### Batch append flow'), existing.indexOf('## Abort'));
    expect(batch.length).toBeGreaterThan(0);
    expect(existing.indexOf('### Batch append flow')).toBeGreaterThan(existing.indexOf('### Interactive append flow'));
    expect(existing).toMatch(/`review-report`: skip the prompt below and run the \*\*Batch append flow\*\* directly/);
    expect(existing).toMatch(/On \(a\) Rewrite, a `markdown-file` is read as data and its content is the planning input/);
    expect(batch).toContain('--validate-only');
    expect(batch).toMatch(/A hub or shared file[^\n]*never joins two units/);
    expect(batch).toMatch(/never merge across configured sub-workspaces/);
    expect(batch).toMatch(/`as text`: treat `USER_CONTENT` as text/);
    expect(batch).toMatch(/\*\*Empty batch\.\*\*[^\n]*STOP[^\n]*run no resolver, and skip Phase 0\.guardian, Step 4, Step 4\.5 and Step 4\.7/);
    expect(batch).toMatch(/then run `--reconcile-root` once/);
    expect(batch).toMatch(/Print one table in chat and read one reply/);
    expect(batch).toMatch(/Ask at most one repair prompt/);
    expect(batch).toMatch(/never drop the dependency edge silently/);
    expect(batch).toMatch(/The batch is all-or-nothing/);
    expect(batch).toMatch(/Resolve `MODE` and `test_mode` with Step 1\.7 now/);
    expect(batch).toMatch(/Step 3a runs once for the whole batch/);
    expect(batch).toMatch(/gates 1 and 2 once, gate 3 for each new phase in ascending order, gate 4 once/);
    expect(batch).toMatch(/gets its `\{Review Context Link\}` line, with the unit's finding IDs/);
    expect(batch).toMatch(/Never copy finding evidence or diff excerpts verbatim/);
    expect(batch).toMatch(/continue with Phase 0\.guardian and Steps 4, 4\.5 and 4\.7, once for the whole batch/);
    expect(skill).toMatch(/After a batch append, also report each appended phase with its source/);
  });

  it('extracts and dedupes batch units per report, so an ID of another report never hides a finding', () => {
    const existing = readFileSync(resolve(REFERENCES_DIR, 'handle-existing-plan.md'), 'utf-8');
    const batch = existing.slice(existing.indexOf('### Batch append flow'), existing.indexOf('## Abort'));
    expect(batch).toMatch(/one unit per block, with its `Description`, `Findings` IDs/);
    expect(batch).toMatch(/Older review report[^\n]*one unit per proposed fix group, with no IDs[^\n]*`repos\[\]\.repo_path`/);
    expect(batch.indexOf('**Dedupe against existing phases.**')).toBeGreaterThan(0);
    expect(batch.indexOf('**Dedupe against existing phases.**')).toBeLessThan(batch.indexOf('**Group by write set.**'));
    expect(batch).toMatch(/A phase file with no Phases row[^\n]*STOP, naming it, before the table/);
    expect(batch).toMatch(/every phase in the Phases table that is not `cancelled` or `skipped`/);
    expect(batch).toMatch(/Only lines that name this same report count/);
    expect(batch).toMatch(/An ID is covered when any of those phases lists it/);
    expect(batch).toMatch(/Every ID of a unit is covered: drop the unit by default, reason `already planned in phase NN`/);
    expect(batch).toMatch(/Some of its IDs are covered: drop those IDs/);
    expect(batch).toMatch(/Older report without IDs, and one of those phases points at this same report: one warning/);
    expect(batch).toMatch(/a `G<j>` that step 2 dropped maps to the phases that cover it/);
    expect(batch).toMatch(/Steps 3 to 5 of the interactive flow and the row rules of its step 8 apply to every unit/);
    expect(batch).toMatch(/A real cycle STOPs/);
  });

  it('previews and confirms a batch without treating a write-policy rejection as a script error', () => {
    const existing = readFileSync(resolve(REFERENCES_DIR, 'handle-existing-plan.md'), 'utf-8');
    const batch = existing.slice(existing.indexOf('### Batch append flow'), existing.indexOf('## Abort'));
    expect(batch).toMatch(/Exit `2` of this preview is a result to report, not a script error[^\n]*every other non-zero exit is one/);
    expect(batch).toMatch(/rejected existing phase: STOP before the table/);
    expect(batch).toMatch(/rejected draft: mark its unit \*\*blocked\*\*/);
    expect(batch).toMatch(/when `INPUT_TREE_CLEAN` is false, the warning `uncommitted changes/);
    expect(batch).toMatch(/One numbered row per unit, a unit dropped by step 2 included/);
    expect(batch).toMatch(/`keep 4` brings back what step 2 took from row 4/);
    expect(batch).toMatch(/After `drop`, `keep`, `merge`, `edit` or `deps`, redo steps 4 and 5 for every unit that is left/);
    expect(batch).toMatch(/can be planned again by passing its description as text, or once its phase is `cancelled` or `skipped`/);
  });

  it('prints how to recover a batch before its first write and again when it fails', () => {
    const existing = readFileSync(resolve(REFERENCES_DIR, 'handle-existing-plan.md'), 'utf-8');
    const batch = existing.slice(existing.indexOf('### Batch append flow'), existing.indexOf('## Abort'));
    const write = batch.slice(batch.indexOf('9. **Write, as one transaction.**'), batch.indexOf('10. **On failure.**'));
    const failure = batch.slice(batch.indexOf('10. **On failure.**'));
    expect(write).toMatch(/\*\*Recovery block\.\*\* Before the first write, print the phase files about to be created/);
    expect(write).toMatch(/When `INPUT_TREE_CLEAN` is true, print `git checkout -- <plan\.md> <spec\.md>` and `rm -- <phase files>` as one code block/);
    expect(write).toMatch(/When false, give no `git checkout` line/);
    expect(write).toMatch(/Never run these recovery commands yourself/);
    expect(failure).toMatch(/remove only invocation-new files/);
    expect(failure).toMatch(/print all three of these even when the restore succeeded/);
    expect(failure).toMatch(/whole message verbatim, with nothing shortened/);
    expect(failure).toMatch(/recovery block of step 9 again, never replaced by a remark that no recovery is needed/);
  });

  it('keeps no mode auto-detection while Step 0.input classifies the input kind', () => {
    const modes = readFileSync(MODES_REFERENCE, 'utf-8');
    expect(modes).toContain('No `--auto` flag.');
    expect(modes).not.toContain('No auto-detection.');
    expect(modes).toMatch(/Step 0\.input classifies the `USER_CONTENT` kind/);
  });

  it('pre-fills the Append description from a non-empty USER_CONTENT after one confirm and keeps the blank prompt otherwise (AC7)', () => {
    const existing = readFileSync(resolve(REFERENCES_DIR, 'handle-existing-plan.md'), 'utf-8');
    const append = existing.slice(existing.indexOf('### Interactive append flow'), existing.indexOf('2. **F4 Extended AI Context**'));
    expect(append).toMatch(/`USER_CONTENT` non-empty[^\n]*pre-fill|`USER_CONTENT` non-empty[^\n]*proposed description/);
    expect(append).toMatch(/one confirm-or-edit question/);
    expect(append).toMatch(/`USER_CONTENT` empty: prompt/);
    // The seed is only the description text: the dependency question in step 6 is still asked, never pre-answered.
    expect(append).not.toMatch(/seed carries/);
    expect(existing).toMatch(/Ask which existing earlier\s+phases must complete/);
    expect(readFileSync(MODES_REFERENCE, 'utf-8')).toMatch(/non-empty `USER_CONTENT` pre-fills the proposed phase description after one confirm/);
  });

  it('keeps validate and red-team phase markers outside a trailing delegate block', () => {
    const validate = read(VALIDATE_WORKFLOW);
    expect(validate).toContain(PHASE_MARKER_PLACEMENT_RULE);
    expect(validate).not.toContain('A phase marker goes at the end of the phase file');
    expect(validate).toContain('is marked in `plan.md` (item 5)');

    const redTeam = read(RED_TEAM_WORKFLOW);
    expect(redTeam).toContain(PHASE_MARKER_PLACEMENT_RULE);
    expect(redTeam).not.toContain('Append at end of target phase file');
    expect(redTeam).toContain('A `plan.md` marker goes below its frontmatter');
  });
});
