import { describe, expect, it } from 'bun:test';
import { existsSync, readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';

const IMPLEMENT_SKILL = resolve(
  import.meta.dir,
  '../../../plugins/tdk-core/skills/tdk-implement/SKILL.md',
);
const IMPLEMENT_REFERENCES_DIR = resolve(dirname(IMPLEMENT_SKILL), 'references');
const PROJECT_PHASE_CONTRACT = resolve(IMPLEMENT_REFERENCES_DIR, 'project-and-phase-contract.md');
const SKILLS_GUIDE_EN = resolve(import.meta.dir, '../../../docs/en/guides/skills-guide.md');
const SKILLS_GUIDE_VI = resolve(import.meta.dir, '../../../docs/vi/guides/skills-guide.md');

function read(path: string): string {
  return readFileSync(path, 'utf-8');
}

/**
 * Returns the text from `start` up to, but not including, the first `end` found after it.
 * Without `end` it returns everything from `start` to the end of the text. A missing `start`,
 * or a missing `end` after `start`, throws so a renamed heading fails the test instead of
 * making a negative assertion pass against an empty string.
 */
function section(text: string, start: string, end?: string): string {
  const startIndex = text.indexOf(start);
  if (startIndex < 0) {
    throw new Error(`section start not found: ${start}`);
  }

  if (end === undefined) {
    return text.slice(startIndex);
  }

  const endIndex = text.indexOf(end, startIndex + start.length);
  if (endIndex < 0) {
    throw new Error(`section end not found after start: ${end}`);
  }

  return text.slice(startIndex, endIndex);
}

function extractReferenceLoads(skill: string): string[] {
  return Array.from(skill.matchAll(/Load:\s*`(references\/[^`]+\.md)`/g), (match) => {
    const referencePath = match[1];
    expect(referencePath).toBeDefined();
    return referencePath as string;
  });
}

describe('tdk-implement phase selection contract', () => {
  const implementSkill = read(IMPLEMENT_SKILL);
  const implementReferences = extractReferenceLoads(implementSkill).map((referencePath) =>
    read(resolve(IMPLEMENT_REFERENCES_DIR, referencePath.replace('references/', ''))),
  );
  const implementContract = [implementSkill, ...implementReferences].join('\n');

  it('keeps the entrypoint concise and loads real references', () => {
    expect(implementSkill.split('\n').length).toBeLessThanOrEqual(300);
    expect(implementSkill).toContain('## Required Reference Load Contract');

    for (const referencePath of extractReferenceLoads(implementSkill)) {
      const absolutePath = resolve(IMPLEMENT_REFERENCES_DIR, referencePath.replace('references/', ''));

      expect(existsSync(absolutePath), `${referencePath} should exist`).toBe(true);
      expect(read(absolutePath).split('\n')[0]).not.toStartWith('<!-- DO NOT LOAD');
    }
  });

  it('parses args before task-id validation', () => {
    const parseStep = implementSkill.indexOf('### Step 0 — Parse Args');
    const validateStep = implementSkill.indexOf('### Step 0.1 — Validate Task ID');

    expect(parseStep).toBeGreaterThanOrEqual(0);
    expect(validateStep).toBeGreaterThan(parseStep);
    expect(implementContract).toContain('TASK_ID = first positional token');
    expect(implementContract).toContain('PHASE_FILTER = optional numeric value');
    expect(implementContract).toContain('PHASE_FILTER_PRESENT = true when --phase is provided');
  });

  it('documents accepted phase forms and early rejects invalid arguments', () => {
    for (const term of [
      '--phase NN',
      '--phase=NN',
      'unknown flags',
      'duplicate --phase',
      'missing value',
      'non-numeric value',
      'negative value',
      'extra positional tokens',
    ]) {
      expect(implementContract).toContain(term);
    }
  });

  it('accepts phase zero because plan numbering allows it', () => {
    expect(implementContract).toContain('Normalize `PHASE_FILTER` to a non-negative number');
    expect(implementContract).not.toContain('non-positive value');
    expect(implementContract).not.toContain('to a positive number');
  });

  it('validates only the cleaned task id', () => {
    expect(implementContract).toContain('Invoke `tdk-validate-task-id` with cleaned `TASK_ID`');
    expect(implementContract).toContain('not raw `$ARGUMENTS`');
    expect(implementContract).not.toContain('Invoke `tdk-validate-task-id` with `$ARGUMENTS`');
  });

  it('resolves selected phases from parsed rows after global recovery', () => {
    const recovery = implementSkill.indexOf('### Step 4: F3 Recovery Gate');
    const targetRows = implementSkill.indexOf('### Step 5: Resolve Target Rows');

    expect(recovery).toBeGreaterThanOrEqual(0);
    expect(targetRows).toBeGreaterThan(recovery);
    expect(implementContract).toContain('TARGET_ROWS');
    expect(implementContract).toContain('PHASE_FILTER_PRESENT');
    expect(implementContract).toContain('rows.filter(row => row.number === PHASE_FILTER)');
  });

  it('does not use phase number truthiness for selected mode', () => {
    expect(implementContract).toContain('PHASE_FILTER_PRESENT ? rows.filter(row => row.number === PHASE_FILTER) : rows');
    expect(implementContract).not.toContain('PHASE_FILTER ? rows.filter(row => row.number === PHASE_FILTER) : rows');
  });

  it('checks dependencies by phase number, not array index', () => {
    expect(implementContract).toContain('phaseByNumber = new Map(rows.map(row => [row.number, row]))');
    expect(implementContract).toContain('phaseByNumber.get(id)');
    expect(implementContract).not.toContain('rows[id].status');
  });

  it('keeps targeted mode serial and preserves global stale in_progress recovery', () => {
    expect(implementContract).toContain('scan all rows');
    expect(implementContract).toContain('default and selected modes remain serial');
    expect(implementContract).toContain('Step 6 reports them and STOPs before any canary or status write');
  });

  it('previews the run without asking about scope', () => {
    const skillStep6 = section(implementSkill, '### Step 6: Print the Execution Preview', '### Step 6A');
    const referenceStep6 = section(read(PROJECT_PHASE_CONTRACT), '## Step 6 - Execution Preview');

    expect(skillStep6).not.toContain('AskUserQuestion');
    expect(referenceStep6).not.toContain('AskUserQuestion');
    expect(implementContract).not.toContain('Yes execute');
    expect(implementContract).not.toContain('Confirm Before Executing');
    expect(implementContract).not.toContain('before this confirmation');
  });

  it('prints the preview as one line of text before execution starts', () => {
    const skillStep6 = section(implementSkill, '### Step 6: Print the Execution Preview', '### Step 6A');

    expect(skillStep6).toContain('`Execution preview ({label}): {TASK_ID}, phases {numbers}`');
    expect(skillStep6).toContain('one line of plain text');
    expect(skillStep6).toContain('never skip it');
    expect(skillStep6).toContain('never leave it in thinking or tool output');
    expect(skillStep6).toContain('whose status is `todo`');
    expect(skillStep6).not.toContain('Status preflight:');
    expect(skillStep6).not.toContain('BlockedBy:');
  });

  it('keeps the preview template in one place', () => {
    const contract = read(PROJECT_PHASE_CONTRACT);

    expect(contract).not.toContain('Execution preview ({label})');
    expect(contract).not.toContain('Status preflight: {feature_status}');
  });

  it('anchors the preview to the message that starts execution', () => {
    const step6A = section(implementSkill, '### Step 6A', '### Step 6.1');
    const step7 = section(implementSkill, '### Step 7:', '#### 7A');

    expect(step6A).toContain('starts with the Step 6 preview line');
    expect(step7).toContain('starts with the Step 6 preview line');
  });

  it('anchors the preview on the parallel path when branch preflight is skipped', () => {
    const parallelStep = section(implementSkill, '### Step 6.1', '### Step 7:');

    expect(parallelStep).toContain('Step 6A was skipped');
    expect(parallelStep).toContain('starts with the Step 6 preview line');
  });

  it('stops a parallel run on a stale phase before any dispatch', () => {
    const referenceStep6 = section(read(PROJECT_PHASE_CONTRACT), '## Step 6 - Execution Preview');

    expect(referenceStep6).toContain('STOP before branch preflight, canaries, and any status write');
    expect(referenceStep6).toContain('--phase {NN}');
  });

  it('states the next step in the F3 question', () => {
    expect(implementContract).toContain('must state what the run does next');
    expect(implementContract).toContain('end the run with nothing executed');
    expect(implementContract).toContain('reruns with --phase {row.number}');
  });

  it('asks about one stale row per question', () => {
    const f3Gate = section(read(PROJECT_PHASE_CONTRACT), '## Step 4 - F3 Recovery Gate', '## Step 5');

    expect(f3Gate).toContain('one stale row per AskUserQuestion call');
    expect(f3Gate).toContain('never batch rows');
  });

  it('keeps the decision gates that still ask the user', () => {
    expect(implementContract).toContain('Only a real current AskUserQuestion answer');
    expect(implementContract).toContain('Use AskUserQuestion with Retry this phase, Mark done, Mark skipped, and Cancel');
    expect(implementContract).toContain('Use AskUserQuestion before any apply');
    expect(implementContract).toContain('AskUserQuestion with `Approve result`');
  });

  it('limits activation to an explicit request and forwards a named phase', () => {
    const description = implementSkill.split('\n').find((line) => line.startsWith('description:'));

    expect(description, 'SKILL.md frontmatter description line').toBeDefined();
    expect(description).toContain('explicitly asks');
    expect(description).toContain('--phase NN');
  });

  it('describes the default scope as row order up to an unfinished blocker', () => {
    const description = implementSkill.split('\n').find((line) => line.startsWith('description:'));

    expect(description, 'SKILL.md frontmatter description line').toBeDefined();
    expect(description).toContain('stopping at an unfinished blocker');
    expect(description).not.toContain('every runnable');
    expect(read(SKILLS_GUIDE_EN)).toContain('stopping at an unfinished blocker');
    expect(read(SKILLS_GUIDE_VI)).toContain('dừng ở blocker chưa xong');
  });

  it('prints rerun commands that keep the selected phase and flags', () => {
    expect(implementContract).toContain('Every rerun command this skill prints carries RERUN_FLAGS');
    expect(implementContract).toContain('Recover it with /tdk-implement {TASK_ID} --phase NN {RERUN_FLAGS}');
    expect(implementContract).toContain('--phase {NN} {RERUN_FLAGS} to recover it');
    expect(implementContract).toContain('then rerun /tdk-implement {TASK_ID} --phase NN {RERUN_FLAGS}');
    expect(implementContract).toContain('Fix readiness and rerun /tdk-implement {TASK_ID} with the same arguments as this run');
    expect(implementContract).toContain('before rerunning `/tdk-implement` with `--phase NN`');

    expect(implementContract).not.toContain('then rerun /tdk-implement {TASK_ID}.');
    expect(implementContract).not.toContain('Fix readiness and rerun /tdk-implement {TASK_ID}.');
    expect(implementContract).not.toContain('Recover as described above');
  });

  it('never runs a printed command or a blocker on its own', () => {
    expect(implementContract).toContain('never execute the printed command in this invocation');
    expect(implementContract).toContain('never execute it in this invocation');
    expect(implementContract).toContain('never run phase MM in this invocation');
  });

  it('never falls back to all phases when a request names several phases', () => {
    expect(implementSkill).toContain('never falls back to all phases');
    expect(implementSkill).toContain('list the `--phase NN` commands and STOP');
  });

  it('sends script errors to the error handling block', () => {
    const scopePromptBullet = section(implementSkill, '- **No scope prompt**', '- **Parallel path**');

    expect(scopePromptBullet).toContain('a script error follows Error Handling above');
  });

  it('handles stale rows differently in serial and parallel mode', () => {
    expect(implementContract).toContain('serial mode enters the F3 recovery gate');
    expect(implementContract).toContain('parallel mode skips the PRE-LOOP scan');
    expect(implementContract).not.toContain('The only difference is the status write');
  });
});
