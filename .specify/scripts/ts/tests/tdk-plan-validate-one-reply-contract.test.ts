import { describe, expect, it } from 'bun:test';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const PLAN_SKILL_DIR = resolve(import.meta.dir, '../../../plugins/tdk-core/skills/tdk-plan');

function read(relativePath: string): string {
  return readFileSync(resolve(PLAN_SKILL_DIR, relativePath), 'utf-8');
}

function countOccurrences(text: string, needle: string): number {
  return text.split(needle).length - 1;
}

// Returns the Step 4.7 section of SKILL.md, up to the next heading of the same or higher level.
function extractStep47(skill: string): string {
  const start = skill.indexOf('### Step 4.7');
  expect(start).toBeGreaterThanOrEqual(0);
  const rest = skill.slice(start + 1);
  const nextHeading = rest.search(/\n#{2,3} /);
  return nextHeading === -1 ? skill.slice(start) : skill.slice(start, start + 1 + nextHeading);
}

const workflow = read('references/validate-workflow.md');
const framework = read('references/validate-question-framework.md');
const outputContract = read('references/plan-output-contract.md');
const skill = read('SKILL.md');

const SOURCE_VALUES = [
  '`counsel, accepted`',
  '`counsel, implied`',
  '`user override`',
  '`user skip`',
  '`user (no counsel)`',
];

describe('tdk-plan --validate one-reply contract', () => {
  it('consults tdk-counsel once, with instructions outside the data fence', () => {
    const tableHeader = '| # | letter | reason | file:line | needs-human |';
    const fence = '=== CALLER CONTEXT ===';

    expect(workflow).toContain('Consult `tdk-counsel` once');
    expect(workflow).toContain(tableHeader);
    expect(workflow).toContain('The counsel must not choose option D');
    expect(workflow).toContain('Retry the consult once with a stricter format prompt');
    expect(workflow).toContain('no recommendation');
    expect(countOccurrences(workflow, fence)).toBeGreaterThanOrEqual(2);

    // The counsel charter treats fenced material as data, so the output format must come before the fence.
    const tableIndex = workflow.indexOf(tableHeader);
    const fenceIndex = workflow.indexOf(fence);
    expect(tableIndex).toBeGreaterThanOrEqual(0);
    expect(fenceIndex).toBeGreaterThanOrEqual(0);
    expect(tableIndex).toBeLessThan(fenceIndex);
  });

  it('asks every question in one message and reads one reply', () => {
    expect(workflow).toContain('Ask every validation question in one message');
    expect(workflow).toContain('| V | Question | Recommended | Why (evidence) |');
    expect(workflow).toContain('needs your call');
    expect(workflow).toContain('Ask at most one repair prompt');
    expect(workflow).toContain('Validation stopped — nothing written.');
    for (const source of SOURCE_VALUES) {
      expect(workflow).toContain(source);
    }
  });

  it('writes nothing before confirmation and writes the plan once', () => {
    expect(workflow).toContain('Write nothing before the user confirms');
    expect(workflow).toContain('Discard takes effect in the final write');
    expect(workflow).toContain('Re-read `plan.md` and every phase file before writing');
    expect(workflow).toContain('Increment `validation_session` once, in the final write');
    expect(workflow).toContain('Remove `validation_cursor` from the frontmatter');
    expect(countOccurrences(workflow, 'validation_cursor')).toBe(1);
  });

  it('drops batching, resume, trust-ask, and partial sessions', () => {
    for (const text of [workflow, framework]) {
      for (const retired of [
        'batch at most 4',
        'Stop - mark partial',
        '(partial)',
        'Continue with next batch',
        'Trust-ask',
        '`partial`',
        '| partial',
      ]) {
        expect(text).not.toContain(retired);
      }
    }
    expect(workflow).not.toContain('AskUserQuestion');
    for (const text of [framework, outputContract, skill]) {
      expect(text).not.toContain('validation_cursor');
    }
    expect(skill).not.toContain('batch in groups of 4');
    expect(skill).not.toContain('trust-ask');
  });

  it('asks the Step 4.7 opt-in before checking for an old in-progress session', () => {
    const step47 = extractStep47(skill);
    const optInIndex = step47.indexOf('Run validation interview? [y/N]');
    const legacyIndex = step47.indexOf('(in-progress)');

    expect(optInIndex).toBeGreaterThanOrEqual(0);
    expect(legacyIndex).toBeGreaterThanOrEqual(0);
    expect(optInIndex).toBeLessThan(legacyIndex);
  });

  it('sends review actions past routing setup, the scope interview, and the existing-plan prompt', () => {
    const handleExisting = read('references/handle-existing-plan.md');

    expect(skill).toContain('BR -->|no| RV{--red-team / --validate?}');
    expect(skill).toContain('RV -->|yes| M');
    expect(skill).toContain('RV -->|no| IN[Step 0.input Classify Input]');
    expect(skill).toContain('IN --> B2[Step 0.1b Load Skill Routing]');
    expect(skill).toContain('`--red-team` / `--validate` never reach this step (see Step 1.7)');
    expect(handleExisting).toContain('`--red-team` / `--validate` never reach this step');
    expect(workflow).toContain('If `{FEATURE_DIR}/plan.md` does not exist, STOP');
    expect(skill).toContain('When `--red-team` or `--validate` is present, `MODE` is that action, whatever the speed flag');
  });

  it('waits for every reply and guards the single plan write', () => {
    const optInIndex = workflow.indexOf('## 0. Opt-in (Step 4.7 only)');
    const legacyIndex = workflow.indexOf('## 1. Legacy Session Check');
    expect(optInIndex).toBeGreaterThanOrEqual(0);
    expect(optInIndex).toBeLessThan(legacyIndex);

    expect(workflow).toContain('make no tool calls until the user replies, and never assume a reply, including in auto mode');
    expect(workflow).toContain('at a `;` followed by a V-id, and right before every `Vn:` or `Vn=`');
    expect(workflow).toContain('`stop` anywhere outside a `Vn:` answer');
    expect(workflow).toContain('When the rest is `yes`, `ok`, or `recommended`, it takes that question\'s recommendation');
    expect(workflow).toContain('where `{K}` is a discarded session number from section 1');
    expect(workflow).toContain('mktemp');
    expect(workflow).toContain('Every difference must come from items 1–6');
    expect(workflow).toContain('{consulted | retried | unavailable}');
  });

  it('letters every question A to C with D as the skip option', () => {
    expect(framework).toContain('D is always `Skip this question`');
    expect(workflow).toContain('Copy every option label verbatim from the framework');
    expect(framework).toContain('Every question goes into one message');
  });
});
